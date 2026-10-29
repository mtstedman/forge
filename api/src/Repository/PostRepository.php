<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use Forge\Api\Markdown;
use JsonException;
use PDO;
use RuntimeException;
use Throwable;

final class PostRepository
{
    /**
     * Editable columns (plus server-generated body_html) that a pending draft of a
     * published post stores separately from the live posts row.
     */
    private const DRAFT_COLUMNS = [
        'slug', 'title', 'excerpt', 'body_markdown', 'body_html', 'category', 'categories', 'tags', 'faq',
        'meta_title', 'meta_description', 'cover_media_id', 'author_name', 'comments_enabled',
    ];
    private const DRAFT_PREFIX = 'draft__';

    public function __construct(private readonly PDO $pdo)
    {
    }

    /**
     * Live published posts, newest first. When $tags is nonempty only posts whose live
     * tags contain at least one of them (exact, case-sensitive match after trimming)
     * are returned, each once; the filter applies before pagination.
     *
     * @param list<string> $tags
     * @return array<int, array<string, mixed>>
     */
    public function listPublished(int $limit, int $offset, array $tags = []): array
    {
        [$where, $params] = self::publishedFilter($tags);
        $statement = $this->pdo->prepare(
            'SELECT * FROM posts WHERE ' . $where . ' ORDER BY published_at DESC, id DESC LIMIT :limit OFFSET :offset'
        );
        foreach ($params as $name => $value) {
            $statement->bindValue($name, $value, PDO::PARAM_STR);
        }
        $statement->bindValue(':limit', max(0, $limit), PDO::PARAM_INT);
        $statement->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
        $statement->execute();

        return $this->hydrateMany($statement->fetchAll());
    }

    /**
     * Number of live published posts matching the optional tag filter (see listPublished()).
     *
     * @param list<string> $tags
     */
    public function countPublished(array $tags = []): int
    {
        [$where, $params] = self::publishedFilter($tags);
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM posts WHERE ' . $where);
        foreach ($params as $name => $value) {
            $statement->bindValue($name, $value, PDO::PARAM_STR);
        }
        $statement->execute();

        return (int) $statement->fetchColumn();
    }

    /**
     * Unique trimmed, nonblank string tags used by live published posts, sorted
     * case-insensitively with an exact-string tie-breaker. Pending draft edits,
     * unpublished posts and unused vocabulary are never included.
     *
     * @return list<string>
     */
    public function publishedTags(): array
    {
        $statement = $this->pdo->query("SELECT p.tags FROM posts p WHERE p.status = 'published'");

        $tags = [];
        foreach ($statement->fetchAll(PDO::FETCH_COLUMN) as $json) {
            foreach (self::decodeArray((string) $json) as $tag) {
                if (!is_string($tag)) {
                    continue;
                }
                $tag = trim($tag);
                if ($tag !== '') {
                    $tags[$tag] = true;
                }
            }
        }

        $tags = array_map('strval', array_keys($tags));
        usort($tags, static function (string $a, string $b): int {
            return strcasecmp($a, $b) ?: strcmp($a, $b);
        });

        return $tags;
    }

    /** @return array<string, mixed>|null */
    public function findPublishedBySlug(string $slug): ?array
    {
        $statement = $this->pdo->prepare(
            "SELECT * FROM posts WHERE slug = :slug AND status = 'published' LIMIT 1"
        );
        $statement->execute(['slug' => $slug]);

        return $this->hydrateOne($statement->fetch());
    }

    /**
     * Admin listing. A published post with pending edits is returned with its latest
     * saved draft values overlaid on the live row (`has_draft` true); the status filter
     * applies to the live publication state.
     *
     * @return array<int, array<string, mixed>>
     */
    public function listAll(?string $status = null): array
    {
        if ($status === null) {
            $statement = $this->pdo->query(self::adminSelect() . ' ORDER BY p.created_at DESC, p.id DESC');
        } else {
            $statement = $this->pdo->prepare(
                self::adminSelect() . ' WHERE p.status = :status ORDER BY p.created_at DESC, p.id DESC'
            );
            $statement->execute(['status' => $status]);
        }

        return array_map(fn (array $row): array => $this->hydrateAdmin($row), $statement->fetchAll());
    }

