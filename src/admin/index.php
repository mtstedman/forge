<?php

declare(strict_types=1);

use Forge\Site\SiteConfig;

require_once dirname(__DIR__) . '/includes/bootstrap.php';

header('X-Robots-Tag: noindex, nofollow');
header('Cache-Control: no-store');
header('Pragma: no-cache');
header('X-Content-Type-Options: nosniff');
header('Referrer-Policy: no-referrer');

$config = [
    'authorizeUrl' => SiteConfig::get('OAUTH_AUTHORIZE_URL', ''),
    'tokenUrl' => SiteConfig::get('OAUTH_TOKEN_URL', ''),
    'clientId' => SiteConfig::get('OAUTH_CLIENT_ID', ''),
    'audience' => SiteConfig::get('OAUTH_AUDIENCE', ''),
    'scope' => SiteConfig::get('OAUTH_SCOPE', ''),
    'redirectUri' => SiteConfig::get('OAUTH_REDIRECT_URI', ''),
    'publicApiUrl' => SiteConfig::get('PUBLIC_API_URL', ''),
];

$origin = static function (?string $url): ?string {
    if (!is_string($url) || $url === '') {
        return null;
    }
    $parts = parse_url($url);
    if (!is_array($parts) || !isset($parts['scheme'], $parts['host'])) {
        return null;
    }
    $scheme = strtolower((string) $parts['scheme']);
    if ($scheme !== 'https' && $scheme !== 'http') {
        return null;
    }
    $value = $scheme . '://' . $parts['host'];
    if (isset($parts['port'])) {
        $value .= ':' . (int) $parts['port'];
    }

    return $value;
};

$connectSources = ["'self'"];
$imageSources = ["'self'", 'data:'];
foreach ([$config['tokenUrl'], $config['publicApiUrl']] as $url) {
    $source = $origin($url);
    if ($source !== null && !in_array($source, $connectSources, true)) {
        $connectSources[] = $source;
    }
}
$apiOrigin = $origin($config['publicApiUrl']);
if ($apiOrigin !== null) {
    $imageSources[] = $apiOrigin;
}

header("Content-Security-Policy: default-src 'none'; base-uri 'none'; connect-src " . implode(' ', $connectSources)
    . "; img-src " . implode(' ', array_unique($imageSources))
    . "; script-src 'self'; style-src 'self'; font-src 'self'; form-action 'none'; frame-ancestors 'none'; object-src 'none'");

$configJson = json_encode($config, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT);
?>
<!doctype html>
<html lang="en">
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <meta name="robots" content="noindex, nofollow">
    <title>Forge Admin</title>
    <link rel="stylesheet" href="/admin/assets/admin.css">
    <script src="/admin/assets/auth.js" defer></script>
    <script src="/admin/assets/admin.js" defer></script>
