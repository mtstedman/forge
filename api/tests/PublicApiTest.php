<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;
use Forge\Api\Migrator;
use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\MainPageContentRepository;
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

        self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 2, 'available_tags' => ['rehab', 'strength']], $json['meta']);
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

        self::assertSame(['page' => 2, 'per_page' => 2, 'total' => 3, 'available_tags' => ['rehab', 'strength']], $json['meta']);
        self::assertSame(['a'], array_column($json['data'], 'slug'));

        $clamped = $this->decode($this->request($this->app(), 'GET', '/posts?page=-4&per_page=100000'));
        self::assertSame(1, $clamped['meta']['page']);
        self::assertSame(50, $clamped['meta']['per_page']);
    }

    public function testTagFilterMatchesAnySelectedTagBeforePaginationNewestFirst(): void
    {
        $tagsBySlug = ['p01' => ['alpha', 'zeta'], 'p02' => ['beta'], 'p03' => ['alpha', 'beta'], 'p11' => ['beta']];
        for ($day = 1; $day <= 12; $day++) {
            $slug = sprintf('p%02d', $day);
            $this->createPost($slug, [
                'status' => 'published',
                'published_at' => sprintf('2026-01-%02dT10:00:00Z', $day),
                'tags' => $tagsBySlug[$slug] ?? ['general'],
            ]);
        }
        $app = $this->app();
        $allTags = ['alpha', 'beta', 'general', 'zeta'];

        // No selection: unfiltered listing; tags beyond the first page are still listed.
        $first = $this->decode($this->request($app, 'GET', '/posts'));
        self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 12, 'available_tags' => $allTags], $first['meta']);
        self::assertSame(['p12', 'p11', 'p10', 'p09', 'p08', 'p07', 'p06', 'p05', 'p04', 'p03'], $this->slugs($first));
        $second = $this->decode($this->request($app, 'GET', '/posts?page=2'));
        self::assertSame(['page' => 2, 'per_page' => 10, 'total' => 12, 'available_tags' => $allTags], $second['meta']);
        self::assertSame(['p02', 'p01'], $this->slugs($second));

        // One selected tag, including a match beyond the first unfiltered page.
        $alpha = $this->decode($this->request($app, 'GET', '/posts?tags[]=alpha'));
        self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 2, 'available_tags' => $allTags], $alpha['meta']);
        self::assertSame(['p03', 'p01'], $this->slugs($alpha));
        foreach ($alpha['data'] as $summary) {
            self::assertSame(self::SUMMARY_KEYS, array_keys($summary));
        }

        $zeta = $this->decode($this->request($app, 'GET', '/posts?tags[]=zeta'));
        self::assertSame(1, $zeta['meta']['total']);
        self::assertSame(['p01'], $this->slugs($zeta));

        // Multiple selected tags: ANY match, each post once (p03 has both), newest first.
        $either = $this->decode($this->request($app, 'GET', '/posts?tags[]=alpha&tags[]=beta'));
        self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 4, 'available_tags' => $allTags], $either['meta']);
        self::assertSame(['p11', 'p03', 'p02', 'p01'], $this->slugs($either));

        // Filtering happens before pagination.
        $paged = $this->decode($this->request($app, 'GET', '/posts?tags[]=beta&tags[]=alpha&page=2&per_page=2'));
        self::assertSame(['page' => 2, 'per_page' => 2, 'total' => 4, 'available_tags' => $allTags], $paged['meta']);
        self::assertSame(['p02', 'p01'], $this->slugs($paged));

        $beyond = $this->decode($this->request($app, 'GET', '/posts?tags[]=alpha&tags[]=beta&page=3&per_page=2'));
        self::assertSame(['page' => 3, 'per_page' => 2, 'total' => 4, 'available_tags' => $allTags], $beyond['meta']);
        self::assertSame([], $beyond['data']);

        $clamped = $this->request($app, 'GET', '/posts?tags[]=beta&page=-1&per_page=100000');
        $clampedJson = $this->decode($clamped);
        self::assertSame(['page' => 1, 'per_page' => 50, 'total' => 3, 'available_tags' => $allTags], $clampedJson['meta']);
        self::assertSame(['p11', 'p03', 'p02'], $this->slugs($clampedJson));
        self::assertStringContainsString('public', $clamped->getHeaderLine('Cache-Control'));
        self::assertStringContainsString('max-age=', $clamped->getHeaderLine('Cache-Control'));
    }

    public function testDraftsPendingEditsUnpublishedPostsAndUnusedTaxonomyAreNotPublicTags(): void
    {
        $this->createPost('live', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'tags' => ['shared']]);
        $this->createPost('draft', ['status' => 'draft', 'tags' => ['draft-only', 'shared']]);
        $edited = $this->createPost('edited', ['status' => 'published', 'published_at' => '2026-01-02T10:00:00Z', 'tags' => ['before']]);
        $this->posts->update($edited, ['tags' => ['pending-only']]);
        $withdrawn = $this->createPost('withdrawn', ['status' => 'published', 'published_at' => '2026-01-03T10:00:00Z', 'tags' => ['withdrawn-only']]);
        $this->posts->unpublish($withdrawn);
        $this->pdo->exec("INSERT INTO taxonomy_terms (kind, name) VALUES ('tag', 'unused-vocab')");

        self::assertContains('pending-only', $this->posts->taxonomy()['tags']);
        self::assertContains('unused-vocab', $this->posts->taxonomy()['tags']);

        $app = $this->app();
        $all = $this->decode($this->request($app, 'GET', '/posts'));
        self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 2, 'available_tags' => ['before', 'shared']], $all['meta']);
        self::assertSame(['edited', 'live'], $this->slugs($all));

        self::assertSame(['live'], $this->slugs($this->decode($this->request($app, 'GET', '/posts?tags[]=shared'))));
        self::assertSame(['edited'], $this->slugs($this->decode($this->request($app, 'GET', '/posts?tags[]=before'))));

        foreach (['draft-only', 'pending-only', 'withdrawn-only', 'unused-vocab'] as $hidden) {
            $response = $this->request($app, 'GET', '/posts?tags[]=' . rawurlencode($hidden));
            $json = $this->decode($response);
            self::assertSame(200, $response->getStatusCode(), $hidden);
            self::assertSame([], $json['data'], $hidden);
            self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 0, 'available_tags' => ['before', 'shared']], $json['meta'], $hidden);
        }
    }

    public function testTagFilterNormalizesQueryValuesAndMatchesExactStoredTags(): void
    {
        $special = "a&b=c/d ü'\"<x>";
        $this->createPost('lower', ['status' => 'published', 'published_at' => '2026-01-01T10:00:00Z', 'tags' => ['rehab']]);
        $this->createPost('upper', ['status' => 'published', 'published_at' => '2026-01-02T10:00:00Z', 'tags' => ['Rehab']]);
        $this->createPost('special', ['status' => 'published', 'published_at' => '2026-01-03T10:00:00Z', 'tags' => [$special]]);
        $spaced = $this->createPost('spaced', ['status' => 'published', 'published_at' => '2026-01-04T10:00:00Z', 'tags' => []]);
        $statement = $this->pdo->prepare('UPDATE posts SET tags = :tags WHERE id = :id');
        $statement->execute(['tags' => '["  padded \t", 5, null, true, "", "   ", {"k": "rehab"}, ["rehab"]]', 'id' => $spaced]);
        $app = $this->app();
        $allTags = [$special, 'padded', 'Rehab', 'rehab'];

        $all = $this->decode($this->request($app, 'GET', '/posts'));
        self::assertSame(['page' => 1, 'per_page' => 10, 'total' => 4, 'available_tags' => $allTags], $all['meta']);

        $cases = [
            'exact lowercase' => ['/posts?tags[]=rehab', ['lower']],
            'exact capitalized' => ['/posts?tags[]=Rehab', ['upper']],
            'scalar value' => ['/posts?tags=Rehab', ['upper']],
            'repeated and blank values' => ['/posts?tags[]=rehab&tags[]=rehab&tags[]=&tags[]=%20%20&tags[]=%20rehab%20', ['lower']],
            'malformed nested entry dropped' => ['/posts?tags[0][]=Rehab&tags[]=rehab', ['lower']],
            'stored whitespace trimmed' => ['/posts?tags[]=padded', ['spaced']],
            'special characters' => ['/posts?tags[]=' . rawurlencode($special), ['special']],
            'both case variants' => ['/posts?tags[]=Rehab&tags[]=rehab', ['upper', 'lower']],
            'only blank values are no selection' => ['/posts?tags[]=&tags[]=%20', ['spaced', 'special', 'upper', 'lower']],
            'only malformed values are no selection' => ['/posts?tags[x][y]=rehab', ['spaced', 'special', 'upper', 'lower']],
            'empty scalar is no selection' => ['/posts?tags=', ['spaced', 'special', 'upper', 'lower']],
            'different case does not match' => ['/posts?tags[]=REHAB', []],
            'unknown tag' => ['/posts?tags[]=nope', []],
            'non-string stored values never match' => ['/posts?tags[]=5', []],
            'injection attempt is a literal value' => ['/posts?tags[]=' . rawurlencode("' OR 1=1 --"), []],
        ];

        foreach ($cases as $label => [$path, $expected]) {
            $response = $this->request($app, 'GET', $path);
            $json = $this->decode($response);
            self::assertSame(200, $response->getStatusCode(), $label);
            self::assertSame($expected, $this->slugs($json), $label);
            self::assertSame(
                ['page' => 1, 'per_page' => 10, 'total' => count($expected), 'available_tags' => $allTags],
                $json['meta'],
                $label,
            );
        }
    }

    public function testEmptyPublishedCollectionReturnsEmptyListAndTags(): void
    {
        $this->createPost('draft-only', ['status' => 'draft', 'tags' => ['hidden']]);
        $app = $this->app();

        foreach (['/posts', '/posts?tags[]=hidden', '/posts?tags[]=rehab&tags[]=strength'] as $path) {
            $response = $this->request($app, 'GET', $path);
            $json = $this->decode($response);
            self::assertSame(200, $response->getStatusCode(), $path);
            self::assertSame(['data' => [], 'meta' => ['page' => 1, 'per_page' => 10, 'total' => 0, 'available_tags' => []]], $json, $path);
        }
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

    // --------------------------------------------------- main-page content

    public function testMainPageContentIsSeededWithCurrentCopyAndPubliclyReadable(): void
    {
        self::assertSame(1, $this->mainPageContentRowCount());

        $response = $this->request($this->app(), 'GET', '/main-page-content');
        $body = (string) $response->getBody();
        $json = $this->decode($response);

        self::assertSame(200, $response->getStatusCode());
        self::assertStringStartsWith('application/json', $response->getHeaderLine('Content-Type'));
        self::assertStringContainsString('public', $response->getHeaderLine('Cache-Control'));
        self::assertStringContainsString('max-age=', $response->getHeaderLine('Cache-Control'));
        self::assertSame(['data'], array_keys($json));
        self::assertSame(self::defaultMainPageContent(), $json['data']);
        foreach (['created_at', 'updated_at', '"id"', '"document"', 'admin_', 'password'] as $internal) {
            self::assertStringNotContainsString($internal, $body);
        }
    }

    public function testMainPageContentEditsSurviveRepeatedMigrationAndAreReflectedPublicly(): void
    {
        $edited = self::defaultMainPageContent();
        $edited['hero']['heading'] = 'Edited heading';
        $edited['faq']['items'] = array_reverse($edited['faq']['items']);
        $edited['pricing']['items'][0]['featured'] = true;
        (new MainPageContentRepository($this->pdo))->replace($edited);

        Migrator::migrate($this->pdo);
        Migrator::migrate($this->pdo);

        self::assertSame(1, $this->mainPageContentRowCount());
        $response = $this->request($this->app(), 'GET', '/main-page-content');
        self::assertSame(200, $response->getStatusCode());
        self::assertSame(['data' => $edited], $this->decode($response));
    }

    // ------------------------------------------------------------- helpers

    /**
     * @param array<mixed> $json
     * @return list<string>
     */
    private function slugs(array $json): array
    {
        return array_column($json['data'], 'slug');
    }

    private function mainPageContentRowCount(): int
    {
        return (int) $this->pdo->query('SELECT COUNT(*) FROM main_page_content')->fetchColumn();
    }

    /** @return array<string, mixed> The current home-page copy, in contract order. */
    private static function defaultMainPageContent(): array
    {
        return [
            'seo' => [
                'title' => 'Forge Performance Therapy — Twin Cities',
                'description' => 'One-on-one mobile physical therapy, rehabilitation and performance care with Dr. Joseph Sperlak, PT, DPT, CSCS across the Twin Cities.',
            ],
            'hero' => [
                'eyebrow' => '',
                'heading' => 'Find the root cause. Then forge your path to recovery.',
                'introduction' => 'Private, one-on-one physical therapy with Dr. Joseph Sperlak, PT, DPT, CSCS. Full 60-minute sessions at your home or gym, with the same provider every appointment.',
                'primary_cta_label' => 'Book a free 15-min phone consult',
                'secondary_cta_label' => 'What I treat',
                'credential_chips' => ['DPT', 'CSCS'],
                'location_chip' => 'Twin Cities Metro, MN',
                'image_alt' => 'Photo placeholder: Joseph treating a patient at home or in a gym',
                'image_url' => '',
            ],
            'approach' => [
                'eyebrow' => 'I. Approach',
                'title' => 'Treatment built around you, not a clinic schedule.',
                'description' => 'Every plan starts by identifying the root cause of your pain and dysfunction. From there, you get a specialized rehabilitation protocol designed to support sustainable lifestyle changes.',
                'principles' => [
                    ['marker' => '60', 'title' => 'Full 60-minute sessions', 'description' => 'One-on-one for the entire hour. No aides, no splitting time between patients.'],
                    ['marker' => '1', 'title' => 'Same provider, every visit', 'description' => 'You work with Dr. Sperlak from the first assessment to your final session.'],
                    ['marker' => '§', 'title' => 'Root cause, then protocol', 'description' => 'A thorough assessment drives a rehabilitation plan specific to your body and goals.'],
                    ['marker' => '—', 'title' => 'Conservative care first', 'description' => 'The goal is to help you avoid unnecessary injections and surgeries.'],
                ],
                'service_area' => 'Serving the Twin Cities Metro Area',
            ],
            'services' => [
                'eyebrow' => 'II. Services & conditions',
                'title' => 'What I treat',
                'items' => [
                    ['number' => 'i.', 'title' => 'Sports injuries', 'description' => 'Sprains, strains, tendon pain and overuse injuries, with a return-to-sport plan for training and competition.'],
                    ['number' => 'ii.', 'title' => 'Post-surgical rehab', 'description' => 'Structured recovery after joint, ligament and spine procedures, progressing from early mobility to full strength.'],
                    ['number' => 'iii.', 'title' => 'Back & neck pain', 'description' => 'Assessment of posture, movement and load to address the source of spinal pain, not only the symptoms.'],
                    ['number' => 'iv.', 'title' => 'Chronic pain', 'description' => "Gradual, measurable plans for long-standing pain that hasn't resolved with rest, medication or prior treatment."],
                    ['number' => 'v.', 'title' => 'Performing arts & dancers', 'description' => 'Care for the range, control and repetitive demands of dance and performance, built around rehearsal schedules.'],
                    ['number' => 'vi.', 'title' => 'Work injuries', 'description' => 'Rehab for lifting, repetitive-motion and job-related injuries, focused on a safe return to full duty.'],
                ],
            ],
            'about' => [
                'eyebrow' => 'III. About',
                'title' => '',
                'name' => 'Dr. Joseph Sperlak',
                'suffix' => 'PT, DPT, CSCS',
                'role' => 'Founder',
                'biography' => 'Joseph is a Doctor of Physical Therapy and Certified Strength & Conditioning Specialist. He trains and competes himself, so he understands what it takes to get back to the work you care about.',
                'portrait_alt' => 'Portrait placeholder for Dr. Joseph Sperlak',
                'portrait_url' => '',
                'credentials' => [
                    ['credential' => 'Doctor of Physical Therapy', 'label' => 'DPT'],
                    ['credential' => 'Certified Strength & Conditioning Specialist', 'label' => 'CSCS'],
                    ['credential' => 'Collegiate strength & conditioning coach', 'label' => 'Coaching'],
                    ['credential' => 'Self-trained Ironman & Strongman athlete', 'label' => 'Athlete'],
                    ['credential' => 'Hyrox competitor', 'label' => 'Athlete'],
                ],
            ],
            'pricing' => [
                'eyebrow' => 'IV. Getting started & pricing',
                'title' => 'Three steps to a plan',
                'description' => 'Forge is a cash-based, out-of-network practice. Pricing is simple and shared up front.',
                'items' => [
                    ['step' => 'Step 1', 'title' => 'Free phone consult', 'price' => '$0', 'detail' => '15 min', 'description' => "Talk through what's going on and whether Forge is the right fit.", 'featured' => false],
                    ['step' => 'Step 2', 'title' => 'In-person initial consultation', 'price' => '$49.99', 'detail' => '', 'description' => 'A hands-on assessment at your home or gym to identify the root cause of your pain.', 'featured' => true],
                    ['step' => 'Step 3', 'title' => 'Your protocol', 'price' => '60', 'detail' => 'min sessions', 'description' => 'A specialized rehabilitation plan with one-on-one sessions, always with the same provider.', 'featured' => false],
                ],
            ],
            'testimonials' => [
                'eyebrow' => 'V. Patient stories',
                'title' => 'In their words',
                'items' => [
                    ['quote' => 'Placeholder testimonial. Replace with a patient quote about recovering from a sports injury.', 'attribution' => 'Patient name, sports injury'],
                    ['quote' => 'Placeholder testimonial. Replace with a patient quote about post-surgical rehab.', 'attribution' => 'Patient name, post-surgical rehab'],
                    ['quote' => 'Placeholder testimonial. Replace with a patient quote about chronic back pain.', 'attribution' => 'Patient name, chronic pain'],
                ],
            ],
            'resources' => [
                'eyebrow' => 'Latest resources',
                'title' => 'Notes from the training floor',
                'description' => '',
                'all_resources_label' => 'View all resources',
                'unavailable_message' => 'Please visit the resources page again soon. The rest of the site is ready for you.',
                'empty_message' => 'New articles are on the way. Visit the resources page again soon.',
                'category_fallback' => 'Resource',
                'read_article_label' => 'Read article',
            ],
            'faq' => [
                'eyebrow' => 'VI. Questions',
                'title' => 'Common questions',
                'items' => [
                    ['question' => "Do I need a doctor's referral?", 'answer' => "Minnesota allows direct access to physical therapy, so you can typically start without a referral. We'll confirm what applies to you during the phone consult."],
                    ['question' => 'Do you take insurance?', 'answer' => 'Forge is a cash-based, out-of-network practice. You pay at the time of service. If your plan offers out-of-network benefits, you can request documentation to submit for possible reimbursement.'],
                    ['question' => 'What does the $49.99 initial consultation include?', 'answer' => 'An in-person assessment at your home or gym to identify the root cause of your pain or dysfunction, followed by a recommended rehabilitation plan.'],
                    ['question' => 'Where do sessions take place?', 'answer' => 'At your home, your gym, or on-field, anywhere in the Twin Cities Metro Area. There is no clinic to travel to.'],
                    ['question' => 'How long is each session?', 'answer' => 'Every session is a full 60 minutes, one-on-one with Dr. Sperlak.'],
                    ['question' => 'How many visits will I need?', 'answer' => "It depends on your condition and goals. You'll get a clear plan after your initial consultation, designed for lasting results rather than an open-ended schedule."],
                ],
                'cta_prefix' => "Don't see yours?",
                'cta_label' => 'Ask during your free phone consult.',
            ],
            'contact' => [
                'eyebrow' => 'VII. Contact',
                'title' => 'Book a free 15-minute phone consult.',
                'description' => 'Leave your details and Joseph will call you back to talk through your goals and next steps.',
                'phone' => '(612) 555-0148',
                'email' => 'hello@forgeperformance.com',
                'service_area' => 'Twin Cities Metro Area',
                'venue' => 'Your home or gym',
                'form' => [
                    'name_label' => 'Name',
                    'phone_label' => 'Phone',
                    'email_label' => 'Email',
                    'email_optional_label' => '(optional)',
                    'best_time_label' => 'Best time to call',
                    'message_label' => "What's going on?",
                    'message_optional_label' => '(optional)',
                    'consent_label' => 'I agree to share this information with Forge Performance Therapy for the purpose of contacting me about my consultation only. Forge will never sell or share the information I submit.',
                    'submit_label' => 'Request my free consult',
                    'sending_label' => 'Sending…',
                    'success_message' => 'Thank you. Your request was received, and Joseph will contact you to schedule your free consultation.',
                    'generic_error_message' => 'Your request could not be sent. Your details are still here, so please try again, or call (612) 555-0148 or email hello@forgeperformance.com.',
                    'captcha_retry_message' => "The security check wasn't accepted. Please complete it again and resend.",
                ],
            ],
        ];
    }

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
