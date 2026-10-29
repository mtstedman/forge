<?php

declare(strict_types=1);

namespace Forge\Api\Repository;

use PDO;
use RuntimeException;

/**
 * Persists the singleton main-page content document (main_page_content.id = 1).
 * The document is stored as one JSON object and always replaced as a whole.
 */
final class MainPageContentRepository
{
    private const SINGLETON_ID = 1;

    public function __construct(private readonly PDO $pdo)
    {
    }

    /** @return array<string, mixed>|null The stored document, or null when no row exists. */
    public function find(): ?array
    {
        $statement = $this->pdo->prepare('SELECT document FROM main_page_content WHERE id = :id');
        $statement->execute(['id' => self::SINGLETON_ID]);
        $document = $statement->fetchColumn();
        if (!is_string($document)) {
            return null;
        }

        $decoded = json_decode($document, true, 64, JSON_THROW_ON_ERROR);
        if (!is_array($decoded)) {
            throw new RuntimeException('Stored main-page content is not a JSON object.');
        }

        return $decoded;
    }

    /**
     * Atomically replaces the whole document with an already validated one.
     *
     * @param array<string, mixed> $document
     */
    public function replace(array $document): void
    {
        $json = json_encode($document, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        $now = gmdate('Y-m-d\TH:i:s\Z');

        // A single upsert statement is atomic: readers see either the previous or the new document.
        $statement = $this->pdo->prepare(<<<'SQL'
            INSERT INTO main_page_content (id, document, created_at, updated_at)
            VALUES (:id, :document, :created_at, :updated_at)
            ON CONFLICT (id) DO UPDATE SET
                document = excluded.document,
                updated_at = excluded.updated_at
            SQL);
        $statement->execute([
            'id' => self::SINGLETON_ID,
            'document' => $json,
            'created_at' => $now,
            'updated_at' => $now,
        ]);
    }
}