</head>
<body data-admin-config="<?= htmlspecialchars($configJson, ENT_QUOTES | ENT_SUBSTITUTE, 'UTF-8') ?>">
    <main id="auth-screen" class="auth-screen">
        <section class="auth-card" aria-labelledby="auth-title">
            <div class="brand-mark" aria-hidden="true">F</div>
            <p class="eyebrow">Forge Performance Therapy</p>
            <h1 id="auth-title">Administration</h1>
            <p id="auth-message" class="muted" aria-live="polite">Sign in to manage resources, media, and comments.</p>
            <form id="sign-in-form" class="auth-form" novalidate>
                <label class="field" for="sign-in-email">
                    Email
                    <input id="sign-in-email" name="email" type="email" autocomplete="username" required>
                </label>
                <label class="field" for="sign-in-password">
                    Password
                    <input id="sign-in-password" name="password" type="password" autocomplete="current-password" required>
                </label>
                <button id="sign-in" class="button button-primary" type="submit">Sign in</button>
            </form>
            <button id="sign-in-sso" class="button auth-sso" type="button" hidden>Sign in with single sign-on</button>
        </section>
    </main>

    <div id="admin-shell" class="admin-shell" hidden>
        <header class="topbar">
            <div>
                <p class="eyebrow">Forge Performance Therapy</p>
                <h1>Content administration</h1>
            </div>
            <div class="account">
                <span id="account-name"></span>
                <button id="sign-out" class="button button-quiet" type="button">Sign out</button>
            </div>
        </header>

        <nav class="tabs" aria-label="Admin sections">
            <button class="tab is-active" type="button" data-section="posts">Posts</button>
            <button class="tab" type="button" data-section="media">Media</button>
            <button class="tab" type="button" data-section="comments">Comments</button>
        </nav>

        <p id="global-message" class="notice" role="status" hidden></p>

        <section id="section-posts" class="admin-section">
            <div class="section-heading">
                <div>
                    <p class="eyebrow">Resources</p>
                    <h2>Posts</h2>
                </div>
                <div class="toolbar">
                    <label>Status
                        <select id="post-status-filter">
                            <option value="draft">Drafts</option>
                            <option value="published">Published</option>
                        </select>
                    </label>
                    <button id="new-post" class="button button-primary" type="button">New post</button>
                </div>
            </div>

            <div class="posts-layout">
                <aside class="panel post-list-panel" aria-label="Post list">
                    <div id="post-list" class="post-list"></div>
                </aside>

                <form id="post-form" class="panel editor">
                    <input id="post-id" type="hidden">
                    <div class="editor-heading">
                        <div>
                            <p id="post-status" class="status-pill">New draft</p>
                            <h3 id="editor-title">Create post</h3>
                        </div>
                        <div class="editor-actions">
                            <button id="delete-post" class="button button-danger" type="button" disabled>Delete</button>
                            <button id="unpublish-post" class="button" type="button" disabled>Unpublish</button>
                            <button id="publish-post" class="button" type="button">Publish</button>
                            <button class="button button-primary" type="submit">Save draft</button>
                        </div>
                    </div>

                    <div id="post-errors" class="field-errors" role="alert" hidden></div>
                    <div class="form-grid">
                        <label class="field field-wide">Title
                            <input id="post-title" name="title" required>
                        </label>
                        <label class="field">Slug
                            <input id="post-slug" name="slug" required pattern="[a-z0-9]+(?:-[a-z0-9]+)*">
                        </label>
                        <div class="field">
                            <label for="post-category">Categories <span class="hint">Type or paste, then use a comma</span></label>
                            <div class="taxonomy-control">
                                <div id="post-category-input-container" class="taxonomy-input-container">
                                    <div id="post-category-chips" class="taxonomy-chips"></div>
                                    <input id="post-category" class="taxonomy-input" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="post-category-suggestions">
                                </div>
                                <div id="post-category-suggestions" class="taxonomy-suggestions" role="listbox" aria-label="Saved category recommendations" hidden></div>
                            </div>
                        </div>
                        <label class="field field-wide">Excerpt
                            <textarea id="post-excerpt" name="excerpt" rows="3"></textarea>
                        </label>
                        <label class="field field-wide">Markdown body
                            <textarea id="post-body" name="body_markdown" rows="18"></textarea>
                        </label>
                        <div class="field field-wide">
                            <label for="post-tags">Tags <span class="hint">Type or paste, then use a comma</span></label>
                            <div class="taxonomy-control">
                                <div id="post-tags-input-container" class="taxonomy-input-container">
                                    <div id="post-tags-chips" class="taxonomy-chips"></div>
                                    <input id="post-tags" class="taxonomy-input" type="text" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="post-tags-suggestions">
                                </div>
                                <div id="post-tags-suggestions" class="taxonomy-suggestions" role="listbox" aria-label="Saved tag recommendations" hidden></div>
                            </div>
                        </div>
                        <label class="field">Meta title
                            <input id="post-meta-title" name="meta_title">
                        </label>
                        <label class="field">Meta description
                            <textarea id="post-meta-description" name="meta_description" rows="3"></textarea>
                        </label>
                        <label class="field">Cover image
                            <select id="post-cover" name="cover_media_id">
                                <option value="">No cover image</option>
                            </select>
                        </label>
                        <label class="check-field">
                            <input id="post-comments-enabled" name="comments_enabled" type="checkbox">
                            Enable comments
                        </label>
                    </div>

                    <div class="subsection">
                        <div class="subsection-heading">
                            <h4>Frequently asked questions</h4>
                            <button id="add-faq" class="button button-small" type="button">Add FAQ</button>
                        </div>
                        <div id="faq-list" class="faq-list"></div>
                    </div>
                </form>
            </div>
        </section>

        <section id="section-media" class="admin-section" hidden>
            <div class="section-heading">
                <div>
                    <p class="eyebrow">Library</p>
                    <h2>Media</h2>
                </div>
            </div>
            <form id="media-upload-form" class="panel upload-form">
                <label class="field">Image
                    <input id="media-file" type="file" name="file" accept="image/jpeg,image/png,image/webp,image/gif" required>
                </label>
                <label class="field">Alt text
                    <input id="media-alt" name="alt_text">
                </label>
                <button class="button button-primary" type="submit">Upload image</button>
            </form>
            <div id="media-list" class="media-grid"></div>
        </section>

        <section id="section-comments" class="admin-section" hidden>
            <div class="section-heading">
                <div>
                    <p class="eyebrow">Discussion</p>
                    <h2>Comment moderation</h2>
                </div>
                <label>Status
                    <select id="comment-status-filter">
                        <option value="pending">Pending</option>
                        <option value="approved">Approved</option>
                        <option value="rejected">Rejected</option>
                    </select>
                </label>
            </div>
            <div id="comment-list" class="comment-list"></div>
            <div class="pagination">
                <button id="comments-previous" class="button" type="button" disabled>Previous</button>
                <span id="comments-page">Page 1</span>
                <button id="comments-next" class="button" type="button">Next</button>
            </div>
        </section>
    </div>

    <noscript><p class="noscript">JavaScript is required to use the administrative interface.</p></noscript>
</body>
</html>
