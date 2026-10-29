<?php

declare(strict_types=1);

namespace Forge\Api;

use PDO;
use RuntimeException;
use Throwable;

final class Migrator
{
    public static function migrate(PDO $pdo): void
    {
        $path = dirname(__DIR__) . '/database/schema.sql';
        $schema = @file_get_contents($path);
        if ($schema === false) {
            throw new RuntimeException('Unable to read the database schema.');
        }

        $pdo->exec($schema);

        $ownsTransaction = !$pdo->inTransaction();
        if ($ownsTransaction) {
            $pdo->beginTransaction();
        }
        try {
            self::addPostCategories($pdo);
            self::seedTaxonomy($pdo);
            self::addMainPageImageFields($pdo);
            if ($ownsTransaction) {
                $pdo->commit();
            }
        } catch (Throwable $exception) {
            if ($ownsTransaction && $pdo->inTransaction()) {
                $pdo->rollBack();
            }
            throw $exception;
        }
    }

    /**
     * Adds the hero.image_url and about.portrait_url keys (as "", no image selected) to a
     * main-page document seeded before they existed. Only missing keys are set, so later
     * runs leave every stored value (including a chosen image URL) untouched.
     */
    private static function addMainPageImageFields(PDO $pdo): void
    {
        $pdo->exec(
            "UPDATE main_page_content SET document = json_set(document, '$.hero.image_url', '') "
            . "WHERE json_type(document, '$.hero.image_url') IS NULL"
        );
        $pdo->exec(
            "UPDATE main_page_content SET document = json_set(document, '$.about.portrait_url', '') "
            . "WHERE json_type(document, '$.about.portrait_url') IS NULL"
        );
    }

    /**
     * Adds posts.categories to databases created with the older schema and backfills it
     * once from the legacy scalar category. Later runs see the column and leave every
     * selection (including deliberately emptied ones) untouched.
     */
    private static function addPostCategories(PDO $pdo): void
    {
        foreach ($pdo->query('PRAGMA table_info(posts)')->fetchAll(PDO::FETCH_ASSOC) as $column) {
            if (($column['name'] ?? null) === 'categories') {
                return;
            }
        }

        $pdo->exec(
            "ALTER TABLE posts ADD COLUMN categories TEXT NOT NULL DEFAULT '[]' "
            . "CHECK (json_valid(categories) AND json_type(categories) = 'array')"
        );

        $rows = $pdo->query('SELECT id, category FROM posts')->fetchAll(PDO::FETCH_ASSOC);
        $update = $pdo->prepare('UPDATE posts SET categories = :categories WHERE id = :id');
        foreach ($rows as $row) {
            $category = trim((string) ($row['category'] ?? ''));
            if ($category === '') {
                continue;
            }
            $update->bindValue(':categories', json_encode([$category], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));
            $update->bindValue(':id', (int) $row['id'], PDO::PARAM_INT);
            $update->execute();
        }
    }

    /**
     * Ensures category and tag values already used by any post (draft or published) are
     * part of the reusable vocabulary. Additive and idempotent: existing entries are kept
     * and never duplicated.
     */
    private static function seedTaxonomy(PDO $pdo): void
    {
        $insert = $pdo->prepare(
            'INSERT OR IGNORE INTO taxonomy_terms (kind, name) VALUES (:kind, :name)'
        );
        $rows = $pdo->query('SELECT category, categories, tags FROM posts')->fetchAll(PDO::FETCH_ASSOC);
        foreach ($rows as $row) {
            $categories = self::decodeList($row['categories'] ?? null);
            $categories[] = $row['category'] ?? null;
            self::insertTerms($insert, 'category', $categories);
            self::insertTerms($insert, 'tag', self::decodeList($row['tags'] ?? null));
        }
    }

    /** @param array<mixed> $values */
    private static function insertTerms(\PDOStatement $insert, string $kind, array $values): void
    {
        foreach ($values as $value) {
            if (!is_string($value)) {
                continue;
            }
            $name = trim($value);
            if ($name === '') {
                continue;
            }
            $insert->execute(['kind' => $kind, 'name' => $name]);
        }
    }

    /** @return array<mixed> */
    private static function decodeList(mixed $json): array
    {
        if (!is_string($json)) {
            return [];
        }
        $value = json_decode($json, true);

        return is_array($value) ? array_values($value) : [];
    }
}
