<?php

declare(strict_types=1);

use Forge\Site\ApiClient;
use Forge\Site\SiteConfig;

require_once __DIR__ . '/includes/bootstrap.php';

/*
 * XML sitemap: /sitemap.xml (rewritten to sitemap.php).
 * Lists the home page, the resources index and every published resource.
 * Tests (and other callers) may provide a pre-built $apiClient before including this file.
 */

$perPage = 50;
$maxPages = 200;
$siteUrl = rtrim(SiteConfig::get('SITE_URL', 'http://localhost') ?? 'http://localhost', '/');

if (!isset($apiClient) || !$apiClient instanceof ApiClient) {
    $apiClient = null;
    $apiBaseUrl = SiteConfig::get('API_BASE_URL');
    if ($apiBaseUrl !== null && $apiBaseUrl !== '') {
        try {
            $apiClient = new ApiClient($apiBaseUrl);
        } catch (Throwable) {
            $apiClient = null;
        }
    }
}

$isoDate = static function (mixed $value): string {
    if (!is_string($value) || $value === '') {
        return '';
    }
    try {
        return (new DateTimeImmutable($value))->format(DATE_ATOM);
    } catch (Throwable) {
        return '';
    }
};

$responseStatus = 200;
$pages = [];

if ($apiClient === null) {
    $responseStatus = 503;
} else {
    try {
        $first = $apiClient->getPostsAsync(1, $perPage)->wait();
        if (!is_array($first) || !isset($first['data']) || !is_array($first['data'])) {
            throw new RuntimeException('Unexpected posts response.');
        }
        $pages[] = $first['data'];

        $total = $first['meta']['total'] ?? null;
        $pageCount = is_int($total) && $total > 0 ? min($maxPages, (int) ceil($total / $perPage)) : 1;

        // Fetch the remaining pages concurrently.
        $promises = [];
        for ($number = 2; $number <= $pageCount; $number++) {
            $promises[] = $apiClient->getPostsAsync($number, $perPage);
        }
        foreach ($promises as $promise) {
            $response = $promise->wait();
            if (is_array($response) && isset($response['data']) && is_array($response['data'])) {
                $pages[] = $response['data'];
            }
        }
    } catch (Throwable) {
        $responseStatus = 503;
        $pages = [];
    }
}

$entries = [];
$seen = [];
$newest = '';
foreach ($pages as $items) {
    foreach ($items as $item) {
        if (!is_array($item) || !isset($item['slug']) || !is_string($item['slug']) || $item['slug'] === '') {
            continue;
        }
        // Only published resources: drafts have no published_at.
        $published = $isoDate($item['published_at'] ?? null);
        if ($published === '' || isset($seen[$item['slug']])) {
            continue;
        }
        $seen[$item['slug']] = true;

        $lastmod = $isoDate($item['updated_at'] ?? null);
        $lastmod = $lastmod !== '' ? $lastmod : $published;
        if ($newest === '' || strtotime($lastmod) > strtotime($newest)) {
            $newest = $lastmod;
        }

        $entries[] = [
            'loc' => $siteUrl . '/resources/' . rawurlencode($item['slug']),
            'lastmod' => $lastmod,
        ];
    }
}

array_unshift(
    $entries,
    ['loc' => $siteUrl . '/', 'lastmod' => $newest],
    ['loc' => $siteUrl . '/resources/', 'lastmod' => $newest]
);

if (!headers_sent()) {
    http_response_code($responseStatus);
    header('Content-Type: application/xml; charset=UTF-8');
    if ($responseStatus === 503) {
        header('Retry-After: 120');
    }
}

$xml = static fn (string $value): string => htmlspecialchars($value, ENT_XML1 | ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8');

echo '<?xml version="1.0" encoding="UTF-8"?>', "\n";
echo '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">', "\n";
foreach ($entries as $entry) {
    echo "  <url>\n";
    echo '    <loc>', $xml($entry['loc']), "</loc>\n";
    if ($entry['lastmod'] !== '') {
        echo '    <lastmod>', $xml($entry['lastmod']), "</lastmod>\n";
    }
    echo "  </url>\n";
}
echo "</urlset>\n";
