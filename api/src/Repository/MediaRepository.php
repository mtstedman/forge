<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use PDO;

final class MediaRepository
{
    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @param array<string, mixed> $data */
    public function create(array $data): int
    {
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO media (
                filename, original_name, mime_type, size_bytes, width, height, alt_text, created_at
            ) VALUES (
                :filename, :original_name, :mime_type, :size_bytes, :width, :height, :alt_text, :created_at
            )
            SQL);
        $statement->execute([
            'filename' => (string) ($data['filename'] ?? ''),
            'original_name' => (string) ($data['original_name'] ?? ''),
            'mime_type' => (string) ($data['mime_type'] ?? ''),
            'size_bytes' => (int) ($data['size_bytes'] ?? 0),
            'width' => $data['width'] ?? null,
            'height' => $data['height'] ?? null,
            'alt_text' => $data['alt_text'] ?? null,
            'created_at' => self::now(),
        ]);

        return (int) $this->pdo->lastInsertId();
    }

    /** @return array<string, mixed>|null */
    public function find(int $id): ?array
    {
        $statement = $this->pdo->prepare('SELECT * FROM media WHERE id = :id LIMIT 1');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
        $row = $statement->fetch();

        return is_array($row) ? $this->hydrate($row) : null;
    }

    /** @return array<int, array<string, mixed>> */
    public function list(): array
    {
        $statement = $this->pdo->query('SELECT * FROM media ORDER BY created_at DESC, id DESC');

        return array_map(fn (array $row): array => $this->hydrate($row), $statement->fetchAll());
    }

    public function delete(int $id): void
    {
        $statement = $this->pdo->prepare('DELETE FROM media WHERE id = :id');
        $statement->bindValue(':id', $id, PDO::PARAM_INT);
        $statement->execute();
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function hydrate(array $row): array
    {
        $row['id'] = (int) $row['id'];
        $row['size_bytes'] = (int) $row['size_bytes'];
        $row['width'] = $row['width'] === null ? null : (int) $row['width'];
        $row['height'] = $row['height'] === null ? null : (int) $row['height'];

        return $row;
    }

    private static function now(): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z');
    }
}
