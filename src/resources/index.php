<?php

declare(strict_types=1);

use Forge\Site\ApiClient;
use Forge\Site\Layout;
use Forge\Site\SiteConfig;

require_once __DIR__ . '/../includes/bootstrap.php';

/*
 * Resources listing page: /resources/?page=N.
 * Tests (and other callers) may provide a pre-built $apiClient before including this file.
 */

$perPage = 9;
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

$pageParam = isset($_GET['page']) && is_string($_GET['page']) ? trim($_GET['page']) : '';
$page = filter_var($pageParam, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1, 'max_range' => 100000]]);
$page = $page === false ? 1 : $page;

$responseStatus = 200;
$posts = [];
$total = 0;

if ($apiClient === null) {
    $responseStatus = 503;
} else {
    try {
        $listResponse = $apiClient->getPostsAsync($page, $perPage)->wait();
        if (is_array($listResponse) && isset($listResponse['data']) && is_array($listResponse['data'])) {
            $posts = array_values(array_filter(
                $listResponse['data'],
                static fn (mixed $item): bool => is_array($item) && isset($item['slug']) && is_string($item['slug']) && $item['slug'] !== ''
            ));
            $metaTotal = $listResponse['meta']['total'] ?? null;
            $total = is_int($metaTotal) && $metaTotal >= 0 ? $metaTotal : count($posts);
        } else {
            $responseStatus = 503;
        }
    } catch (Throwable) {
        $responseStatus = 503;
    }
}

$totalPages = max(1, (int) ceil($total / $perPage));
if ($responseStatus === 200 && $page > $totalPages) {
    $responseStatus = 404;
    $posts = [];
}

if (!headers_sent()) {
    http_response_code($responseStatus);
    if ($responseStatus === 503) {
        header('Retry-After: 120');
    }
}

$escape = static fn (mixed $value): string => htmlspecialchars(
    is_scalar($value) ? (string) $value : '',
    ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5,
    'UTF-8'
);
$text = static fn (array $source, string $key, string $default = ''): string => isset($source[$key]) && is_scalar($source[$key]) && trim((string) $source[$key]) !== ''
    ? trim((string) $source[$key])
    : $default;
$isoDate = static function (string $value): string {
    if ($value === '') {
        return '';
    }
    try {
        return (new DateTimeImmutable($value))->format(DATE_ATOM);
    } catch (Throwable) {
        return '';
    }
};
$displayDate = static function (string $value): string {
    if ($value === '') {
        return '';
    }
    try {
        return (new DateTimeImmutable($value))->format('M j, Y');
    } catch (Throwable) {
        return '';
    }
};
$pagePath = static fn (int $number): string => $number <= 1 ? '/resources/' : '/resources/?page=' . $number;

$canonicalPath = $pagePath($page);
$canonical = $siteUrl . $canonicalPath;
$pageSuffix = $page > 1 ? ' — Page ' . $page . ' of ' . $totalPages : '';
$baseDescription = 'Evidence-based articles on injury recovery, rehabilitation and performance training from Dr. Joseph Sperlak of Forge Performance Therapy.';

$headLinks = [];
if ($responseStatus === 200) {
    $meta = [
        'title' => 'Resources' . $pageSuffix . ' | Forge Performance Therapy',
        'description' => $page > 1 ? $baseDescription . ' Page ' . $page . ' of ' . $totalPages . '.' : $baseDescription,
        'canonical' => $canonical,
        'type' => 'website',
        'site_name' => 'Forge Performance Therapy',
    ];

    if ($page > 1) {
        $headLinks[] = '<link rel="prev" href="' . $escape($siteUrl . $pagePath($page - 1)) . '">';
    }
    if ($page < $totalPages) {
        $headLinks[] = '<link rel="next" href="' . $escape($siteUrl . $pagePath($page + 1)) . '">';
    }

    $offset = ($page - 1) * $perPage;
    $breadcrumbs = [
        ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => $siteUrl . '/'],
        ['@type' => 'ListItem', 'position' => 2, 'name' => 'Resources', 'item' => $siteUrl . '/resources/'],
    ];
    if ($page > 1) {
        $breadcrumbs[] = ['@type' => 'ListItem', 'position' => 3, 'name' => 'Page ' . $page, 'item' => $canonical];
    }

    $meta['json_ld'] = [
        '@context' => 'https://schema.org',
        '@graph' => [
            [
                '@type' => 'CollectionPage',
                '@id' => $canonical . '#webpage',
                'url' => $canonical,
                'name' => 'Resources' . $pageSuffix,
                'description' => $meta['description'],
                'isPartOf' => ['@id' => $siteUrl . '/#website'],
                'breadcrumb' => ['@id' => $canonical . '#breadcrumb'],
                'mainEntity' => ['@id' => $canonical . '#itemlist'],
            ],
            [
                '@type' => 'ItemList',
                '@id' => $canonical . '#itemlist',
                'numberOfItems' => count($posts),
                'itemListElement' => array_map(
                    static fn (array $post, int $index): array => [
                        '@type' => 'ListItem',
                        'position' => $offset + $index + 1,
                        'url' => $siteUrl . '/resources/' . rawurlencode((string) $post['slug']),
                        'name' => $text($post, 'title', 'Untitled resource'),
                    ],
                    $posts,
                    array_keys($posts)
                ),
            ],
            [
                '@type' => 'BreadcrumbList',
                '@id' => $canonical . '#breadcrumb',
                'itemListElement' => $breadcrumbs,
            ],
        ],
    ];
} else {
    $meta = [
        'title' => ($responseStatus === 404 ? 'Page not found' : 'Resources are temporarily unavailable') . ' | Forge Performance Therapy',
        'description' => $responseStatus === 404
            ? 'This page of resources does not exist.'
            : 'Our resources are temporarily unavailable. Please try again shortly.',
        'robots' => 'noindex,follow',
        'type' => 'website',
    ];
}

