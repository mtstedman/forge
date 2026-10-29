<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Closure;
use Forge\Api\Repository\ConsultationRequestRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use RuntimeException;

final class PublicConsultationRequestController
{
    private const NAME_MAX = 80;
    private const PHONE_MAX = 64;
    private const EMAIL_MAX = 254;
    private const MESSAGE_MAX = 5000;
    private const CAPTCHA_TOKEN_MAX = 2048;
    private const BEST_TIMES = ['Morning', 'Midday', 'Afternoon', 'Evening'];

    private readonly Closure $captchaVerifier;

    public function __construct(
        private readonly ConsultationRequestRepository $consultations,
        callable $captchaVerifier,
    ) {
        $this->captchaVerifier = Closure::fromCallable($captchaVerifier);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = $request->getParsedBody();
        if (!is_array($input)) {
            $input = [];
        }

        $fields = [];

        $name = self::cleanText($input['name'] ?? null, false);
        if ($name === null || $name === '' || mb_strlen($name, 'UTF-8') > self::NAME_MAX) {
            $fields['name'] = sprintf('Name is required and must be at most %d characters.', self::NAME_MAX);
        }

        $phone = self::cleanText($input['phone'] ?? null, false);
        if ($phone === null || $phone === '' || mb_strlen($phone, 'UTF-8') > self::PHONE_MAX) {
            $fields['phone'] = sprintf('Phone is required and must be at most %d characters.', self::PHONE_MAX);
        }

        $email = null;
        if (array_key_exists('email', $input)) {
            $email = self::cleanText($input['email'], false);
            if ($email === null) {
                $fields['email'] = 'Email must be a string.';
            } elseif ($email === '') {
                $email = null;
            } elseif (mb_strlen($email, 'UTF-8') > self::EMAIL_MAX || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
                $fields['email'] = sprintf('Email must be valid and at most %d characters.', self::EMAIL_MAX);
            }
        }

        $bestTime = self::cleanText($input['best_time'] ?? null, false);
        if ($bestTime === null || !in_array($bestTime, self::BEST_TIMES, true)) {
            $fields['best_time'] = 'Must be Morning, Midday, Afternoon, or Evening.';
        }

        $message = '';
        if (array_key_exists('message', $input)) {
            $message = self::cleanText($input['message'], true);
            if ($message === null || mb_strlen($message, 'UTF-8') > self::MESSAGE_MAX) {
                $fields['message'] = sprintf('Message must be a string of at most %d characters.', self::MESSAGE_MAX);
            }
        }

        if (($input['consent'] ?? null) !== true) {
            $fields['consent'] = 'Consent must be accepted.';
        }

        $captchaToken = self::cleanText($input['captcha_token'] ?? null, false);
        if ($captchaToken === null || $captchaToken === '' || mb_strlen($captchaToken, 'UTF-8') > self::CAPTCHA_TOKEN_MAX) {
            $fields['captcha_token'] = sprintf('CAPTCHA token is required and must be at most %d characters.', self::CAPTCHA_TOKEN_MAX);
        }

        if ($fields !== []) {
            return self::validationError($response, $fields);
        }

        try {
            $verified = ($this->captchaVerifier)($captchaToken);
        } catch (RuntimeException) {
            return self::json($response, ['error' => 'CAPTCHA verification is unavailable.'], 503);
        }

        if ($verified !== true) {
            return self::validationError($response, ['captcha_token' => 'CAPTCHA verification failed.']);
        }

        $this->consultations->create([
            'name' => $name,
            'phone' => $phone,
            'email' => $email,
            'best_time' => $bestTime,
            'message' => $message,
        ]);

        return self::json($response, ['status' => 'pending'], 201);
    }

    /**
     * Strips control characters and trims. Multiline text preserves newlines and
     * tabs after normalising CRLF/CR to LF. Invalid types and UTF-8 return null.
     */
    private static function cleanText(mixed $value, bool $multiline): ?string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
            return null;
        }

        if ($multiline) {
            $value = str_replace(["\r\n", "\r"], "\n", $value);
            $pattern = '/[\x{0000}-\x{0008}\x{000B}-\x{001F}\x{007F}-\x{009F}]/u';
        } else {
            $pattern = '/[\x{0000}-\x{001F}\x{007F}-\x{009F}]/u';
        }

        $clean = preg_replace($pattern, '', $value);

        return $clean === null ? null : trim($clean);
    }

    /** @param array<string, string> $fields */
    private static function validationError(ResponseInterface $response, array $fields): ResponseInterface
    {
        return self::json($response, ['error' => 'Validation failed.', 'fields' => $fields], 422);
    }

    /** @param array<string, mixed> $data */
    private static function json(ResponseInterface $response, array $data, int $status): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Cache-Control', 'no-store')
            ->withStatus($status);
    }
}
