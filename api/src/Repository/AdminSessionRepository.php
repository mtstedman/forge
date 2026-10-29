<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use PDO;

final class AdminSessionRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    public function create(int $adminUserId, string $tokenHash, string $expiresAt): int
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO admin_sessions (admin_user_id, token_hash, created_at, expires_at)
            VALUES (:admin_user_id, :token_hash, :created_at, :expires_at)
            SQL);
        $statement->bindValue(':admin_user_id', $adminUserId, PDO::PARAM_INT);
        $statement->bindValue(':token_hash', $tokenHash);
        $statement->bindValue(':created_at', self::now());
        $statement->bindValue(':expires_at', $expiresAt);
        $statement->execute();

        return (int) $this->pdo->lastInsertId();
    }

    /**
     * Returns the session joined with its admin user when the token hash is
     * known and the session has not expired at $now.
     *
     * @return array<string, mixed>|null
     */
    public function findActiveByTokenHash(string $tokenHash, string $now): ?array
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            SELECT
                s.id AS session_id,
                s.admin_user_id AS admin_user_id,
                s.created_at AS created_at,
                s.expires_at AS expires_at,
                u.email AS email,
                u.name AS name
            FROM admin_sessions s
            INNER JOIN admin_users u ON u.id = s.admin_user_id
            WHERE s.token_hash = :token_hash AND s.expires_at > :now
            LIMIT 1
            SQL);
        $statement->execute(['token_hash' => $tokenHash, 'now' => $now]);
        $row = $statement->fetch();
        if (!is_array($row)) {
            return null;
        }

        return [
            'id' => (int) $row['session_id'],
            'session_id' => (int) $row['session_id'],
            'admin_user_id' => (int) $row['admin_user_id'],
            'email' => (string) $row['email'],
            'name' => (string) $row['name'],
            'created_at' => (string) $row['created_at'],
            'expires_at' => (string) $row['expires_at'],
        ];
    }

    public function delete(int $sessionId): void
    {
        $statement = $this->pdo->prepare('DELETE FROM admin_sessions WHERE id = :id');
        $statement->bindValue(':id', $sessionId, PDO::PARAM_INT);
        $statement->execute();
    }

    public function purgeExpired(string $now): void
    {
        $statement = $this->pdo->prepare('DELETE FROM admin_sessions WHERE expires_at <= :now');
        $statement->execute(['now' => $now]);
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z');
    }
}
