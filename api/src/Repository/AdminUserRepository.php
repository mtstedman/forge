<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use PDO;

final class AdminUserRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null */
    public function findByEmail(string $email): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM admin_users WHERE email = :email LIMIT 1');
        $statement->execute(['email' => self::normalizeEmail($email)]);
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM admin_users WHERE id = :id LIMIT 1');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    public function create(string $email, string $passwordHash, string $name = ''): int
    {
        $now = self::now();
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO admin_users (email, name, password_hash, created_at, updated_at)
            VALUES (:email, :name, :password_hash, :created_at, :updated_at)
            SQL);
        $statement->execute([
            'email' => self::normalizeEmail($email),
            'name' => trim($name),
            'password_hash' => $passwordHash,
            'created_at' => $now,
            'updated_at' => $now,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    public function updatePassword(int $id, string $passwordHash): void
    {
        $statement = $this->pdo->prepare(
            'UPDATE admin_users SET password_hash = :password_hash, updated_at = :updated_at WHERE id = :id'
        );
        $statement->bindValue(':password_hash', $passwordHash);
        $statement->bindValue(':updated_at', self::now());
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    private static function normalizeEmail(string $email): string
    {
        return strtolower(trim($email));
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrate(array $row): array
    {
        return [
            'id' => (int) $row['id'],
            'email' => (string) $row['email'],
            'name' => (string) $row['name'],
            'password_hash' => (string) $row['password_hash'],
            'created_at' => (string) $row['created_at'],
            'updated_at' => (string) $row['updated_at'],
        ];
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z');
    }
}
