<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Forge\Api\Database;
use Forge\Api\Markdown;
use Forge\Api\Migrator;
use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\MediaRepository;
use Forge\Api\Repository\PostRepository;
use PDO;
use PHPUnit\Framework\TestCase;

final class RepositoryTest extends TestCase
{
    private PDO $pdo;
    private PostRepository $posts;
    private CommentRepository $comments;

    protected function setUp(): void
    {
        $this->pdo = Database::create('sqlite::memory:');
        Migrator::migrate($this->pdo);
        Migrator::migrate($this->pdo);
        $this->posts = new PostRepository($this->pdo);
        $this->comments = new CommentRepository($this->pdo);
    }

    public function testSchemaMigrationIsIdempotentAndPostDefaultsAreSecure(): void
    {
        $statement = $this->pdo->prepare('INSERT INTO posts (slug, title) VALUES (:slug, :title)');
        $statement->execute(['slug' => 'defaults', 'title' => 'Defaults']);

        $row = $this->pdo->query("SELECT status, comments_enabled FROM posts WHERE slug = 'defaults'")->fetch();
        self::assertIsArray($row);
        self::assertSame('draft', $row['status']);
        self::assertSame(0, (int) $row['comments_enabled']);
    }

    public function testDraftsAreNotReturnedAsPublishedAndPublishingPreservesTimestamp(): void
    {
        $id = $this->posts->create($this->postData('draft-post'));

        self::assertNull($this->posts->findPublishedBySlug('draft-post'));

        $this->posts->publish($id);
        $published = $this->posts->findPublishedBySlug('draft-post');
        self::assertNotNull($published);
        self::assertSame('published', $published['status']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', (string) $published['published_at']);

        $publishedAt = $published['published_at'];
        $this->posts->publish($id);
        self::assertSame($publishedAt, $this->posts->find($id)['published_at']);

        $this->posts->unpublish($id);
        self::assertNull($this->posts->findPublishedBySlug('draft-post'));
    }

    public function testPublishedPostEditsArePendingUntilPromotedAtomically(): void
    {
        $media = new MediaRepository($this->pdo);
        $liveCover = $media->create($this->mediaData('live.webp'));
        $draftCover = $media->create($this->mediaData('draft.webp'));
        $data = $this->postData('live-slug');
        $data['cover_media_id'] = $liveCover;
        $data['meta_title'] = 'Live meta';
        $data['comments_enabled'] = 1;
        $id = $this->posts->create($data);
        $this->posts->publish($id);
        $live = $this->posts->findPublishedBySlug('live-slug');
        self::assertNotNull($live);
        self::assertFalse($this->posts->find($id)['has_draft']);
        $liveRow = $this->liveRow($id);

        $this->posts->update($id, [
            'slug' => 'draft-slug',
            'title' => 'Draft title',
            'excerpt' => 'Draft excerpt',
            'body_markdown' => '**Draft body**',
            'categories' => ['Mobility', 'Strength'],
            'tags' => ['hip'],
            'faq' => [['question' => 'Q?', 'answer' => 'A.']],
            'meta_title' => 'Draft meta',
            'meta_description' => 'Draft description',
            'cover_media_id' => $draftCover,
            'author_name' => 'Draft Author',
            'comments_enabled' => 0,
        ]);

        self::assertSame($liveRow, $this->liveRow($id));
        self::assertSame($live, $this->posts->findPublishedBySlug('live-slug'));
        self::assertNull($this->posts->findPublishedBySlug('draft-slug'));
        self::assertSame([$live], $this->posts->listPublished(10, 0));
        self::assertArrayNotHasKey('has_draft', $live);

        $pending = $this->posts->find($id);
        self::assertTrue($pending['has_draft']);
        self::assertSame('published', $pending['status']);
        self::assertSame($live['published_at'], $pending['published_at']);
        self::assertSame($live['created_at'], $pending['created_at']);
        self::assertSame('draft-slug', $pending['slug']);
        self::assertSame('Draft title', $pending['title']);
        self::assertSame('Draft excerpt', $pending['excerpt']);
        self::assertStringContainsString('<strong>Draft body</strong>', $pending['body_html']);
        self::assertSame(['Mobility', 'Strength'], $pending['categories']);
        self::assertSame('Mobility', $pending['category']);
        self::assertSame(['hip'], $pending['tags']);
        self::assertSame([['question' => 'Q?', 'answer' => 'A.']], $pending['faq']);
        self::assertSame('Draft meta', $pending['meta_title']);
        self::assertSame('Draft description', $pending['meta_description']);
        self::assertSame($draftCover, $pending['cover_media_id']);
        self::assertSame('Draft Author', $pending['author_name']);
        self::assertSame(0, $pending['comments_enabled']);
        self::assertSame($pending, $this->posts->listAll()[0]);
        self::assertSame($pending, $this->posts->listAll('published')[0]);
        self::assertSame([], $this->posts->listAll('draft'));
        self::assertTrue($this->posts->slugInUse('draft-slug', null));
        self::assertTrue($this->posts->slugInUse('live-slug', null));
        self::assertFalse($this->posts->slugInUse('draft-slug', $id));
        self::assertFalse($this->posts->slugInUse('live-slug', $id));

        $this->posts->update($id, ['title' => 'Second title']);
        $merged = $this->posts->find($id);
        self::assertSame('Second title', $merged['title']);
        self::assertSame('draft-slug', $merged['slug']);
        self::assertSame(['hip'], $merged['tags']);
        self::assertSame($draftCover, $merged['cover_media_id']);
        self::assertSame(1, $this->draftCount());
        self::assertSame($liveRow, $this->liveRow($id));

        $this->posts->publish($id);
        self::assertSame(0, $this->draftCount());
        self::assertNull($this->posts->findPublishedBySlug('live-slug'));
        $promoted = $this->posts->findPublishedBySlug('draft-slug');
        self::assertNotNull($promoted);
        self::assertSame($id, $promoted['id']);
        self::assertSame($live['published_at'], $promoted['published_at']);
        foreach (['slug', 'title', 'excerpt', 'body_markdown', 'body_html', 'category', 'categories', 'tags', 'faq',
            'meta_title', 'meta_description', 'cover_media_id', 'author_name', 'comments_enabled'] as $field) {
            self::assertSame($merged[$field], $promoted[$field], $field);
        }
        $admin = $this->posts->find($id);
        self::assertFalse($admin['has_draft']);
        self::assertSame('published', $admin['status']);
    }

    public function testFailedPromotionLeavesLiveAndPendingVersionsIntact(): void
    {
        $id = $this->posts->create($this->postData('keeper'));
        $this->posts->publish($id);
        $this->posts->update($id, ['slug' => 'contested', 'title' => 'Pending title']);
        $this->posts->create($this->postData('contested'));
        $liveRow = $this->liveRow($id);
        $pending = $this->posts->find($id);

        try {
            $this->posts->publish($id);
            self::fail('Promoting onto another live slug must fail.');
        } catch (\PDOException) {
        }
        self::assertFalse($this->pdo->inTransaction());
        self::assertSame($liveRow, $this->liveRow($id));
        self::assertSame($pending, $this->posts->find($id));
        self::assertSame('A resource', $this->posts->findPublishedBySlug('keeper')['title']);

        try {
            $this->posts->unpublish($id);
            self::fail('Moving pending edits onto another live slug must fail.');
        } catch (\PDOException) {
        }
        self::assertSame($liveRow, $this->liveRow($id));
        self::assertSame($pending, $this->posts->find($id));
    }

    public function testUnpublishKeepsPendingEditsAndDeleteAndMediaCleanupReachDrafts(): void
    {
        $id = $this->posts->create($this->postData('to-unpublish'));
        $this->posts->publish($id);
        $publishedAt = $this->posts->find($id)['published_at'];
        $this->posts->update($id, ['title' => 'Kept edit', 'tags' => ['kept']]);

        $this->posts->unpublish($id);
        $post = $this->posts->find($id);
        self::assertSame('draft', $post['status']);
        self::assertFalse($post['has_draft']);
        self::assertSame('Kept edit', $post['title']);
        self::assertSame(['kept'], $post['tags']);
        self::assertSame($publishedAt, $post['published_at']);
        self::assertSame(0, $this->draftCount());
        self::assertNull($this->posts->findPublishedBySlug('to-unpublish'));

        $media = new MediaRepository($this->pdo);
        $cover = $media->create($this->mediaData('cover.webp'));
        $otherId = $this->posts->create($this->postData('with-draft'));
        $this->posts->publish($otherId);
        $this->posts->update($otherId, ['cover_media_id' => $cover]);
        $media->delete($cover);
        $pending = $this->posts->find($otherId);
        self::assertTrue($pending['has_draft']);
        self::assertNull($pending['cover_media_id']);

        $this->posts->delete($otherId);
        self::assertNull($this->posts->find($otherId));
        self::assertSame(0, $this->draftCount());
        self::assertFalse($this->posts->slugInUse('with-draft', null));
    }

    public function testPostJsonIsEncodedAndDecodedAndMarkdownIsRegenerated(): void
    {
        $data = $this->postData('json-post');
        $data['tags'] = ['rehab', 'strength'];
        $data['faq'] = [['question' => 'When?', 'answer' => 'When ready.']];
        $data['body_markdown'] = '# Safe heading';

        $id = $this->posts->create($data);
        $post = $this->posts->find($id);
        self::assertNotNull($post);
        self::assertSame(['rehab', 'strength'], $post['tags']);
        self::assertSame([['question' => 'When?', 'answer' => 'When ready.']], $post['faq']);
        self::assertStringContainsString('<h1>Safe heading</h1>', $post['body_html']);

        $this->posts->update($id, ['body_markdown' => '**Updated**']);
        self::assertStringContainsString('<strong>Updated</strong>', (string) $this->posts->find($id)['body_html']);
    }

    public function testCommentsAreAlwaysPendingAndOnlyApprovedCommentsArePublic(): void
    {
        $postId = $this->posts->create($this->postData('comments'));
        $pendingId = $this->comments->create($postId, [
            'author_name' => 'Pending Reader',
            'body' => 'Awaiting moderation',
            'status' => 'approved',
            'ip_hash' => 'hash-a',
        ]);
        $approvedId = $this->comments->create($postId, [
            'author_name' => 'Approved Reader',
            'body' => 'Visible comment',
            'ip_hash' => 'hash-b',
        ]);
        $rejectedId = $this->comments->create($postId, [
            'author_name' => 'Rejected Reader',
            'body' => 'Rejected comment',
            'ip_hash' => 'hash-c',
        ]);

        self::assertSame('pending', $this->comments->find($pendingId)['status']);
        $this->comments->setStatus($approvedId, 'approved');
        $this->comments->setStatus($rejectedId, 'rejected');

        $public = $this->comments->listApprovedForPost($postId);
        self::assertCount(1, $public);
        self::assertSame($approvedId, $public[0]['id']);
        self::assertSame(1, $this->comments->countRecentByIpHash('hash-a', 600));
    }

    public function testMarkdownStripsRawHtmlAndBlocksUnsafeLinks(): void
    {
        $html = Markdown::toHtml('<script>alert(1)</script> [unsafe](javascript:alert(1))');

        self::assertStringNotContainsStringIgnoringCase('<script', $html);
        self::assertStringNotContainsStringIgnoringCase('javascript:', $html);
    }

    public function testMediaRepositoryRoundTripsMetadata(): void
    {
        $media = new MediaRepository($this->pdo);
        $id = $media->create([
            'filename' => 'random-name.webp',
            'original_name' => 'training.webp',
            'mime_type' => 'image/webp',
            'size_bytes' => 1234,
            'width' => 800,
            'height' => 600,
            'alt_text' => 'Athlete training',
        ]);

        self::assertSame($id, $media->find($id)['id']);
        self::assertCount(1, $media->list());
        $media->delete($id);
        self::assertNull($media->find($id));
    }

    public function testCategoriesAndTagsAreNormalizedPersistedAndRememberedAsVocabulary(): void
    {
        self::assertSame(['categories' => [], 'tags' => []], $this->posts->taxonomy());

        $data = $this->postData('taxonomy-post');
        $data['category'] = 'Ignored legacy';
        $data['categories'] = [' Rehab ', 'Strength', 'Rehab', '', '   ', 'strength'];
        $data['tags'] = ['knee', ' knee ', '', 'ACL'];
        $id = $this->posts->create($data);

        $post = (new PostRepository($this->pdo))->find($id);
        self::assertNotNull($post);
        self::assertSame(['Rehab', 'Strength', 'strength'], $post['categories']);
        self::assertSame('Rehab', $post['category']);
        self::assertSame(['knee', 'ACL'], $post['tags']);
        self::assertSame(['Rehab', 'Strength', 'strength'], $this->posts->listAll()[0]['categories']);
        self::assertSame(
            ['categories' => ['Rehab', 'Strength', 'strength'], 'tags' => ['ACL', 'knee']],
            $this->posts->taxonomy()
        );

        $this->posts->update($id, ['title' => 'Only the title changes']);
        $post = $this->posts->find($id);
        self::assertSame(['Rehab', 'Strength', 'strength'], $post['categories']);
        self::assertSame('Rehab', $post['category']);
        self::assertSame(['knee', 'ACL'], $post['tags']);

        $this->posts->update($id, ['categories' => ['Mobility'], 'tags' => ['hip']]);
        $post = $this->posts->find($id);
        self::assertSame(['Mobility'], $post['categories']);
        self::assertSame('Mobility', $post['category']);
        self::assertSame(['hip'], $post['tags']);

        $this->posts->update($id, ['categories' => [], 'tags' => []]);
        $post = $this->posts->find($id);
        self::assertSame([], $post['categories']);
        self::assertSame('', $post['category']);
        self::assertSame([], $post['tags']);

        $this->posts->delete($id);
        self::assertNull($this->posts->find($id));
        $taxonomy = $this->posts->taxonomy();
        self::assertSame(['Mobility', 'Rehab', 'Strength', 'strength'], $taxonomy['categories']);
        self::assertSame(['ACL', 'hip', 'knee'], $taxonomy['tags']);
        self::assertSame(1, $this->termCount('category', 'Rehab'));
    }

    public function testLegacyCategoryWritesMapToSingletonSelections(): void
    {
        $id = $this->posts->create($this->postData('legacy-category'));
        $post = $this->posts->find($id);
        self::assertSame(['Rehab'], $post['categories']);
        self::assertSame('Rehab', $post['category']);

        $this->posts->update($id, ['category' => '  Recovery ']);
        $post = $this->posts->find($id);
        self::assertSame(['Recovery'], $post['categories']);
        self::assertSame('Recovery', $post['category']);

        $this->posts->update($id, ['category' => 'Ignored', 'categories' => ['Explicit', 'Second']]);
        $post = $this->posts->find($id);
        self::assertSame(['Explicit', 'Second'], $post['categories']);
        self::assertSame('Explicit', $post['category']);

        $this->posts->update($id, ['category' => '   ']);
        $post = $this->posts->find($id);
        self::assertSame([], $post['categories']);
        self::assertSame('', $post['category']);

        $blank = $this->postData('blank-category');
        $blank['category'] = '';
        self::assertSame([], $this->posts->find($this->posts->create($blank))['categories']);
        self::assertSame(['Explicit', 'Recovery', 'Rehab', 'Second'], $this->posts->taxonomy()['categories']);
    }

    public function testFailedPostSavesDoNotAddVocabulary(): void
    {
        $this->posts->create($this->postData('taken-slug'));
        $before = $this->posts->taxonomy();

        $duplicate = $this->postData('taken-slug');
        $duplicate['categories'] = ['Never Saved'];
        $duplicate['tags'] = ['never-saved'];
        try {
            $this->posts->create($duplicate);
            self::fail('A duplicate slug must not be saved.');
        } catch (\PDOException) {
        }
        self::assertSame($before, $this->posts->taxonomy());
        self::assertFalse($this->pdo->inTransaction());

        $otherId = $this->posts->create($this->postData('other-slug'));
        try {
            $this->posts->update($otherId, ['slug' => 'taken-slug', 'categories' => ['Also Never'], 'tags' => ['also-never']]);
            self::fail('A duplicate slug must not be saved.');
        } catch (\PDOException) {
        }
        self::assertSame($before, $this->posts->taxonomy());
        self::assertSame(['Rehab'], $this->posts->find($otherId)['categories']);

        foreach ([['categories' => 'Rehab'], ['tags' => ['ok', 5]], ['categories' => ['ok', null]]] as $invalid) {
            try {
                $this->posts->create(array_replace($this->postData('invalid-' . md5(serialize($invalid))), $invalid));
                self::fail('Invalid categories or tags must be rejected.');
            } catch (\RuntimeException $exception) {
                self::assertNotInstanceOf(\PDOException::class, $exception);
            }
        }
        self::assertSame($before, $this->posts->taxonomy());
        self::assertCount(2, $this->posts->listAll());
    }

    public function testLegacyPostsSchemaMigratesCategoriesAndVocabularyRepeatably(): void
    {
        $pdo = Database::create('sqlite::memory:');
        $pdo->exec(<<<'SQL'
            CREATE TABLE media (
                id INTEGER PRIMARY KEY,
                filename TEXT NOT NULL UNIQUE,
                original_name TEXT NOT NULL,
                mime_type TEXT NOT NULL,
                size_bytes INTEGER NOT NULL,
                width INTEGER,
                height INTEGER,
                alt_text TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now'))
            );
            CREATE TABLE posts (
                id INTEGER PRIMARY KEY,
                slug TEXT NOT NULL UNIQUE,
                title TEXT NOT NULL,
                excerpt TEXT NOT NULL DEFAULT '',
                body_markdown TEXT NOT NULL DEFAULT '',
                body_html TEXT NOT NULL DEFAULT '',
                category TEXT NOT NULL DEFAULT '',
                tags TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(tags) AND json_type(tags) = 'array'),
                faq TEXT NOT NULL DEFAULT '[]' CHECK (json_valid(faq) AND json_type(faq) = 'array'),
                meta_title TEXT,
                meta_description TEXT,
                cover_media_id INTEGER REFERENCES media(id) ON DELETE SET NULL,
                author_name TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
                comments_enabled INTEGER NOT NULL DEFAULT 0 CHECK (comments_enabled IN (0, 1)),
                published_at TEXT,
                created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ', 'now')),
                updated_at TEXT NOT NULL DEFAULT '2020-01-01T00:00:00Z'
            );
            INSERT INTO posts (slug, title, body_markdown, category, tags, status, published_at)
                VALUES ('published-legacy', 'Published', 'Kept body', ' Rehab ', '[" strength ", "rehab", "rehab", 5, ""]', 'published', '2024-01-01T00:00:00Z');
            INSERT INTO posts (slug, title, category, tags)
                VALUES ('draft-legacy', 'Draft', 'Mobility', '["hip"]');
            INSERT INTO posts (slug, title, category, tags)
                VALUES ('uncategorized-legacy', 'Uncategorized', '   ', '[]');
            SQL);

        Migrator::migrate($pdo);
        $posts = new PostRepository($pdo);
        self::assertSame(0, (int) $pdo->query('SELECT COUNT(*) FROM post_drafts')->fetchColumn());
        self::assertSame([false, false, false], array_column($posts->listAll(), 'has_draft'));

        $published = $posts->findPublishedBySlug('published-legacy');
        self::assertNotNull($published);
        self::assertSame(['Rehab'], $published['categories']);
        self::assertSame(' Rehab ', $published['category']);
        self::assertSame([' strength ', 'rehab', 'rehab', 5, ''], $published['tags']);
        self::assertSame('Kept body', $published['body_markdown']);
        self::assertSame('2020-01-01T00:00:00Z', $published['updated_at']);
        $byslug = array_column($posts->listAll(), null, 'slug');
        self::assertSame(['Mobility'], $byslug['draft-legacy']['categories']);
        self::assertSame([], $byslug['uncategorized-legacy']['categories']);
        self::assertSame(
            ['categories' => ['Mobility', 'Rehab'], 'tags' => ['hip', 'rehab', 'strength']],
            $posts->taxonomy()
        );

        $draftId = $byslug['draft-legacy']['id'];
        $publishedId = $published['id'];
        $posts->update($draftId, ['categories' => [], 'tags' => []]);
        $posts->update($publishedId, ['categories' => ['Recovery', 'Rehab']]);

        Migrator::migrate($pdo);
        Migrator::migrate($pdo);

        self::assertSame(3, (int) $pdo->query('SELECT COUNT(*) FROM posts')->fetchColumn());
        self::assertSame(1, (int) $pdo->query('SELECT COUNT(*) FROM post_drafts')->fetchColumn());
        self::assertSame([], $posts->find($draftId)['categories']);
        self::assertSame('', $posts->find($draftId)['category']);
        self::assertFalse($posts->find($draftId)['has_draft']);
        self::assertSame(['Recovery', 'Rehab'], $posts->find($publishedId)['categories']);
        self::assertTrue($posts->find($publishedId)['has_draft']);
        self::assertSame(['Rehab'], $posts->findPublishedBySlug('published-legacy')['categories']);
        $posts->publish($publishedId);
        self::assertSame(['Recovery', 'Rehab'], $posts->findPublishedBySlug('published-legacy')['categories']);
        self::assertSame('2024-01-01T00:00:00Z', $posts->findPublishedBySlug('published-legacy')['published_at']);
        self::assertSame(
            ['categories' => ['Mobility', 'Recovery', 'Rehab'], 'tags' => ['hip', 'rehab', 'strength']],
            $posts->taxonomy()
        );
        self::assertSame(
            6,
            (int) $pdo->query('SELECT COUNT(*) FROM taxonomy_terms')->fetchColumn()
        );
    }

