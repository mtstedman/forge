<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;

$root = dirname(__DIR__, 2);

/** @var \Composer\Autoload\ClassLoader $loader */
$loader = require $root . '/vendor/autoload.php';
// vendor/ is not regenerated per checkout, so register the project namespaces here.
$loader->addPsr4('Forge\\Api\\', $root . '/api/src/');
$loader->addPsr4('Forge\\Site\\', $root . '/src/includes/');

try {
    Dotenv::createImmutable($root)->safeLoad();

    AppFactory::create(Database::connect(), Config::fromEnv())->run();
} catch (Throwable $e) {
    // Failures before Slim's error middleware is active (bad .env, database
    // unavailable): log server-side, never expose details to the client.
    error_log(sprintf('[forge-api] bootstrap failure: %s: %s', $e::class, $e->getMessage()));
    if (!headers_sent()) {
        http_response_code(500);
        header('Content-Type: application/json');
        header('X-Content-Type-Options: nosniff');
    }
    echo '{"message":"Internal Server Error"}';
}
