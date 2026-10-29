<?php

declare(strict_types=1);

namespace Forge\Api\Captcha;

use Forge\Api\Config;
use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use JsonException;
use RuntimeException;
use Throwable;

/**
 * Server-side Cloudflare Turnstile verification for the consultation form.
 *
 * Returns false when the provider rejects the token (invalid, expired or
 * replayed) or when a successful verification does not match the expected
 * hostname and action. Throws RuntimeException when configuration is missing,
 * the provider is unreachable/returns an HTTP error, or the response is
 * malformed. Exception messages never contain the secret, token or response.
 */
final class TurnstileVerifier
{
    public const SITEVERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify';
    public const ACTION = 'consultation';
    private const MAX_TOKEN_LENGTH = 2048;
    private const CONNECT_TIMEOUT = 3.0;
    private const TIMEOUT = 5.0;

    /** Provider error codes that indicate a server-side configuration or provider fault. */
    private const UNAVAILABLE_ERROR_CODES = [
        'missing-input-secret',
        'invalid-input-secret',
        'internal-error',
    ];

    public function __construct(
        private readonly Config $config,
        private readonly ?ClientInterface $http = null,
    ) {
    }

    public function __invoke(string $token): bool
    {
        $secret = $this->config->get('TURNSTILE_SECRET_KEY');
        $expectedHostname = $this->config->get('TURNSTILE_EXPECTED_HOSTNAME');
        $secret = $secret === null ? '' : trim($secret);
        $expectedHostname = $expectedHostname === null ? '' : strtolower(trim($expectedHostname));
        if ($secret === '' || $expectedHostname === '') {
            throw new RuntimeException('CAPTCHA verification is not configured.');
        }

        if ($token === '' || strlen($token) > self::MAX_TOKEN_LENGTH) {
            return false;
        }

        $http = $this->http ?? new Client();

        try {
            $response = $http->request('POST', self::SITEVERIFY_URL, [
                'connect_timeout' => self::CONNECT_TIMEOUT,
                'timeout' => self::TIMEOUT,
                'http_errors' => false,
                'allow_redirects' => false,
                'headers' => ['Accept' => 'application/json'],
                'form_params' => [
                    'secret' => $secret,
                    'response' => $token,
                ],
            ]);
            $status = $response->getStatusCode();
            $body = (string) $response->getBody();
        } catch (Throwable) {
            // Do not chain the transport exception: it may describe the request.
            throw new RuntimeException('CAPTCHA verification is unavailable.');
        }

        if ($status !== 200) {
            throw new RuntimeException('CAPTCHA verification is unavailable.');
        }

        try {
            $data = json_decode($body, true, 16, JSON_THROW_ON_ERROR);
        } catch (JsonException) {
            throw new RuntimeException('CAPTCHA provider returned a malformed response.');
        }

        if (!is_array($data) || !array_key_exists('success', $data) || !is_bool($data['success'])) {
            throw new RuntimeException('CAPTCHA provider returned a malformed response.');
        }

        if ($data['success'] !== true) {
            $codes = $data['error-codes'] ?? [];
            if (is_array($codes)) {
                foreach ($codes as $code) {
                    if (is_string($code) && in_array($code, self::UNAVAILABLE_ERROR_CODES, true)) {
                        throw new RuntimeException('CAPTCHA verification is unavailable.');
                    }
                }
            }

            return false;
        }

        $hostname = $data['hostname'] ?? null;
        $action = $data['action'] ?? null;
        if (!is_string($hostname) || strtolower($hostname) !== $expectedHostname) {
            return false;
        }

        return $action === self::ACTION;
    }
}