    /**
     * Admin read of one post, with any pending draft overlaid (see listAll()).
     *
     * @return array<string, mixed>|null
     */
    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare(self::adminSelect() . ' WHERE p.id = :id LIMIT 1');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrateAdmin($row) : null;
    }

    /**
     * Whether a post other than $exceptId uses the slug, either live or reserved by its
     * pending draft.
     */
    public function slugInUse(string $slug, ?int $exceptId = null): bool
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            SELECT 1 FROM posts WHERE slug = :live_slug AND id <> :live_id
            UNION ALL
            SELECT 1 FROM post_drafts WHERE slug = :draft_slug AND post_id <> :draft_id
            LIMIT 1
            SQL);
        $statement->bindValue(':live_slug', $slug);
        $statement->bindValue(':live_id', $exceptId ?? 0, PDO::PARAM_INT);
        $statement->bindValue(':draft_slug', $slug);
        $statement->bindValue(':draft_id', $exceptId ?? 0, PDO::PARAM_INT);
        $statement->execute();

        return $statement->fetchColumn() !== false;
    }

    /**
     * Categories and tags are normalized (trimmed, nonempty, unique, in selection order).
     * Explicit `categories` wins over the legacy scalar `category`, which maps to a
     * singleton selection (or none when blank). The post and any new vocabulary entries
     * are saved atomically.
     *
     * @param array<string, mixed> $data
     */
    public function create(array $data): int
    {
        [$categories, $category] = self::resolveCategories($data, null);
        $tags = self::normalizeTerms($data['tags'] ?? []);
        $now = self::now();
        $bodyMarkdown = (string) ($data['body_markdown'] ?? '');

        return $this->transactional(function () use ($data, $categories, $category, $tags, $now, $bodyMarkdown): int {
            $statement = $this->pdo->prepare(<<<'SQL'
                INSERT INTO posts (
                    slug, title, excerpt, body_markdown, body_html, category, categories, tags, faq,
                    meta_title, meta_description, cover_media_id, author_name, status,
                    comments_enabled, published_at, created_at, updated_at
                ) VALUES (
                    :slug, :title, :excerpt, :body_markdown, :body_html, :category, :categories, :tags, :faq,
                    :meta_title, :meta_description, :cover_media_id, :author_name, :status,
                    :comments_enabled, :published_at, :created_at, :updated_at
                )
                SQL);
            $statement->execute([
                'slug' => (string) ($data['slug'] ?? ''),
                'title' => (string) ($data['title'] ?? ''),
                'excerpt' => (string) ($data['excerpt'] ?? ''),
                'body_markdown' => $bodyMarkdown,
                'body_html' => Markdown::toHtml($bodyMarkdown),
                'category' => $category,
                'categories' => self::encodeArray($categories),
                'tags' => self::encodeArray($tags),
                'faq' => self::encodeArray($data['faq'] ?? []),
                'meta_title' => $data['meta_title'] ?? null,
                'meta_description' => $data['meta_description'] ?? null,
                'cover_media_id' => $data['cover_media_id'] ?? null,
                'author_name' => (string) ($data['author_name'] ?? ''),
                'status' => (string) ($data['status'] ?? 'draft'),
                'comments_enabled' => (int) ($data['comments_enabled'] ?? 0),
                'published_at' => $data['published_at'] ?? null,
                'created_at' => $now,
                'updated_at' => $now,
            ]);
            $id = (int) $this->pdo->lastInsertId();

            $this->rememberTerms('category', $categories);
            $this->rememberTerms('tag', $tags);

            return $id;
        });
    }

    /**
     * Omitted `categories`/`category` and `tags` keep the current selections.
     *
     * Unpublished posts are edited in place. For a published post the live row is left
     * untouched: the edits are merged with the latest saved values (any existing pending
     * draft) and stored as its single pending draft until publish() promotes it.
     *
     * @param array<string, mixed> $data
     */
    public function update(int $id, array $data): void
    {
        $current = $this->find($id);
        if ($current === null) {
            return;
        }

        [$categories, $category] = self::resolveCategories($data, $current);
        $tags = array_key_exists('tags', $data) ? self::normalizeTerms($data['tags']) : $current['tags'];
        $post = array_replace($current, $data);
        $bodyMarkdown = (string) ($post['body_markdown'] ?? '');

        if ($current['status'] === 'published') {
            $this->saveDraft($id, $post, $categories, $category, $tags, $bodyMarkdown);

            return;
        }

        $this->transactional(function () use ($id, $post, $categories, $category, $tags, $bodyMarkdown): void {
            $statement = $this->pdo->prepare(<<<'SQL'
                UPDATE posts SET
                    slug = :slug,
                    title = :title,
                    excerpt = :excerpt,
                    body_markdown = :body_markdown,
                    body_html = :body_html,
                    category = :category,
                    categories = :categories,
                    tags = :tags,
                    faq = :faq,
                    meta_title = :meta_title,
                    meta_description = :meta_description,
                    cover_media_id = :cover_media_id,
                    author_name = :author_name,
                    status = :status,
                    comments_enabled = :comments_enabled,
                    published_at = :published_at,
                    updated_at = :updated_at
                WHERE id = :id
                SQL);
            $statement->execute([
                'slug' => (string) $post['slug'],
                'title' => (string) $post['title'],
                'excerpt' => (string) $post['excerpt'],
                'body_markdown' => $bodyMarkdown,
                'body_html' => Markdown::toHtml($bodyMarkdown),
                'category' => $category,
                'categories' => self::encodeArray($categories),
                'tags' => self::encodeArray($tags),
                'faq' => self::encodeArray($post['faq'] ?? []),
                'meta_title' => $post['meta_title'] ?? null,
                'meta_description' => $post['meta_description'] ?? null,
                'cover_media_id' => $post['cover_media_id'] ?? null,
                'author_name' => (string) $post['author_name'],
                'status' => (string) $post['status'],
                'comments_enabled' => (int) $post['comments_enabled'],
                'published_at' => $post['published_at'] ?? null,
                'updated_at' => self::now(),
                'id' => $id,
            ]);

            $this->rememberTerms('category', $categories);
            $this->rememberTerms('tag', $tags);
        });
    }

    /**
     * Reusable vocabulary in deterministic alphabetical order.
     *
     * @return array{categories: list<string>, tags: list<string>}
     */
    public function taxonomy(): array
    {
        $statement = $this->pdo->query(
            'SELECT kind, name FROM taxonomy_terms ORDER BY name COLLATE NOCASE ASC, name ASC, id ASC'
        );
        $taxonomy = ['categories' => [], 'tags' => []];
        foreach ($statement->fetchAll(PDO::FETCH_ASSOC) as $row) {
            $taxonomy[$row['kind'] === 'category' ? 'categories' : 'tags'][] = (string) $row['name'];
        }

        return $taxonomy;
    }

    /** Deleting the post also removes its pending draft (ON DELETE CASCADE). */
    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM posts WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    /**
     * Publishes the post, atomically promoting any pending draft into the live row and
     * clearing it. The first publication timestamp is preserved. On failure (for example
     * a slug conflict) both the live row and the pending draft are left unchanged.
     */
    public function publish(int $id): void
    {
        $this->transactional(function () use ($id): void {
            $this->promoteDraft($id);

            $statement = $this->pdo->prepare(<<<'SQL'
                UPDATE posts
                SET status = 'published',
                    published_at = COALESCE(published_at, :published_at),
                    updated_at = :updated_at
                WHERE id = :id
                SQL);
            $now = self::now();
            $statement->bindValue(':published_at', $now);
            $statement->bindValue(':updated_at', $now);
            $statement->bindValue(':id', $id, PDO::PARAM_INT);
            $statement->execute();
        });
    }

    /**
     * Removes the post from public view. Pending edits become the ordinary unpublished
     * draft (the live row takes the latest saved values) and the pending draft is cleared.
     */
    public function unpublish(int $id): void
    {
        $this->transactional(function () use ($id): void {
            $this->promoteDraft($id);

            $statement = $this->pdo->prepare(
                "UPDATE posts SET status = 'draft', updated_at = :updated_at WHERE id = :id"
            );
            $statement->bindValue(':updated_at', self::now());
            $statement->bindValue(':id', $id, PDO::PARAM_INT);
            $statement->execute();
        });
    }

    /**
     * Stores the merged editable values as the post's single pending draft, replacing
     * any previous one. The live posts row is not modified.
     *
     * @param array<string, mixed> $post
     * @param list<string> $categories
     * @param array<mixed> $tags
     */
    private function saveDraft(int $id, array $post, array $categories, string $category, array $tags, string $bodyMarkdown): void
    {
        $this->transactional(function () use ($id, $post, $categories, $category, $tags, $bodyMarkdown): void {
            $statement = $this->pdo->prepare(<<<'SQL'
                INSERT INTO post_drafts (
                    post_id, slug, title, excerpt, body_markdown, body_html, category, categories, tags, faq,
                    meta_title, meta_description, cover_media_id, author_name, comments_enabled,
                    created_at, updated_at
                ) VALUES (
                    :post_id, :slug, :title, :excerpt, :body_markdown, :body_html, :category, :categories, :tags, :faq,
                    :meta_title, :meta_description, :cover_media_id, :author_name, :comments_enabled,
                    :created_at, :updated_at
                )
                ON CONFLICT (post_id) DO UPDATE SET
                    slug = excluded.slug,
                    title = excluded.title,
                    excerpt = excluded.excerpt,
                    body_markdown = excluded.body_markdown,
                    body_html = excluded.body_html,
                    category = excluded.category,
                    categories = excluded.categories,
                    tags = excluded.tags,
                    faq = excluded.faq,
                    meta_title = excluded.meta_title,
                    meta_description = excluded.meta_description,
                    cover_media_id = excluded.cover_media_id,
                    author_name = excluded.author_name,
                    comments_enabled = excluded.comments_enabled,
                    updated_at = excluded.updated_at
                SQL);
            $now = self::now();
            $statement->execute([
                'post_id' => $id,
                'slug' => (string) $post['slug'],
                'title' => (string) $post['title'],
                'excerpt' => (string) $post['excerpt'],
                'body_markdown' => $bodyMarkdown,
                'body_html' => Markdown::toHtml($bodyMarkdown),
                'category' => $category,
                'categories' => self::encodeArray($categories),
                'tags' => self::encodeArray($tags),
                'faq' => self::encodeArray($post['faq'] ?? []),
                'meta_title' => $post['meta_title'] ?? null,
                'meta_description' => $post['meta_description'] ?? null,
                'cover_media_id' => $post['cover_media_id'] ?? null,
                'author_name' => (string) $post['author_name'],
                'comments_enabled' => (int) $post['comments_enabled'],
                'created_at' => $now,
                'updated_at' => $now,
            ]);

            $this->rememberTerms('category', $categories);
            $this->rememberTerms('tag', $tags);
        });
    }

    /**
     * Copies a pending draft's editable values and generated HTML into the live row and
     * deletes the draft. No-op without a pending draft. Callers own the transaction.
     */
    private function promoteDraft(int $id): void
    {
        $select = $this->pdo->prepare('SELECT * FROM post_drafts WHERE post_id = :id LIMIT 1');
        $select->bindValue(':id', $id, PDO::PARAM_INT);
        $select->execute();
        $draft = $select->fetch();
        if (!is_array($draft)) {
            return;
        }

        $assignments = implode(', ', array_map(
            static fn (string $column): string => $column . ' = :' . $column,
            self::DRAFT_COLUMNS,
        ));
        $update = $this->pdo->prepare('UPDATE posts SET ' . $assignments . ' WHERE id = :id');
        foreach (self::DRAFT_COLUMNS as $column) {
            $value = $draft[$column];
            $update->bindValue(':' . $column, $value, match (true) {
                $value === null => PDO::PARAM_NULL,
                is_int($value) => PDO::PARAM_INT,
                default => PDO::PARAM_STR,
            });
        }
        $update->bindValue(':id', $id, PDO::PARAM_INT);
        $update->execute();

        $delete = $this->pdo->prepare('DELETE FROM post_drafts WHERE post_id = :id');
        $delete->bindValue(':id', $id, PDO::PARAM_INT);
        $delete->execute();
    }

    /**
     * WHERE clause and bound parameters selecting live published posts, optionally
     * restricted to those having any of $tags (ANY/OR). Stored tags are compared as
     * trimmed string values with exact (case-sensitive) equality; non-string entries
     * never match.
     *
     * @param array<mixed> $tags
     * @return array{0: string, 1: array<string, string>}
     */
    private static function publishedFilter(array $tags): array
    {
        $where = "status = 'published'";
        $params = [];
        foreach (array_values(array_unique(array_filter($tags, 'is_string'))) as $index => $tag) {
            $params[':tag' . $index] = $tag;
        }
        if ($params === []) {
            return [$where, []];
        }

        $where .= ' AND EXISTS (SELECT 1 FROM json_each(posts.tags) AS t'
            . " WHERE t.type = 'text' AND trim(t.value, char(32, 9, 10, 13, 11)) IN ("
            . implode(', ', array_keys($params)) . '))';

        return [$where, $params];
    }

    /** Live posts columns plus the pending draft's columns under DRAFT_PREFIX aliases. */
    private static function adminSelect(): string
    {
        $columns = ['p.*', 'd.post_id AS ' . self::DRAFT_PREFIX . 'post_id'];
        foreach ([...self::DRAFT_COLUMNS, 'updated_at'] as $column) {
            $columns[] = 'd.' . $column . ' AS ' . self::DRAFT_PREFIX . $column;
        }

        return 'SELECT ' . implode(', ', $columns) . ' FROM posts p LEFT JOIN post_drafts d ON d.post_id = p.id';
    }

    /**
     * Overlays a joined pending draft on the live row; live id, status, published_at and
     * created_at are kept, and updated_at is the draft's.
     *
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrateAdmin(array $row): array
    {
        $hasDraft = $row[self::DRAFT_PREFIX . 'post_id'] !== null;
        unset($row[self::DRAFT_PREFIX . 'post_id']);
        foreach ([...self::DRAFT_COLUMNS, 'updated_at'] as $column) {
            if ($hasDraft) {
                $row[$column] = $row[self::DRAFT_PREFIX . $column];
            }
            unset($row[self::DRAFT_PREFIX . $column]);
        }

        $post = $this->hydrate($row);
        $post['has_draft'] = $hasDraft;

        return $post;
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function hydrateMany(array $rows): array
    {
        return array_map(fn (array $row): array => $this->hydrate($row), $rows);
    }

    /** @return array<string, mixed>|null */
    private function hydrateOne(mixed $row): ?array
    {
        return is_array($row) ? $this->hydrate($row) : null;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['cover_media_id'] = $row['cover_media_id'] === null ? null : (int) $row['cover_media_id'];
        $row['comments_enabled'] = (int) $row['comments_enabled'];
        $row['categories'] = self::decodeArray((string) ($row['categories'] ?? '[]'));
        $row['tags'] = self::decodeArray((string) $row['tags']);
        $row['faq'] = self::decodeArray((string) $row['faq']);

        return $row;
    }

    /** @return array<mixed> */
    private static function decodeArray(string $json): array
    {
        try {
            $value = json_decode($json, true, 512, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new RuntimeException('Stored post JSON is invalid.', 0, $exception);
        }

        if (!is_array($value)) {
            throw new RuntimeException('Stored post JSON must be an array.');
        }

        return $value;
    }

    private static function encodeArray(mixed $value): string
    {
        if (!is_array($value)) {
            throw new RuntimeException('Post tags and FAQ values must be arrays.');
        }

        try {
            return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } catch (JsonException $exception) {
            throw new RuntimeException('Post tags or FAQ could not be encoded.', 0, $exception);
        }
    }

    /**
     * @param array<string, mixed> $data
     * @param array<string, mixed>|null $current
     * @return array{0: list<string>, 1: string}
     */
    private static function resolveCategories(array $data, ?array $current): array
    {
        if (array_key_exists('categories', $data)) {
            $categories = self::normalizeTerms($data['categories']);

            return [$categories, $categories[0] ?? ''];
        }
        if (array_key_exists('category', $data)) {
            $categories = self::normalizeTerms([(string) ($data['category'] ?? '')]);

            return [$categories, $categories[0] ?? ''];
        }
        if ($current !== null) {
            return [array_values($current['categories'] ?? []), (string) ($current['category'] ?? '')];
        }

        return [[], ''];
    }

    /** @return list<string> */
    private static function normalizeTerms(mixed $values): array
    {
        if (!is_array($values)) {
            throw new RuntimeException('Post categories and tags must be arrays.');
        }

        $terms = [];
        foreach ($values as $value) {
            if (!is_string($value)) {
                throw new RuntimeException('Post categories and tags must contain only strings.');
            }
            $term = trim($value);
            if ($term !== '' && !in_array($term, $terms, true)) {
                $terms[] = $term;
            }
        }

        return $terms;
    }

    /** @param array<mixed> $terms */
    private function rememberTerms(string $kind, array $terms): void
    {
        $statement = $this->pdo->prepare(
            'INSERT OR IGNORE INTO taxonomy_terms (kind, name, created_at) VALUES (:kind, :name, :created_at)'
        );
        $now = self::now();
        foreach ($terms as $term) {
            if (!is_string($term) || trim($term) === '') {
                continue;
            }
            $statement->execute(['kind' => $kind, 'name' => trim($term), 'created_at' => $now]);
        }
    }

    /**
     * @template T
     * @param callable(): T $callback
     * @return T
     */
    private function transactional(callable $callback): mixed
    {
        if ($this->pdo->inTransaction()) {
            return $callback();
        }

        $this->pdo->beginTransaction();
        try {
            $result = $callback();
            $this->pdo->commit();
        } catch (Throwable $exception) {
            if ($this->pdo->inTransaction()) {
                $this->pdo->rollBack();
            }
            throw $exception;
        }

        return $result;
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z');
    }
}
