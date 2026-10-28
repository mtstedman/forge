<?php

declare(strict_types=1);

namespace Forge\Api;

use PDO;
use RuntimeException;

/**
 * Shared PDO connection factory for the Forge API.
 *
 * Usage:
 *     use Forge\Api\Database;
 *     $pdo = Database::connect();     // process-wide shared connection
 *     $pdo = Database::create($url);  // fresh connection from an explicit URL (tests)
 *
 * Configuration is read from environment variables only:
 *   DATABASE_URL (preferred), e.g.
 *     sqlite:///absolute/path/app.sqlite   sqlite:relative/path.sqlite   sqlite::memory:
 *     mysql://user:pass@host:3306/dbname
 *     postgres://user:pass@host:5432/dbname  (postgresql:// and pgsql:// also accepted)
 *   DB_CONNECTION + DB_DATABASE as a fallback (e.g. DB_CONNECTION=sqlite, DB_DATABASE=api/var/forge.sqlite)
 * Relative SQLite paths resolve against the repository root (two levels above this file).
 */
final class Database
{
    private static ?PDO $shared = null;

    public static function connect(): PDO
    {
        return self::$shared ??= self::create();
    }

    /** Drop the shared connection (used by tests). */
    public static function reset(): void
    {
        self::$shared = null;
    }

    public static function create(?string $url = null): PDO
    {
        $url ??= self::env('DATABASE_URL');
        if ($url === null || $url === '') {
            $driver = self::env('DB_CONNECTION') ?? 'sqlite';
            $database = self::env('DB_DATABASE') ?? '';
            if ($database === '') {
                throw new RuntimeException('Database is not configured: set DATABASE_URL or DB_CONNECTION and DB_DATABASE.');
            }
            $url = $driver . ':' . $database;
        }

        [$dsn, $user, $password] = self::parse($url);

        $pdo = new PDO($dsn, $user, $password, [
            PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
            PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
            PDO::ATTR_EMULATE_PREPARES => false,
        ]);

        if (str_starts_with($dsn, 'sqlite:')) {
            $pdo->exec('PRAGMA foreign_keys = ON');
        }

        return $pdo;
    }

    /**
     * @return array{0: string, 1: ?string, 2: ?string} [dsn, username, password]
     */
    private static function parse(string $url): array
    {
        if (preg_match('/^sqlite3?:(.*)$/i', $url, $m) === 1) {
            return [self::sqliteDsn($m[1]), null, null];
        }

        $parts = parse_url($url);
        if ($parts === false || !isset($parts['scheme'])) {
            throw new RuntimeException('Unsupported DATABASE_URL format.');
        }

        $scheme = strtolower($parts['scheme']);
        $host = $parts['host'] ?? 'localhost';
        $name = ltrim($parts['path'] ?? '', '/');
        $user = isset($parts['user']) ? rawurldecode($parts['user']) : null;
        $password = isset($parts['pass']) ? rawurldecode($parts['pass']) : null;

        switch ($scheme) {
            case 'mysql':
            case 'mysql2':
                $port = $parts['port'] ?? 3306;
                return ["mysql:host={$host};port={$port};dbname={$name};charset=utf8mb4", $user, $password];
            case 'postgres':
            case 'postgresql':
            case 'pgsql':
                $port = $parts['port'] ?? 5432;
                return ["pgsql:host={$host};port={$port};dbname={$name}", $user, $password];
            default:
                throw new RuntimeException("Unsupported database scheme \"{$scheme}\".");
        }
    }

    private static function sqliteDsn(string $target): string
    {
        // sqlite:///abs/path -> /abs/path ; sqlite://rel/path -> rel/path ; sqlite:rel/path -> rel/path
        $path = preg_replace('#^//#', '', $target) ?? $target;
        if ($path === '' || str_contains($path, ':memory:')) {
            return 'sqlite::memory:';
        }
        if (!str_starts_with($path, '/')) {
            $path = dirname(__DIR__, 2) . '/' . $path;
        }
        $dir = dirname($path);
        if (!is_dir($dir) && !@mkdir($dir, 0775, true) && !is_dir($dir)) {
            throw new RuntimeException('Cannot create the SQLite database directory.');
        }
        return 'sqlite:' . $path;
    }

    private static function env(string $name): ?string
    {
        $value = $_ENV[$name] ?? $_SERVER[$name] ?? getenv($name);
        return ($value === false || $value === null) ? null : (string) $value;
    }
}