    /** @return array<string, mixed> */
    private function liveRow(int $id): array
    {
        $row = $this->pdo->query('SELECT * FROM posts WHERE id = ' . $id)->fetch();
        self::assertIsArray($row);

        return $row;
    }

    private function draftCount(): int
    {
        return (int) $this->pdo->query('SELECT COUNT(*) FROM post_drafts')->fetchColumn();
    }

    /** @return array<string, mixed> */
    private function mediaData(string $filename): array
    {
        return [
            'filename' => $filename,
            'original_name' => $filename,
            'mime_type' => 'image/webp',
            'size_bytes' => 100,
            'width' => 10,
            'height' => 10,
            'alt_text' => 'Cover',
        ];
    }

    private function termCount(string $kind, string $name): int
    {
        $statement = $this->pdo->prepare('SELECT COUNT(*) FROM taxonomy_terms WHERE kind = :kind AND name = :name');
        $statement->execute(['kind' => $kind, 'name' => $name]);

        return (int) $statement->fetchColumn();
    }

    /** @return array<string, mixed> */
    private function postData(string $slug): array
    {
        return [
            'slug' => $slug,
            'title' => 'A resource',
            'excerpt' => 'An excerpt',
            'body_markdown' => 'Resource body',
            'category' => 'Rehab',
            'tags' => [],
            'faq' => [],
            'author_name' => 'Dr. Joseph Sperlak',
        ];
    }
}
