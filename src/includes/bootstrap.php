<?php

declare(strict_types=1);

$root = dirname(__DIR__, 2);

require_once $root . '/vendor/autoload.php';

Dotenv\Dotenv::createImmutable($root)->safeLoad();
