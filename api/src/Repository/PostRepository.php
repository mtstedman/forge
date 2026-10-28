<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use Forge\Api\Markdown;
use JsonException;
use PDO;
use RuntimeException;

final class PostRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function listPublished(int $limit, int $offset): array
    {
        $statement = $this->pdo->prepare(
            "SELECT * FROM posts WHERE status = 'published' ORDER BY published_at DESC, id DESC LIMIT :limit OFFSET :offset"
        );
        $statement->bindValue(':limit', max(0, $limit), PDO::PARAM_INT);
        $statement->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
        $statement->execute();

        return $this->hydrateMany($statement->fetchAll());
    }

    public function countPublished(): int
    {
        $statement = $this->pdo->query("SELECT COUNT(*) FROM posts WHERE status = 'published'");

        return (int) $statement->fetchColumn();
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

    /** @return array<int, array<string, mixed>> */
    public function listAll(?string $status = null): array
    {
        if ($status === null) {
            $statement = $this->pdo->query('SELECT * FROM posts ORDER BY created_at DESC, id DESC');
        } else {
            $statement = $this->pdo->prepare(
                'SELECT * FROM posts WHERE status = :status ORDER BY created_at DESC, id DESC'
            );
            $statement->execute(['status' => $status]);
        }

        return $this->hydrateMany($statement->fetchAll());
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM posts WHERE id = :id LIMIT 1');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();

        return $this->hydrateOne($statement->fetch());
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $now = self::now();
        $bodyMarkdown = (string) ($data['body_markdown'] ?? '');
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO posts (
                slug, title, excerpt, body_markdown, body_html, category, tags, faq,
                meta_title, meta_description, cover_media_id, author_name, status,
                comments_enabled, published_at, created_at, updated_at
            ) VALUES (
                :slug, :title, :excerpt, :body_markdown, :body_html, :category, :tags, :faq,
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
            'category' => (string) ($data['category'] ?? ''),
            'tags' => self::encodeArray($data['tags'] ?? []),
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

        return (int) $this->pdo->lastInsertId();
    }

    /** @param array<string, mixed> $data */
    public function update(int $id, array $data): void
    {
        $current = $this->find($id);
        if ($current === null) {
            return;
        }

        $post = array_replace($current, $data);
        $bodyMarkdown = (string) ($post['body_markdown'] ?? '');
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE posts SET
                slug = :slug,
                title = :title,
                excerpt = :excerpt,
                body_markdown = :body_markdown,
                body_html = :body_html,
                category = :category,
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
            'category' => (string) $post['category'],
            'tags' => self::encodeArray($post['tags'] ?? []),
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
    }

    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM posts WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    public function publish(int $id): void
    {
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
    }

    public function unpublish(int $id): void
    {
        $statement = $this->pdo->prepare(
            "UPDATE posts SET status = 'draft', updated_at = :updated_at WHERE id = :id"
        );
        $statement->bindValue(':updated_at', self::now());
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
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

    private static function now(): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z');
    }
}
