<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use PDO;

final class ConsultationRequestRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $now = self::now();
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO consultation_requests (
                name, phone, email, best_time, message, consented_at, status, created_at, resolved_at
            ) VALUES (
                :name, :phone, :email, :best_time, :message, :consented_at, 'pending', :created_at, NULL
            )
            SQL);
        $statement->execute([
            'name' => (string) ($data['name'] ?? ''),
            'phone' => (string) ($data['phone'] ?? ''),
            'email' => $data['email'] ?? null,
            'best_time' => (string) ($data['best_time'] ?? ''),
            'message' => (string) ($data['message'] ?? ''),
            'consented_at' => $now,
            'created_at' => $now,
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return list<array<string, mixed>> */
    public function listByStatus(string $status, int $limit, int $offset): array
    {
        $statement = $this->pdo->prepare(
            'SELECT * FROM consultation_requests WHERE status = :status '
            . 'ORDER BY created_at DESC, id DESC LIMIT :limit OFFSET :offset'
        );
        $statement->bindValue(':status', $status);
        $statement->bindValue(':limit', max(0, $limit), PDO::PARAM_INT);
        $statement->bindValue(':offset', max(0, $offset), PDO::PARAM_INT);
        $statement->execute();

        return $this->hydrateMany($statement->fetchAll());
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM consultation_requests WHERE id = :id LIMIT 1');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    public function setStatus(int $id, string $status): void
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            UPDATE consultation_requests
            SET status = :status,
                resolved_at = CASE WHEN status = :current_status THEN resolved_at ELSE :resolved_at END
            WHERE id = :id
            SQL);
        $statement->bindValue(':status', $status);
        $statement->bindValue(':current_status', $status);
        $statement->bindValue(':resolved_at', self::now());
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    /**
     * @param array<int, array<string, mixed>> $rows
     * @return list<array<string, mixed>>
     */
    private function hydrateMany(array $rows): array
    {
        return array_map(fn (array $row): array => $this->hydrate($row), $rows);
    }

    /** @param array<string, mixed> $row @return array<string, mixed> */
    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];

        return $row;
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z');
    }
}
