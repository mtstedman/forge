<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;
use Forge\Api\Migrator;
use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\MediaRepository;
use Forge\Api\Repository\PostRepository;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

final class PublicApiTest extends TestCase
{
    private const APP_KEY = 'test-app-key-0123456789abcdef';
    private const SUMMARY_KEYS = [
        'id', 'slug', 'title', 'excerpt', 'category', 'tags', 'cover', 'author_name', 'published_at', 'updated_at',
    ];

    private PDO $pdo;
    private PostRepository $posts;
    private CommentRepository $comments;

    protected function setUp(): void
    {
        $this->pdo = Database::create('sqlite::memory:');
        Migrator::migrate($this->pdo);
        $this->posts = new PostRepository($this->pdo);
        $this->comments = new CommentRepository($this->pdo);
    }

    // ---------------------------------------------------------------- reads

    public function testListReturnsOnlyPublishedPostsNewestFirstInContractShape(): void
    {
        $this->createPost('older', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z']);
        $this->createPost('newer', ['status' => 'published', 'published_at' => '2026-02-01T10:00:00Z']);
        $this->createPost('secret-draft', ['status' => 'draft']);

        $response = $this->request($this->app(), 'GET', '/posts');
        $body = (string) $response->getBody();
        $json = $this->decode($response);

        self::assertSame(200, $response->getStatusCode());
        self::assertStringStartsWith('application/json', $response->getHeaderLine('Content-Type'));
        self::assertStringContainsString('public', $response->getHeaderLine('Cache-Control'));
        self::assertStringContainsString('max-age=', $response->getHeaderLine('Cache-Control'));

        self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 2], $json['meta']);
        self::assertSame(['newer', 'older'], array_column($json['data'], 'slug'));
        foreach ($json['data'] as $summary) {
            self::assertSame(self::SUMMARY_KEYS, array_keys($summary));
            self::assertNull($summary['cover']);
            self::assertSame(['rehab', 'strength'], $summary['tags']);
        }
        self::assertStringNotContainsString('secret-draft', $body);
        self::assertStringNotContainsString('body_markdown', $body);
    }

    public function testListPaginates(): void
    {
        $this->createPost('a', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z']);
        $this->createPost('b', ['status' => 'published', 'published_at' => '2026-01-02T10:00:00Z']);
        $this->createPost('c', ['status' => 'published', 'published_at' => '2026-01-03T10:00:00Z']);

        $json = $this->decode($this->request($this->app(), 'GET', '/posts?page=2&per_page=2'));

        self::assertSame(['page' => 2, 'per_page' => 2, 'total' => 3], $json['meta']);
        self::assertSame(['a'], array_column($json['data'], 'slug'));

        $clamped = $this->decode($this->request($this->app(), 'GET', '/posts?page=-4&per_page=100000'));
        self::assertSame(1, $clamped['meta']['page']);
        self::assertSame(50, $clamped['meta']['per_page']);
    }

    public function testCoverIsExposedAsUrlAndAlt(): void
    {
        $mediaId = (new MediaRepository($this->pdo))->create([
            'filename' => 'abc123.webp',
            'original_name' => 'original.webp',
            'mime_type' => 'image/webp',
            'size_bytes' => 10,
            'alt_text' => 'Athlete stretching',
        ]);
        $this->createPost('with-cover', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'cover_media_id' => $mediaId]);

        $json = $this->decode($this->request($this->app(['MEDIA_BASE_URL' => 'https://cdn.example.test/media/']), 'GET', '/posts'));

        self::assertSame(
            ['url' => 'https://cdn.example.test/media/abc123.webp', 'alt' => 'Athlete stretching'],
            $json['data'][0]['cover'],
        );
    }

    public function testShowReturnsPublishedPostInContractShape(): void
    {
        $this->createPost('shown', [
            'status' => 'published',
            'published_at' => '2026-01-01T10:00:00Z',
            'body_markdown' => '# Heading',
            'faq' => [['question' => 'Q?', 'answer' => 'A.']],
            'meta_title' => 'Meta title',
            'meta_description' => 'Meta description',
            'comments_enabled' => 1,
        ]);

        $response = $this->request($this->app(), 'GET', '/posts/shown');
        $data = $this->decode($response)['data'];

        self::assertSame(200, $response->getStatusCode());
        self::assertStringContainsString('public', $response->getHeaderLine('Cache-Control'));
        self::assertSame(
            array_merge(self::SUMMARY_KEYS, ['body_html', 'faq', 'meta_title', 'meta_description', 'comments_enabled', 'comments']),
            array_keys($data),
        );
        self::assertStringContainsString('<h1>Heading</h1>', $data['body_html']);
        self::assertSame([['question' => 'Q?', 'answer' => 'A.']], $data['faq']);
        self::assertSame('Meta title', $data['meta_title']);
        self::assertSame('Meta description', $data['meta_description']);
        // Global flag is off by default, so comments are not accepted.
        self::assertFalse($data['comments_enabled']);
        self::assertSame([], $data['comments']);

        $enabled = $this->decode($this->request($this->app(['PUBLIC_COMMENTS_ENABLED' => 'true']), 'GET', '/posts/shown'));
        self::assertTrue($enabled['data']['comments_enabled']);
    }

    public function testDraftAndMissingSlugsReturn404(): void
    {
        $this->createPost('draft-only', ['status' => 'draft']);
        $app = $this->app();

        foreach (['/posts/draft-only', '/posts/missing', '/posts/draft-only/comments', '/posts/missing/comments'] as $path) {
            $response = $this->request($app, 'GET', $path);
            $json = $this->decode($response);
            self::assertSame(404, $response->getStatusCode(), $path);
            self::assertArrayHasKey('error', $json, $path);
            self::assertArrayNotHasKey('data', $json, $path);
            self::assertStringNotContainsString('public', $response->getHeaderLine('Cache-Control'), $path);
        }
    }

    public function testOnlyApprovedCommentsAreEmbeddedAndListedWithoutPrivateFields(): void
    {
        $postId = $this->createPost('discussed', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);
        $first = $this->comments->create($postId, ['author_name' => 'First', 'author_email' => 'first@example.test', 'body' => 'First approved', 'ip_hash' => 'hash-first']);
        $second = $this->comments->create($postId, ['author_name' => 'Second', 'author_email' => 'second@example.test', 'body' => 'Second approved', 'ip_hash' => 'hash-second']);
        $this->comments->create($postId, ['author_name' => 'Waiting', 'author_email' => 'wait@example.test', 'body' => 'Still pending', 'ip_hash' => 'hash-pending']);
        $rejected = $this->comments->create($postId, ['author_name' => 'Spam', 'author_email' => 'spam@example.test', 'body' => 'Rejected spam', 'ip_hash' => 'hash-rejected']);
        $this->comments->setStatus($first, 'approved');
        $this->comments->setStatus($second, 'approved');
        $this->comments->setStatus($rejected, 'rejected');

        $app = $this->app();
        foreach (['/posts/discussed' => 'comments', '/posts/discussed/comments' => null] as $path => $key) {
            $response = $this->request($app, 'GET', $path);
            $body = (string) $response->getBody();
            $json = $this->decode($response);
            $comments = $key === null ? $json['data'] : $json['data'][$key];

            self::assertSame(200, $response->getStatusCode(), $path);
            self::assertStringContainsString('public', $response->getHeaderLine('Cache-Control'), $path);
            self::assertSame([$first, $second], array_column($comments, 'id'), $path);
            foreach ($comments as $comment) {
                self::assertSame(['id', 'author_name', 'body', 'created_at'], array_keys($comment), $path);
            }
            foreach (['@example.test', 'hash-', 'Still pending', 'Rejected spam', 'author_email', 'ip_hash', 'user_agent'] as $secret) {
                self::assertStringNotContainsString($secret, $body, $path);
            }
        }
    }

    // ------------------------------------------------------------- posting

    public function testPostIsForbiddenWhenGlobalFlagIsUnset(): void
    {
        $this->createPost('open', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);

        $response = $this->postComment($this->app(['APP_KEY' => self::APP_KEY]), 'open', $this->validComment());

        self::assertSame(403, $response->getStatusCode());
        self::assertArrayHasKey('error', $this->decode($response));
        self::assertSame(0, $this->commentCount());

        $explicitOff = $this->postComment($this->app(['APP_KEY' => self::APP_KEY, 'PUBLIC_COMMENTS_ENABLED' => 'false']), 'open', $this->validComment());
        self::assertSame(403, $explicitOff->getStatusCode());
        self::assertSame(0, $this->commentCount());
    }

    public function testPostIsForbiddenWhenPostHasCommentsDisabled(): void
    {
        $this->createPost('closed', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z']);

        $response = $this->postComment($this->enabledApp(), 'closed', $this->validComment());

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(0, $this->commentCount());
    }

    public function testPostIsForbiddenWithoutAppKey(): void
    {
        $this->createPost('open', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);

        $response = $this->postComment($this->app(['PUBLIC_COMMENTS_ENABLED' => 'true']), 'open', $this->validComment());

        self::assertSame(403, $response->getStatusCode());
        self::assertSame(0, $this->commentCount());
    }

    public function testPostToDraftOrMissingPostReturns404(): void
    {
        $this->createPost('draft-open', ['status' => 'draft', 'comments_enabled' => 1]);
        $app = $this->enabledApp();

        self::assertSame(404, $this->postComment($app, 'draft-open', $this->validComment())->getStatusCode());
        self::assertSame(404, $this->postComment($app, 'missing', $this->validComment())->getStatusCode());
        self::assertSame(0, $this->commentCount());
    }

    public function testValidCommentIsStoredPendingAndAppearsOnlyAfterApproval(): void
    {
        $postId = $this->createPost('open', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);
        $app = $this->enabledApp();

        $response = $this->postComment($app, 'open', [
            'author_name' => "  Ann\x07 Reader ",
            'author_email' => 'ann@example.test',
            'body' => "Great\x00 post!\r\nThanks\x1B.",
            'website' => '',
        ], '203.0.113.7', ['User-Agent' => 'TestAgent/1.0']);

        self::assertSame(202, $response->getStatusCode());
        self::assertSame(['status' => 'pending'], $this->decode($response));
        self::assertSame('no-store', $response->getHeaderLine('Cache-Control'));

        $row = $this->pdo->query('SELECT * FROM comments')->fetch();
        self::assertIsArray($row);
        self::assertSame($postId, (int) $row['post_id']);
        self::assertSame('pending', $row['status']);
        self::assertSame('Ann Reader', $row['author_name']);
        self::assertSame('ann@example.test', $row['author_email']);
        self::assertSame("Great post!\nThanks.", $row['body']);
        self::assertSame(hash_hmac('sha256', '203.0.113.7', self::APP_KEY), $row['ip_hash']);
        self::assertSame('TestAgent/1.0', $row['user_agent']);

        $pending = $this->decode($this->request($app, 'GET', '/posts/open'));
        self::assertSame([], $pending['data']['comments']);
        self::assertSame([], $this->decode($this->request($app, 'GET', '/posts/open/comments'))['data']);

        $this->comments->setStatus((int) $row['id'], 'approved');

        $approved = $this->decode($this->request($app, 'GET', '/posts/open'));
        self::assertCount(1, $approved['data']['comments']);
        self::assertSame('Ann Reader', $approved['data']['comments'][0]['author_name']);
        self::assertSame("Great post!\nThanks.", $approved['data']['comments'][0]['body']);
        $listed = $this->decode($this->request($app, 'GET', '/posts/open/comments'))['data'];
        self::assertSame([(int) $row['id']], array_column($listed, 'id'));
    }

    public function testInvalidInputReturns422WithFieldErrors(): void
    {
        $this->createPost('open', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);
        $app = $this->enabledApp();

        $cases = [
            'missing everything' => [[], ['author_name', 'author_email', 'body']],
            'name too long' => [['author_name' => str_repeat('n', 81)] + $this->validComment(), ['author_name']],
            'name only control chars' => [['author_name' => "\x01\x02"] + $this->validComment(), ['author_name']],
            'name not a string' => [['author_name' => ['x']] + $this->validComment(), ['author_name']],
            'email invalid' => [['author_email' => 'not-an-email'] + $this->validComment(), ['author_email']],
            'email too long' => [['author_email' => str_repeat('a', 64) . '@' . str_repeat('b', 63) . '.' . str_repeat('c', 63) . '.' . str_repeat('d', 63) . '.com'] + $this->validComment(), ['author_email']],
            'body too short' => [['body' => ' x '] + $this->validComment(), ['body']],
            'body too long' => [['body' => str_repeat('b', 5001)] + $this->validComment(), ['body']],
        ];

        foreach ($cases as $label => [$payload, $expectedFields]) {
            $response = $this->postComment($app, 'open', $payload);
            $json = $this->decode($response);

            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertArrayHasKey('error', $json, $label);
            self::assertSame($expectedFields, array_keys($json['fields']), $label);
        }

        $boundary = $this->postComment($app, 'open', [
            'author_name' => str_repeat('n', 80),
            'author_email' => 'ok@example.test',
            'body' => str_repeat('b', 5000),
        ]);
        self::assertSame(202, $boundary->getStatusCode());
        self::assertSame(1, $this->commentCount());
    }

    public function testFilledHoneypotGets202ButStoresNothing(): void
    {
        $this->createPost('open', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);

        $response = $this->postComment($this->enabledApp(), 'open', ['website' => 'https://spam.example'] + $this->validComment());

        self::assertSame(202, $response->getStatusCode());
        self::assertSame(['status' => 'pending'], $this->decode($response));
        self::assertSame(0, $this->commentCount());
    }

    public function testRateLimitPerIpReturns429(): void
    {
        $this->createPost('open', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);
        $app = $this->enabledApp(['COMMENT_RATE_LIMIT' => '2']);

        self::assertSame(202, $this->postComment($app, 'open', $this->validComment(), '198.51.100.1')->getStatusCode());
        self::assertSame(202, $this->postComment($app, 'open', $this->validComment(), '198.51.100.1')->getStatusCode());

        $limited = $this->postComment($app, 'open', $this->validComment(), '198.51.100.1');
        self::assertSame(429, $limited->getStatusCode());
        self::assertArrayHasKey('error', $this->decode($limited));
        self::assertSame(2, $this->commentCount());

        // Forwarding headers are not trusted to evade the limit.
        $spoofed = $this->postComment($app, 'open', $this->validComment(), '198.51.100.1', ['X-Forwarded-For' => '192.0.2.99']);
        self::assertSame(429, $spoofed->getStatusCode());

        self::assertSame(202, $this->postComment($app, 'open', $this->validComment(), '198.51.100.2')->getStatusCode());
        self::assertSame(3, $this->commentCount());
    }

    public function testDefaultRateLimitIsThree(): void
    {
        $this->createPost('open', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'comments_enabled' => 1]);
        $app = $this->enabledApp();

        for ($i = 0; $i < 3; $i++) {
            self::assertSame(202, $this->postComment($app, 'open', $this->validComment())->getStatusCode());
        }
        self::assertSame(429, $this->postComment($app, 'open', $this->validComment())->getStatusCode());
    }

    // ------------------------------------------------------------- helpers

    /** @param array<string, mixed> $config */
    private function app(array $config = []): App
    {
        return AppFactory::create($this->pdo, Config::fromArray($config));
    }

    /** @param array<string, mixed> $config */
    private function enabledApp(array $config = []): App
    {
        return $this->app($config + ['PUBLIC_COMMENTS_ENABLED' => 'true', 'APP_KEY' => self::APP_KEY]);
    }

    /** @param array<string, mixed> $overrides */
    private function createPost(string $slug, array $overrides = []): int
    {
        return $this->posts->create($overrides + [
            'slug' => $slug,
            'title' => 'Title ' . $slug,
            'excerpt' => 'Excerpt ' . $slug,
            'body_markdown' => 'Body ' . $slug,
            'category' => 'Rehab',
            'tags' => ['rehab', 'strength'],
            'faq' => [],
            'author_name' => 'Dr. Joseph Sperlak',
        ]);
    }

    /** @return array<string, string> */
    private function validComment(): array
    {
        return [
            'author_name' => 'Reader',
            'author_email' => 'reader@example.test',
            'body' => 'Helpful article, thank you.',
            'website' => '',
        ];
    }

    /** @param array<string, string> $headers */
    private function request(App $app, string $method, string $path, array $headers = [], string $ip = '192.0.2.10'): ResponseInterface
    {
        $uri = parse_url($path);
        $request = (new ServerRequestFactory())->createServerRequest($method, $path, ['REMOTE_ADDR' => $ip]);
        if (isset($uri['query'])) {
            parse_str($uri['query'], $query);
            $request = $request->withQueryParams($query);
        }
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /**
     * @param array<string, mixed> $payload
     * @param array<string, string> $headers
     */
    private function postComment(App $app, string $slug, array $payload, string $ip = '192.0.2.10', array $headers = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())
            ->createServerRequest('POST', '/posts/' . $slug . '/comments', ['REMOTE_ADDR' => $ip])
            ->withHeader('Content-Type', 'application/json')
            ->withBody((new StreamFactory())->createStream(json_encode($payload, JSON_THROW_ON_ERROR)));
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<mixed> */
    private function decode(ResponseInterface $response): array
    {
        $data = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }

    private function commentCount(): int
    {
        return (int) $this->pdo->query('SELECT COUNT(*) FROM comments')->fetchColumn();
    }
}