$pageStyles = <<<'CSS'
<style>
.resources-intro { padding-block: clamp(48px, 7vw, 96px) 0; display: flex; flex-direction: column; gap: 18px; }
.resources-intro h1 { font: 400 clamp(46px, 7vw, 84px)/1 var(--font-heading); }
.resources-listing { padding-top: clamp(40px, 5vw, 64px); }
.resource-grid { margin: 0; padding: 0; list-style: none; }
.resource-card h2 { font-size: 27px; font-weight: 600; line-height: 1.14; }
.resource-card h2 a { color: var(--color-text); text-decoration: none; }
.resource-card h2 a:hover { color: var(--color-accent-700); }
.resource-card__cover { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: var(--radius-md); }
.pagination { padding-top: 24px; display: flex; flex-wrap: wrap; justify-content: space-between; align-items: center; gap: 16px; border-top: 1px solid var(--color-divider); color: var(--color-neutral-700); font-size: 13px; }
.pagination__spacer { min-width: 1px; }
.error-state { max-width: 640px; display: flex; flex-direction: column; align-items: flex-start; gap: 20px; }
.error-state h1 { font: 400 clamp(40px, 6vw, 64px)/1.05 var(--font-heading); }
</style>
CSS;

ob_start();
Layout::header($meta, 'resources');
$headerHtml = (string) ob_get_clean();
$headExtra = ($headLinks === [] ? '' : implode("\n", $headLinks) . "\n") . $pageStyles . "\n";
$headEnd = strpos($headerHtml, '</head>');
echo $headEnd === false ? $headerHtml : substr_replace($headerHtml, $headExtra, $headEnd, 0);
?>
<main id="main-content" class="page-shell">
<?php if ($responseStatus !== 200): ?>
  <section class="section error-state" aria-labelledby="error-title">
    <span class="eyebrow"><?= $responseStatus === 404 ? 'Error 404' : 'Error 503' ?></span>
    <?php if ($responseStatus === 404): ?>
      <h1 id="error-title">Page not found</h1>
      <p class="section-lede">There are no resources on this page. Head back to the first page to see the latest articles.</p>
      <a class="button button--outline" href="/resources/">View the latest resources</a>
    <?php else: ?>
      <h1 id="error-title">Resources are temporarily unavailable</h1>
      <p class="section-lede" role="status">We couldn't load our articles right now. Please wait a minute and try again.</p>
      <a class="button button--outline" href="<?= $escape($canonicalPath) ?>">Try again</a>
    <?php endif; ?>
  </section>
<?php else: ?>
  <header class="resources-intro">
    <span class="eyebrow">Resources<?= $page > 1 ? ' · Page ' . $page . ' of ' . $totalPages : '' ?></span>
    <h1>Notes from the training floor</h1>
    <p class="section-lede">Practical, evidence-based guidance on recovering from injury, returning to sport and training for the long haul.</p>
  </header>

  <section class="section resources resources-listing" aria-label="Articles">
    <?php if ($posts === []): ?>
      <div class="resources-empty">
        <p>New articles are on the way. Visit the resources page again soon.</p>
      </div>
    <?php else: ?>
      <ul class="resource-grid" role="list">
        <?php foreach ($posts as $post): ?>
          <?php
          $postUrl = '/resources/' . rawurlencode((string) $post['slug']);
          $published = $text($post, 'published_at');
          $cover = isset($post['cover']) && is_array($post['cover']) ? $post['cover'] : null;
          $coverUrl = $cover !== null ? $text($cover, 'url') : '';
          ?>
          <li class="resource-card">
            <?php if ($coverUrl !== ''): ?>
              <img class="resource-card__cover" src="<?= $escape($coverUrl) ?>" alt="<?= $escape($text($cover, 'alt')) ?>" loading="lazy" decoding="async">
            <?php endif; ?>
            <div class="resource-card__meta">
              <span><?= $escape($text($post, 'category', 'Resource')) ?></span>
              <?php if ($isoDate($published) !== ''): ?><time datetime="<?= $escape($isoDate($published)) ?>"><?= $escape($displayDate($published)) ?></time><?php endif; ?>
            </div>
            <h2><a href="<?= $escape($postUrl) ?>"><?= $escape($text($post, 'title', 'Untitled resource')) ?></a></h2>
            <p><?= $escape($text($post, 'excerpt')) ?></p>
            <div class="resource-card__footer">By <?= $escape($text($post, 'author_name', 'Dr. Joseph Sperlak')) ?></div>
          </li>
        <?php endforeach; ?>
      </ul>
    <?php endif; ?>

    <?php if ($totalPages > 1): ?>
      <nav class="pagination" aria-label="Pagination">
        <?php if ($page > 1): ?>
          <a class="button button--text" rel="prev" href="<?= $escape($pagePath($page - 1)) ?>">← Newer resources</a>
        <?php else: ?>
          <span class="pagination__spacer"></span>
        <?php endif; ?>
        <span>Page <?= $page ?> of <?= $totalPages ?></span>
        <?php if ($page < $totalPages): ?>
          <a class="button button--text" rel="next" href="<?= $escape($pagePath($page + 1)) ?>">Older resources →</a>
        <?php else: ?>
          <span class="pagination__spacer"></span>
        <?php endif; ?>
      </nav>
    <?php endif; ?>
  </section>
<?php endif; ?>
</main>
<?php
Layout::footer();
