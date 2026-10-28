<?php

declare(strict_types=1);

use Forge\Site\SiteConfig;

require_once __DIR__ . '/includes/bootstrap.php';

header('Content-Type: text/plain; charset=UTF-8');

$siteUrl = rtrim(SiteConfig::get('SITE_URL', 'http://localhost') ?? 'http://localhost', '/');

echo "User-agent: *\n";
echo "Allow: /\n";
echo "Disallow: /admin/\n";
echo 'Sitemap: ' . $siteUrl . "/sitemap.xml\n";
