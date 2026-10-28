<?php

declare(strict_types=1);

$root = dirname(__DIR__);

/** @var \Composer\Autoload\ClassLoader $loader */
$loader = require $root . '/vendor/autoload.php';
// vendor/ is not regenerated per checkout, so register the project namespaces here.
$loader->addPsr4('Forge\\Api\\', $root . '/api/src/');
$loader->addPsr4('Forge\\Site\\', $root . '/src/includes/');
