<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use PDO;

final class CommentRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<int, array<string, mixed>> */
    public function listApprovedForPost(int $postId): array
    {
        $statement = $this->pdo->prepare(
            "SELECT * FROM comments WHERE post_id = :post_id AND status = 'approved' ORDER BY created_at ASC, id ASC"
        );
        $statement->bindValue(':post_id', $postId, PDO::PARAM_INT);
        $statement->execute();

        return $this->hydrateMany($statement->fetchAll());
    }

    /** @param array<string, mixed> $data */
    public function create(int $postId, array $data): int
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO comments (
                post_id, author_name, author_email, body, status, ip_hash, user_agent, created_at, moderated_at
            ) VALUES (
                :post_id, :author_name, :author_email, :body, 'pending', :ip_hash, :user_agent, :created_at, NULL
            )
            SQL);
        $statement->execute([
            'post_id' => $postId,
            'author_name' => (string) ($data['author_name'] ?? ''),
            'author_email' => $data['author_email'] ?? null,
            'body' => (string) ($data['body'] ?? ''),
            'ip_hash' => (string) ($data['ip_hash'] ?? ''),
            'user_agent' => $data['user_agent'] ?? null,
            'created_at' => self::now(),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return array<int, array<string, mixed>> */
    public function listByStatus(?string $status, int $limit, int $offset): array
    {
        if ($status === null) {
            $statement = $this->pdo->prepare(
                'SELECT * FROM comments ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset'
            );
        } else {
            $statement = $this->pdo->prepare(
                'SELECT * FROM comments WHERE status = :status ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset'
            );
            $statement->bindValue(':status', $status);
        }
        $statement->bindValue(':limit', max(0, $limit), PDO::PARAM_INT);
        $statement->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
        $statement->execute();

        return $this->hydrateMany($statement->fetchAll());
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM comments WHERE id = :id LIMIT 1');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    public function setStatus(int $id, string $status): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE comments SET status = :status, moderated_at = :moderated_at WHERE id = :id'
        );
        $statement->bindValue(':status', $status);
        $statement->bindValue(':moderated_at', self::now());
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM comments WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    public function countRecentByIpHash(string $ipHash, int $seconds): int
    {
        $cutoff = gmdate('Y-m-d\\TH:i:s\\Z', time() - max(0, $seconds));
        $statement = $this->pdo->prepare(
            'SELECT COUNT(*) FROM comments WHERE ip_hash = :ip_hash AND created_at >= :cutoff'
        );
        $statement->execute([
            'ip_hash' => $ipHash,
            'cutoff' => $cutoff,
        ]);

        return (int) $statement->fetchColumn();
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return array<int, array<string, mixed>>
     */
    private function hydrateMany(array $rows): array
    {
        return array_map(fn (array $row): array => $this->hydrate($row), $rows);
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['post_id'] = (int) $row['post_id'];

        return $row;
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z');
    }
}
