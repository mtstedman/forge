<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Repository\MainPageContentRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Public read plus admin read/full replacement of the singleton main-page content
 * document (shared contract main-page-content-api-v1). Every value is plain text
 * that clients render as text, never as trusted HTML.
 */
final class MainPageContentController
{
    private const CACHE_PUBLIC = 'public, max-age=60, stale-while-revalidate=300';
    private const MAX_ERRORS = 100;

    // String length tiers (characters).
    private const LABEL = 120;
    private const HEADING = 200;
    private const TEXT = 1000;
    private const LONG_TEXT = 2000;

    private const KIND = '__kind';

    /** @var array<string, mixed>|null */
    private static ?array $schema = null;

    public function __construct(private readonly MainPageContentRepository $content)
    {
    }

    /** Public, unauthenticated, cacheable read of the document. */
    public function show(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $document = $this->content->find();
        if ($document === null) {
            return $this->notFound($response);
        }

        return self::json($response, ['data' => $document], 200, self::CACHE_PUBLIC);
    }

    /** Authenticated admin read of the document. */
    public function adminShow(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $document = $this->content->find();
        if ($document === null) {
            return $this->notFound($response);
        }

        return self::json($response, ['data' => $document]);
    }

    /** Authenticated full replacement; invalid documents leave the stored row unchanged. */
    public function update(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $body = $request->getParsedBody();
        if (!is_array($body) || ($body !== [] && array_is_list($body))) {
            return self::json($response, [
                'error' => 'Validation failed.',
                'fields' => ['body' => 'Must be a JSON object containing the complete main-page content.'],
            ], 422);
        }

        $errors = [];
        $document = self::check($body, self::schema(), '', $errors);
        if ($errors !== [] || !is_array($document)) {
            return self::json($response, ['error' => 'Validation failed.', 'fields' => $errors], 422);
        }

        $this->content->replace($document);

        return self::json($response, ['data' => $this->content->find()]);
    }

    /**
     * Validates $value against $spec and rebuilds it in contract key order.
     *
     * @param array<string, mixed> $spec
     * @param array<string, string> $errors
     */
    private static function check(mixed $value, array $spec, string $path, array &$errors): mixed
    {
        $kind = $spec[self::KIND] ?? 'object';

        if ($kind === 'string') {
            return self::checkString($value, $spec, $path, $errors);
        }
        if ($kind === 'boolean') {
            if (!is_bool($value)) {
                self::addError($errors, $path, 'Must be true or false.');
                return null;
            }
            return $value;
        }
        if ($kind === 'list') {
            if (!is_array($value) || !array_is_list($value)) {
                self::addError($errors, $path, 'Must be a list.');
                return null;
            }
            $count = count($value);
            if ($count < $spec['min']) {
                self::addError($errors, $path, sprintf('Add at least %d %s.', $spec['min'], $spec['min'] === 1 ? 'item' : 'items'));
                return null;
            }
            if ($count > $spec['max']) {
                self::addError($errors, $path, sprintf('Use at most %d items.', $spec['max']));
                return null;
            }
            $items = [];
            foreach ($value as $index => $item) {
                $items[] = self::check($item, $spec['item'], $path . '.' . $index, $errors);
            }
            return $items;
        }

        // Object: every declared key is required and no other key is accepted.
        if (!is_array($value) || ($value !== [] && array_is_list($value))) {
            self::addError($errors, $path, 'Must be an object.');
            return null;
        }
        $result = [];
        foreach ($spec as $key => $child) {
            $childPath = $path === '' ? $key : $path . '.' . $key;
            if (!array_key_exists($key, $value)) {
                self::addError($errors, $childPath, 'This field is required.');
                continue;
            }
            $result[$key] = self::check($value[$key], $child, $childPath, $errors);
        }
        foreach (array_keys($value) as $key) {
            if (!is_string($key) || !array_key_exists($key, $spec) || $key === self::KIND) {
                self::addError($errors, $path === '' ? (string) $key : $path . '.' . $key, 'Unknown field.');
            }
        }

        return $result;
    }

    /**
     * @param array<string, mixed> $spec
     * @param array<string, string> $errors
     */
    private static function checkString(mixed $value, array $spec, string $path, array &$errors): ?string
    {
        if (!is_string($value)) {
            self::addError($errors, $path, 'Must be a string.');
            return null;
        }
        if (!mb_check_encoding($value, 'UTF-8')) {
            self::addError($errors, $path, 'Must be valid UTF-8 text.');
            return null;
        }
        if (preg_match('/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/', $value) === 1) {
            self::addError($errors, $path, 'Must not contain control characters.');
            return null;
        }
        if (mb_strlen($value, 'UTF-8') > $spec['max']) {
            self::addError($errors, $path, sprintf('Must be at most %d characters.', $spec['max']));
            return null;
        }
        if (trim($value) === '') {
            if ($spec['required']) {
                self::addError($errors, $path, 'This field is required.');
                return null;
            }
            return $value;
        }

        $format = $spec['format'] ?? null;
        if ($format === 'email' && filter_var($value, FILTER_VALIDATE_EMAIL) === false) {
            self::addError($errors, $path, 'Must be a valid email address.');
            return null;
        }
        if ($format === 'phone'
            && (preg_match('/^[0-9+().\- ]+$/', $value) !== 1 || preg_match_all('/[0-9]/', $value) < 7)) {
            self::addError($errors, $path, 'Must be a phone number with at least 7 digits.');
            return null;
        }

        return $value;
    }

