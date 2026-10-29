#!/usr/bin/env php
<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use Forge\Api\Database;
use Forge\Api\Migrator;
use Forge\Api\Repository\AdminUserRepository;

$root = dirname(__DIR__, 2);

/** @var \Composer\Autoload\ClassLoader $loader */
$loader = require $root . '/vendor/autoload.php';
$loader->addPsr4('Forge\\Api\\', $root . '/api/src/');
$loader->addPsr4('Forge\\Site\\', $root . '/src/includes/');

Dotenv::createImmutable($root)->safeLoad();

$usage = "Usage: php api/bin/create-admin.php <email> [password] [name]\n"
    . "When [password] is omitted, the ADMIN_PASSWORD environment variable is used.\n";

$args = array_slice($argv ?? [], 1);
if (count($args) < 1 || count($args) > 3) {
    fwrite(STDERR, $usage);
    exit(1);
}

$email = strtolower(trim((string) $args[0]));
if ($email === '' || filter_var($email, FILTER_VALIDATE_EMAIL) === false) {
    fwrite(STDERR, "Invalid email address.\n" . $usage);
    exit(1);
}

$password = $args[1] ?? null;
if ($password === null) {
    $envPassword = $_ENV['ADMIN_PASSWORD'] ?? $_SERVER['ADMIN_PASSWORD'] ?? getenv('ADMIN_PASSWORD');
    $password = is_string($envPassword) ? $envPassword : '';
}
if (trim((string) $password) === '') {
    fwrite(STDERR, "Password must not be empty (pass it as an argument or set ADMIN_PASSWORD).\n" . $usage);
    exit(1);
}

$name = (string) ($args[2] ?? '');

try {
    $pdo = Database::connect();
    Migrator::migrate($pdo);

    $users = new AdminUserRepository($pdo);
    $hash = password_hash((string) $password, PASSWORD_DEFAULT);
    $existing = $users->findByEmail($email);
    if ($existing === null) {
        $id = $users->create($email, $hash, $name);
        fwrite(STDOUT, "Created admin user {$email} (id {$id}).\n");
    } else {
        $users->updatePassword((int) $existing['id'], $hash);
        fwrite(STDOUT, "Updated password for admin user {$email} (id {$existing['id']}).\n");
    }
} catch (Throwable $exception) {
    // PDO errors from prepared statements never include bound values, so no secret is printed.
    fwrite(STDERR, 'Could not save the admin user: ' . $exception->getMessage() . "\n");
    exit(1);
}

exit(0);
