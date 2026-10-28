<?php

declare(strict_types=1);

namespace Forge\Site;

final class SiteConfig
{
    public static function get(string $key, ?string $default = null): ?string
    {
        $value = $_ENV[$key] ?? $_SERVER[$key] ?? getenv($key);

        return is_string($value) ? $value : $default;
    }
}
