<?php

declare(strict_types=1);

use Forge\Site\ApiClient;
use Forge\Site\Layout;
use Forge\Site\SiteConfig;

require_once __DIR__ . '/../includes/bootstrap.php';

/*
 * Resource detail page: /resources/{slug} (rewritten to post.php?slug={slug}).
 * Tests (and other callers) may provide a pre-built $apiClient before including this file.
 */

$siteUrl = rtrim(SiteConfig::get('SITE_URL', 'http://localhost') ?? 'http://localhost', '/');
$publicApiUrl = rtrim(SiteConfig::get('PUBLIC_API_URL', '') ?? '', '/');

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

$requestedSlug = isset($_GET['slug']) && is_string($_GET['slug']) ? trim($_GET['slug']) : '';
$responseStatus = 200;
$post = null;
$relatedPosts = [];

if ($requestedSlug === '' || strlen($requestedSlug) > 200) {
    $responseStatus = 404;
} elseif ($apiClient === null) {
    $responseStatus = 503;
} else {
    $postPromise = null;
    $listPromise = null;

    try {
        // Fire both requests before waiting so they run concurrently.
        $postPromise = $apiClient->getPostAsync($requestedSlug);
        $listPromise = $apiClient->getPostsAsync(1, 7);
    } catch (Throwable) {
        $postPromise = null;
    }

    if ($postPromise === null) {
        $responseStatus = 503;
    } else {
        try {
            $postResponse = $postPromise->wait();
            if ($postResponse === null) {
                $responseStatus = 404;
            } elseif (is_array($postResponse) && isset($postResponse['data']) && is_array($postResponse['data'])) {
                $post = $postResponse['data'];
            } else {
                $responseStatus = 503;
            }
        } catch (Throwable) {
            $responseStatus = 503;
        }
    }

    if ($post !== null && $listPromise !== null) {
        try {
            $listResponse = $listPromise->wait();
            if (is_array($listResponse) && isset($listResponse['data']) && is_array($listResponse['data'])) {
                $relatedPosts = array_values(array_filter($listResponse['data'], 'is_array'));
            }
        } catch (Throwable) {
            $relatedPosts = [];
        }
    }
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
$absoluteUrl = static function (string $url) use ($siteUrl): string {
    if ($url === '') {
        return '';
    }
    if (preg_match('#^https?://#i', $url) === 1) {
        return $url;
    }
    if (str_starts_with($url, '//')) {
        return 'https:' . $url;
    }

    return $siteUrl . '/' . ltrim($url, '/');
};
$renderHeader = static function (array $meta, string $extraHead): void {
    ob_start();
    Layout::header($meta, 'resources');
    $html = (string) ob_get_clean();
    $position = strpos($html, '</head>');
    echo $position === false ? $html : substr_replace($html, $extraHead . "\n", $position, 0);
};

$pageStyles = <<<'CSS'
<style>
.breadcrumbs { padding-top: 28px; color: var(--color-neutral-700); font-size: 12px; letter-spacing: .06em; text-transform: uppercase; }
.breadcrumbs ol { margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; list-style: none; }
.breadcrumbs li + li::before { content: "/"; margin-right: 8px; color: var(--color-divider); }
.breadcrumbs a { color: var(--color-accent-700); text-decoration: none; }
.article { max-width: 760px; margin: 0 auto; padding-block: clamp(36px, 6vw, 72px) clamp(48px, 7vw, 88px); display: flex; flex-direction: column; gap: 32px; }
.article__header { display: flex; flex-direction: column; gap: 18px; }
.article__header h1 { font: 400 clamp(40px, 6vw, 68px)/1.04 var(--font-heading); }
.article__summary { padding-left: 18px; border-left: 2px solid var(--color-accent); font-size: clamp(17px, 1.6vw, 19px); line-height: 1.7; }
.article__meta { display: flex; flex-wrap: wrap; gap: 6px 18px; color: var(--color-neutral-700); font-size: 13px; }
.article__cover { margin: 0; }
.article__cover img { width: 100%; height: auto; display: block; border-radius: var(--radius-md); }
.article__body { font-size: 17px; line-height: 1.85; }
.article__body > * + * { margin-top: 1.1em; }
.article__body h2 { margin-top: 1.6em; font: 600 clamp(28px, 3vw, 34px)/1.2 var(--font-heading); }
.article__body h3 { margin-top: 1.4em; font: 600 24px/1.25 var(--font-heading); }
.article__body img { max-width: 100%; height: auto; }
.article__body a { color: var(--color-accent-700); }
.article__tags { margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 8px; list-style: none; }
.article__tags li { padding: 4px 10px; border: 1px solid var(--color-divider); border-radius: 999px; color: var(--color-neutral-700); font-size: 12px; }
.article-section { padding-top: 32px; display: flex; flex-direction: column; gap: 20px; border-top: 1px solid var(--color-divider); }
.article-section h2 { font: 400 clamp(30px, 3.4vw, 40px)/1.1 var(--font-heading); }
.faq-list details p, .comment__body { white-space: pre-line; }
.comment-list { margin: 0; padding: 0; display: flex; flex-direction: column; list-style: none; }
.comment { padding: 18px 0; display: flex; flex-direction: column; gap: 8px; border-bottom: 1px solid var(--color-divider); }
.comment__meta { display: flex; flex-wrap: wrap; gap: 4px 14px; color: var(--color-neutral-700); font-size: 12px; }
.comment__meta strong { color: var(--color-text); font-size: 14px; }
.comment__body { line-height: 1.75; }
.comments-empty { color: var(--color-neutral-700); }
.comment-form__honeypot { position: absolute !important; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); clip-path: inset(50%); white-space: nowrap; }
.comment-form__status { min-height: 1.5em; color: var(--color-accent-700); font-size: 14px; }
.comment-form__status[data-state="error"] { color: #9b2c2c; }
.related { padding-block: clamp(56px, 7vw, 96px); }
.resource-card h3 a { color: var(--color-text); }
.error-state { max-width: 640px; margin: 0 auto; display: flex; flex-direction: column; align-items: flex-start; gap: 20px; }
.error-state h1 { font: 400 clamp(40px, 6vw, 64px)/1.05 var(--font-heading); }
</style>
CSS;

if ($post === null) {
    $isMissing = $responseStatus === 404;
    $errorTitle = $isMissing ? 'Resource not found' : 'Resources are temporarily unavailable';
    $retryPath = '/resources/' . rawurlencode($requestedSlug);

    $renderHeader([
        'title' => $errorTitle . ' | Forge Performance Therapy',
        'description' => $isMissing
            ? 'The resource you were looking for could not be found.'
            : 'Our resources are temporarily unavailable. Please try again shortly.',
        'robots' => 'noindex,follow',
        'type' => 'website',
    ], $pageStyles);
    ?>
<main id="main-content" class="page-shell">
  <section class="section error-state" aria-labelledby="error-title">
    <span class="eyebrow"><?= $isMissing ? 'Error 404' : 'Error 503' ?></span>
    <h1 id="error-title"><?= $escape($errorTitle) ?></h1>
    <?php if ($isMissing): ?>
      <p class="section-lede">This article may have moved or is no longer published. Browse the full library of resources instead.</p>
      <a class="button button--outline" href="/resources/">Browse all resources</a>
    <?php else: ?>
      <p class="section-lede" role="status">We couldn't load this resource right now. Please wait a minute and try again.</p>
      <div class="hero__actions">
        <a class="button button--outline" href="<?= $escape($retryPath) ?>">Try again</a>
        <a class="button button--text" href="/resources/">Back to resources</a>
      </div>
    <?php endif; ?>
  </section>
</main>
<?php
    Layout::footer();

    return;
}

$postSlug = $text($post, 'slug', $requestedSlug);
$title = $text($post, 'title', 'Untitled resource');
$excerpt = $text($post, 'excerpt');
$category = $text($post, 'category');
$authorName = $text($post, 'author_name', 'Dr. Joseph Sperlak');
$publishedRaw = $text($post, 'published_at');
$updatedRaw = $text($post, 'updated_at', $publishedRaw);
$publishedIso = $isoDate($publishedRaw);
$updatedIso = $isoDate($updatedRaw) !== '' ? $isoDate($updatedRaw) : $publishedIso;
$tags = isset($post['tags']) && is_array($post['tags'])
    ? array_values(array_filter(array_map(static fn (mixed $tag): string => is_string($tag) ? trim($tag) : '', $post['tags']), static fn (string $tag): bool => $tag !== ''))
    : [];
$cover = isset($post['cover']) && is_array($post['cover']) ? $post['cover'] : null;
$coverUrl = $cover !== null ? $absoluteUrl($text($cover, 'url')) : '';
$coverAlt = $cover !== null ? $text($cover, 'alt') : '';
$bodyHtml = isset($post['body_html']) && is_string($post['body_html']) ? $post['body_html'] : '';
$faq = [];
if (isset($post['faq']) && is_array($post['faq'])) {
    foreach ($post['faq'] as $item) {
        if (is_array($item) && $text($item, 'question') !== '' && $text($item, 'answer') !== '') {
            $faq[] = ['question' => $text($item, 'question'), 'answer' => $text($item, 'answer')];
        }
    }
}
$commentsEnabled = ($post['comments_enabled'] ?? false) === true;
$comments = isset($post['comments']) && is_array($post['comments'])
    ? array_values(array_filter($post['comments'], 'is_array'))
    : [];

$canonical = $siteUrl . '/resources/' . rawurlencode($postSlug);
$metaTitle = $text($post, 'meta_title', $title . ' | Forge Performance Therapy');
$metaDescription = $text($post, 'meta_description', $excerpt);

// Related resources: same category first, then the newest others, excluding this post.
$candidates = array_values(array_filter(
    $relatedPosts,
    static fn (array $item): bool => isset($item['slug']) && is_string($item['slug']) && $item['slug'] !== '' && $item['slug'] !== $postSlug
));
usort($candidates, static function (array $a, array $b) use ($category): int {
    $aMatch = ($a['category'] ?? null) === $category && $category !== '' ? 0 : 1;
    $bMatch = ($b['category'] ?? null) === $category && $category !== '' ? 0 : 1;

    return $aMatch <=> $bMatch;
});
$related = array_slice($candidates, 0, 3);

$organizationId = $siteUrl . '/#organization';
$blogPosting = [
    '@type' => 'BlogPosting',
    '@id' => $canonical . '#article',
    'mainEntityOfPage' => ['@type' => 'WebPage', '@id' => $canonical],
    'url' => $canonical,
    'headline' => mb_substr($title, 0, 110),
    'description' => $metaDescription,
    'datePublished' => $publishedIso,
    'dateModified' => $updatedIso,
    'author' => ['@type' => 'Person', 'name' => $authorName],
    'publisher' => [
        '@type' => 'Organization',
        '@id' => $organizationId,
        'name' => 'Forge Performance Therapy',
        'url' => $siteUrl . '/',
    ],
    'inLanguage' => 'en-US',
];
if ($coverUrl !== '') {
    $blogPosting['image'] = ['@type' => 'ImageObject', 'url' => $coverUrl, 'caption' => $coverAlt];
}
if ($category !== '') {
    $blogPosting['articleSection'] = $category;
}
if ($tags !== []) {
    $blogPosting['keywords'] = implode(', ', $tags);
}
$blogPosting = array_filter($blogPosting, static fn (mixed $value): bool => $value !== '');

$graph = [
    $blogPosting,
    [
        '@type' => 'BreadcrumbList',
        '@id' => $canonical . '#breadcrumb',
        'itemListElement' => [
            ['@type' => 'ListItem', 'position' => 1, 'name' => 'Home', 'item' => $siteUrl . '/'],
            ['@type' => 'ListItem', 'position' => 2, 'name' => 'Resources', 'item' => $siteUrl . '/resources/'],
            ['@type' => 'ListItem', 'position' => 3, 'name' => $title, 'item' => $canonical],
        ],
    ],
];
if ($faq !== []) {
    $graph[] = [
        '@type' => 'FAQPage',
        '@id' => $canonical . '#faq',
        'mainEntity' => array_map(static fn (array $item): array => [
            '@type' => 'Question',
            'name' => $item['question'],
            'acceptedAnswer' => ['@type' => 'Answer', 'text' => $item['answer']],
        ], $faq),
    ];
}

$articleTags = [];
$articleMeta = [
    'article:published_time' => $publishedIso,
    'article:modified_time' => $updatedIso,
    'article:author' => $authorName,
    'article:section' => $category,
];
foreach ($articleMeta as $property => $content) {
    if ($content !== '') {
        $articleTags[] = '<meta property="' . $property . '" content="' . $escape($content) . '">';
    }
}
foreach ($tags as $tag) {
    $articleTags[] = '<meta property="article:tag" content="' . $escape($tag) . '">';
}
if ($coverUrl !== '' && $coverAlt !== '') {
    $articleTags[] = '<meta property="og:image:alt" content="' . $escape($coverAlt) . '">';
}

$renderHeader([
    'title' => $metaTitle,
    'description' => $metaDescription,
    'canonical' => $canonical,
    'type' => 'article',
    'image' => $coverUrl,
    'site_name' => 'Forge Performance Therapy',
    'json_ld' => ['@context' => 'https://schema.org', '@graph' => $graph],
], implode("\n", $articleTags) . "\n" . $pageStyles);
?>
<main id="main-content" class="page-shell">
  <nav class="breadcrumbs" aria-label="Breadcrumb">
    <ol>
      <li><a href="/">Home</a></li>
      <li><a href="/resources/">Resources</a></li>
      <li aria-current="page"><?= $escape($title) ?></li>
    </ol>
  </nav>

  <article class="article" aria-labelledby="article-title">
    <header class="article__header">
      <?php if ($category !== ''): ?><span class="eyebrow"><?= $escape($category) ?></span><?php endif; ?>
      <h1 id="article-title"><?= $escape($title) ?></h1>
      <?php if ($excerpt !== ''): ?><p class="article__summary"><?= $escape($excerpt) ?></p><?php endif; ?>
      <div class="article__meta">
        <span>By <?= $escape($authorName) ?></span>
        <?php if ($publishedIso !== ''): ?><span>Published <time datetime="<?= $escape($publishedIso) ?>"><?= $escape($displayDate($publishedRaw)) ?></time></span><?php endif; ?>
        <?php if ($updatedIso !== '' && $updatedIso !== $publishedIso): ?><span>Updated <time datetime="<?= $escape($updatedIso) ?>"><?= $escape($displayDate($updatedRaw)) ?></time></span><?php endif; ?>
      </div>
    </header>

    <?php if ($coverUrl !== ''): ?>
      <figure class="article__cover">
        <img src="<?= $escape($coverUrl) ?>" alt="<?= $escape($coverAlt) ?>" decoding="async">
      </figure>
    <?php endif; ?>

    <div class="article__body">
      <?= $bodyHtml /* Generated by the API's CommonMark renderer with raw HTML stripped and unsafe links disabled. */ ?>
    </div>

    <?php if ($tags !== []): ?>
      <ul class="article__tags" aria-label="Tags">
        <?php foreach ($tags as $tag): ?><li><?= $escape($tag) ?></li><?php endforeach; ?>
      </ul>
    <?php endif; ?>

    <?php if ($faq !== []): ?>
      <section id="faq" class="article-section" aria-labelledby="faq-title">
        <h2 id="faq-title">Frequently asked questions</h2>
        <div class="faq-list">
          <?php foreach ($faq as $index => $item): ?>
            <details<?= $index === 0 ? ' open' : '' ?>>
              <summary><?= $escape($item['question']) ?></summary>
              <p><?= $escape($item['answer']) ?></p>
            </details>
          <?php endforeach; ?>
        </div>
      </section>
    <?php endif; ?>

    <section id="comments" class="article-section" aria-labelledby="comments-title" data-comments data-api-url="<?= $escape($publicApiUrl) ?>" data-slug="<?= $escape($postSlug) ?>">
      <h2 id="comments-title">Comments <span data-comment-count>(<?= count($comments) ?>)</span></h2>
      <p class="comments-empty" data-comment-empty<?= $comments === [] ? '' : ' hidden' ?>>No comments yet.</p>
      <ol class="comment-list" data-comment-list>
        <?php foreach ($comments as $comment): ?>
          <?php $commentDate = $text($comment, 'created_at'); ?>
          <li class="comment">
            <div class="comment__meta">
              <strong><?= $escape($text($comment, 'author_name', 'Anonymous')) ?></strong>
              <?php if ($isoDate($commentDate) !== ''): ?><time datetime="<?= $escape($isoDate($commentDate)) ?>"><?= $escape($displayDate($commentDate)) ?></time><?php endif; ?>
            </div>
            <p class="comment__body"><?= $escape($text($comment, 'body')) ?></p>
          </li>
        <?php endforeach; ?>
      </ol>

      <?php if ($commentsEnabled): ?>
        <form class="contact-form comment-form" data-comment-form novalidate>
          <h3>Leave a comment</h3>
          <p class="comments-empty">Comments are reviewed before they appear. Your email is never published.</p>
          <div class="form-row">
            <div class="field"><label for="comment-name">Name</label><input id="comment-name" class="input" name="author_name" type="text" autocomplete="name" maxlength="100" required></div>
            <div class="field"><label for="comment-email">Email</label><input id="comment-email" class="input" name="author_email" type="email" autocomplete="email" maxlength="254" required></div>
          </div>
          <div class="field"><label for="comment-body">Comment</label><textarea id="comment-body" class="input" name="body" rows="5" maxlength="5000" required></textarea></div>
          <div class="comment-form__honeypot" aria-hidden="true">
            <label for="comment-website">Website</label>
            <input id="comment-website" name="website" type="text" tabindex="-1" autocomplete="off" value="">
          </div>
          <p class="comment-form__status" data-comment-status role="status" aria-live="polite"></p>
          <button class="button button--outline" type="submit">Post comment</button>
          <noscript><p class="comments-empty">Please enable JavaScript to post a comment.</p></noscript>
        </form>
      <?php endif; ?>
    </section>
  </article>

  <?php if ($related !== []): ?>
    <section class="section resources related" aria-labelledby="related-title">
      <div class="section-heading">
        <span class="eyebrow">Keep reading</span>
        <h2 id="related-title" class="section-title">Related resources</h2>
      </div>
      <ul class="resource-grid" role="list" style="margin:0;padding:0;list-style:none">
        <?php foreach ($related as $item): ?>
          <?php
          $itemPublished = $text($item, 'published_at');
          $itemUrl = '/resources/' . rawurlencode((string) $item['slug']);
          ?>
          <li class="resource-card">
            <div class="resource-card__meta">
              <span><?= $escape($text($item, 'category', 'Resource')) ?></span>
              <?php if ($isoDate($itemPublished) !== ''): ?><time datetime="<?= $escape($isoDate($itemPublished)) ?>"><?= $escape($displayDate($itemPublished)) ?></time><?php endif; ?>
            </div>
            <h3><a href="<?= $escape($itemUrl) ?>"><?= $escape($text($item, 'title', 'Untitled resource')) ?></a></h3>
            <p><?= $escape($text($item, 'excerpt')) ?></p>
          </li>
        <?php endforeach; ?>
      </ul>
    </section>
  <?php endif; ?>
</main>
<script src="/assets/js/comments.js" defer></script>
<?php
Layout::footer();
