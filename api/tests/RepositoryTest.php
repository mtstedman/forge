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
