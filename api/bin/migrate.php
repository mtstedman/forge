#!/usr/bin/env php
<?php

declare(strict_types=1);

use Dotenv\Dotenv;
use Forge\Api\Database;
use Forge\Api\Migrator;

$root = dirname(__DIR__, 2);

/** @var \Composer\Autoload\ClassLoader $loader */
$loader = require $root . '/vendor/autoload.php';
$loader->addPsr4('Forge\\Api\\', $root . '/api/src/');

Dotenv::createImmutable($root)->safeLoad();
Migrator::migrate(Database::connect());

fwrite(STDOUT, "Database schema is up to date.\n");
