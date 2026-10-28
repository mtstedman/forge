<?php

declare(strict_types=1);

namespace Forge\Api;

/**
 * Immutable view of the API configuration.
 *
 * Values come from environment variables (fromEnv) or an explicit array
 * (fromArray, used by tests). Every value is stored as a string; an unset or
 * empty value is treated as missing and falls back to the caller's default.
 *
 * Known variables (defaults are supplied by the consuming code):
 *   APP_ENV, APP_KEY, CORS_ALLOWED_ORIGINS (comma list),
 *   PUBLIC_COMMENTS_ENABLED (false), COMMENT_RATE_LIMIT (3 per 600s),
 *   OAUTH_ISSUER, OAUTH_AUDIENCE, OAUTH_JWKS_URL, OAUTH_REQUIRED_SCOPE,
 *   UPLOAD_DIR (api/public/uploads), UPLOAD_MAX_BYTES (5242880), MEDIA_BASE_URL
 */
final class Config
{
    /** @param array<string, string> $values */
    private function __construct(private readonly array $values)
    {
    }

    /**
     * Snapshot of the process environment. $_ENV (populated by phpdotenv)
     * takes precedence over getenv(). $_SERVER is deliberately not read
     * because it also carries client-supplied request headers.
     */
    public static function fromEnv(): self
    {
        $values = [];
        $env = getenv();
        if (is_array($env)) {
            foreach ($env as $key => $value) {
                if (is_string($key) && is_string($value)) {
                    $values[$key] = $value;
                }
            }
        }
        foreach ($_ENV as $key => $value) {
            if (is_string($key) && is_scalar($value)) {
                $values[$key] = self::stringify($value);
            }
        }

        return new self($values);
    }

    /** @param array<string, mixed> $values */
    public static function fromArray(array $values): self
    {
        $normalized = [];
        foreach ($values as $key => $value) {
            if (is_string($key) && is_scalar($value)) {
                $normalized[$key] = self::stringify($value);
            }
        }

        return new self($normalized);
    }

    public function get(string $key, ?string $default = null): ?string
    {
        $value = $this->values[$key] ?? null;

        return ($value === null || $value === '') ? $default : $value;
    }

    public function bool(string $key, bool $default = false): bool
    {
        $value = $this->get($key);
        if ($value === null) {
            return $default;
        }

        $parsed = filter_var(trim($value), FILTER_VALIDATE_BOOLEAN, FILTER_NULL_ON_FAILURE);

        return $parsed ?? $default;
    }

    public function int(string $key, int $default): int
    {
        $value = $this->get($key);
        if ($value === null) {
            return $default;
        }

        $parsed = filter_var(trim($value), FILTER_VALIDATE_INT);

        return $parsed === false ? $default : $parsed;
    }

    private static function stringify(bool|int|float|string $value): string
    {
        if (is_bool($value)) {
            return $value ? 'true' : 'false';
        }

        return (string) $value;
    }
}