    /** @param array<string, string> $errors */
    private static function addError(array &$errors, string $path, string $message): void
    {
        if (count($errors) < self::MAX_ERRORS && !isset($errors[$path])) {
            $errors[$path] = $message;
        }
    }

    /** @return array<string, mixed> The complete MainPageContent contract. */
    private static function schema(): array
    {
        return self::$schema ??= [
            'seo' => [
                'title' => self::text(self::LABEL),
                'description' => self::text(320),
            ],
            'hero' => [
                'eyebrow' => self::text(self::LABEL, false),
                'heading' => self::text(self::HEADING),
                'introduction' => self::text(self::TEXT),
                'primary_cta_label' => self::text(self::LABEL),
                'secondary_cta_label' => self::text(self::LABEL),
                'credential_chips' => self::listOf(self::text(self::LABEL), 0, 8),
                'location_chip' => self::text(self::LABEL),
                'image_alt' => self::text(self::HEADING),
            ],
            'approach' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING),
                'description' => self::text(self::TEXT),
                'principles' => self::listOf([
                    'marker' => self::text(16),
                    'title' => self::text(self::HEADING),
                    'description' => self::text(self::TEXT),
                ], 1, 8),
                'service_area' => self::text(self::LABEL),
            ],
            'services' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING),
                'items' => self::listOf([
                    'number' => self::text(16),
                    'title' => self::text(self::HEADING),
                    'description' => self::text(self::TEXT),
                ], 1, 12),
            ],
            'about' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING, false),
                'name' => self::text(self::LABEL),
                'suffix' => self::text(self::LABEL),
                'role' => self::text(self::LABEL),
                'biography' => self::text(self::LONG_TEXT),
                'portrait_alt' => self::text(self::HEADING),
                'credentials' => self::listOf([
                    'credential' => self::text(self::HEADING),
                    'label' => self::text(self::LABEL),
                ], 0, 12),
            ],
            'pricing' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING),
                'description' => self::text(self::TEXT),
                'items' => self::listOf([
                    'step' => self::text(self::LABEL),
                    'title' => self::text(self::HEADING),
                    'price' => self::text(32),
                    'detail' => self::text(self::LABEL, false),
                    'description' => self::text(self::TEXT),
                    'featured' => [self::KIND => 'boolean'],
                ], 1, 6),
            ],
            'testimonials' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING),
                'items' => self::listOf([
                    'quote' => self::text(self::TEXT),
                    'attribution' => self::text(self::LABEL),
                ], 0, 12),
            ],
            'resources' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING),
                'description' => self::text(self::TEXT, false),
                'all_resources_label' => self::text(self::LABEL),
                'unavailable_message' => self::text(self::TEXT),
                'empty_message' => self::text(self::TEXT),
                'category_fallback' => self::text(self::LABEL),
                'read_article_label' => self::text(self::LABEL),
            ],
            'faq' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING),
                'items' => self::listOf([
                    'question' => self::text(self::HEADING),
                    'answer' => self::text(self::LONG_TEXT),
                ], 0, 20),
                'cta_prefix' => self::text(self::LABEL),
                'cta_label' => self::text(self::LABEL),
            ],
            'contact' => [
                'eyebrow' => self::text(self::LABEL),
                'title' => self::text(self::HEADING),
                'description' => self::text(self::TEXT),
                'phone' => self::text(40, true, 'phone'),
                'email' => self::text(254, true, 'email'),
                'service_area' => self::text(self::LABEL),
                'venue' => self::text(self::LABEL),
                'form' => [
                    'name_label' => self::text(self::LABEL),
                    'phone_label' => self::text(self::LABEL),
                    'email_label' => self::text(self::LABEL),
                    'email_optional_label' => self::text(self::LABEL, false),
                    'best_time_label' => self::text(self::LABEL),
                    'message_label' => self::text(self::LABEL),
                    'message_optional_label' => self::text(self::LABEL, false),
                    'consent_label' => self::text(self::TEXT),
                    'submit_label' => self::text(self::LABEL),
                    'sending_label' => self::text(self::LABEL),
                    'success_message' => self::text(self::TEXT),
                    'generic_error_message' => self::text(self::TEXT),
                    'captcha_retry_message' => self::text(self::TEXT),
                ],
            ],
        ];
    }

    /** @return array<string, mixed> */
    private static function text(int $max, bool $required = true, ?string $format = null): array
    {
        return [self::KIND => 'string', 'max' => $max, 'required' => $required, 'format' => $format];
    }

    /** @param array<string, mixed> $item @return array<string, mixed> */
    private static function listOf(array $item, int $min, int $max): array
    {
        return [self::KIND => 'list', 'item' => $item, 'min' => $min, 'max' => $max];
    }

    private function notFound(ResponseInterface $response): ResponseInterface
    {
        return self::json($response, ['error' => 'Main page content not found.'], 404);
    }

    /** @param array<string, mixed> $data */
    private static function json(ResponseInterface $response, array $data, int $status = 200, string $cacheControl = 'no-store'): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Cache-Control', $cacheControl)
            ->withStatus($status);
    }
}
