<?php

declare(strict_types=1);

namespace Forge\Api;

use PDO;
use RuntimeException;

final class Migrator
{
    public static function migrate(PDO $pdo): void
    {
        $path = dirname(__DIR__) . '/database/schema.sql';
        $schema = @file_get_contents($path);
        if ($schema === false) {
            throw new RuntimeException('Unable to read the database schema.');
        }

        $pdo->exec($schema);
    }
}
