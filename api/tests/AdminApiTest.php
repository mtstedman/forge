<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;
use Forge\Api\Migrator;
use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\PostRepository;
use OpenSSLAsymmetricKey;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

final class AdminApiTest extends TestCase
{
    private PDO $pdo;
    private App $app;
    private OpenSSLAsymmetricKey $privateKey;

    protected function setUp(): void
    {
        $this->pdo = Database::create('sqlite::memory:');
        Migrator::migrate($this->pdo);

        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        self::assertInstanceOf(OpenSSLAsymmetricKey::class, $key);
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);
        self::assertIsString($details['key']);
        $this->privateKey = $key;

        $this->app = AppFactory::create($this->pdo, Config::fromArray([
            'OAUTH_ISSUER' => 'https://issuer.example',
            'OAUTH_AUDIENCE' => 'forge-admin',
            'OAUTH_JWKS_URL' => 'https://issuer.example/.well-known/jwks.json',
            'OAUTH_REQUIRED_SCOPE' => 'admin',
        ]), [
            'jwt_key_provider' => fn (): array => ['test-key' => new Key($details['key'], 'RS256')],
        ]);
    }

    public function testDraftUpdatePublishUnpublishAndDeleteLifecycle(): void
    {
        $created = $this->request('POST', '/admin/posts', [
            'slug' => 'first-resource',
            'title' => 'First resource',
            'body_markdown' => '# Draft body',
            'tags' => ['rehab'],
            'faq' => [],
            'status' => 'published',
        ]);
        self::assertSame(201, $created->getStatusCode());
        $post = $this->decode($created)['data'];
        self::assertSame('draft', $post['status']);
        self::assertSame(0, $post['comments_enabled']);
        $id = $post['id'];
        self::assertSame(404, $this->request('GET', '/posts/first-resource')->getStatusCode());

        $updated = $this->request('PUT', '/admin/posts/' . $id, [
            'title' => 'Updated resource',
            'body_markdown' => '**Updated**',
            'comments_enabled' => true,
            'status' => 'published',
        ]);
        self::assertSame(200, $updated->getStatusCode());
        $post = $this->decode($updated)['data'];
        self::assertSame('Updated resource', $post['title']);
        self::assertSame('draft', $post['status']);
        self::assertSame(1, $post['comments_enabled']);
        self::assertStringContainsString('<strong>Updated</strong>', $post['body_html']);

        $published = $this->request('POST', '/admin/posts/' . $id . '/publish');
        self::assertSame(200, $published->getStatusCode());
        self::assertSame('published', $this->decode($published)['data']['status']);
        self::assertNotNull((new PostRepository($this->pdo))->findPublishedBySlug('first-resource'));
        $public = $this->request('GET', '/posts/first-resource');
        self::assertSame(200, $public->getStatusCode());
        self::assertSame('first-resource', $this->decode($public)['data']['slug']);

        $unpublished = $this->request('POST', '/admin/posts/' . $id . '/unpublish');
        self::assertSame(200, $unpublished->getStatusCode());
        self::assertSame('draft', $this->decode($unpublished)['data']['status']);
        self::assertNull((new PostRepository($this->pdo))->findPublishedBySlug('first-resource'));
        self::assertSame(404, $this->request('GET', '/posts/first-resource')->getStatusCode());

        $deleted = $this->request('DELETE', '/admin/posts/' . $id);
        self::assertSame(204, $deleted->getStatusCode());
        self::assertNull((new PostRepository($this->pdo))->find($id));
    }

    public function testPostSlugValidationAndUniquenessReturnFieldErrors(): void
    {
        self::assertSame(201, $this->request('POST', '/admin/posts', [
            'slug' => 'unique-slug',
            'title' => 'One',
        ])->getStatusCode());

        $duplicate = $this->request('POST', '/admin/posts', [
            'slug' => 'unique-slug',
            'title' => 'Two',
        ]);
        self::assertSame(422, $duplicate->getStatusCode());
        self::assertArrayHasKey('slug', $this->decode($duplicate)['fields']);

        $invalid = $this->request('POST', '/admin/posts', [
            'slug' => 'Not A Slug',
            'title' => 'Three',
        ]);
        self::assertSame(422, $invalid->getStatusCode());
        self::assertArrayHasKey('slug', $this->decode($invalid)['fields']);
    }

    public function testCommentModerationAndListing(): void
    {
        $posts = new PostRepository($this->pdo);
        $postId = $posts->create([
            'slug' => 'commented-post',
            'title' => 'Commented post',
            'body_markdown' => 'Body',
            'comments_enabled' => 1,
        ]);
        $posts->publish($postId);
        $comments = new CommentRepository($this->pdo);
        $approvedId = $comments->create($postId, [
            'author_name' => 'Approved Reader',
            'body' => 'Visible after moderation',
            'ip_hash' => 'hash-approved',
        ]);
        $rejectedId = $comments->create($postId, [
            'author_name' => 'Rejected Reader',
            'body' => 'Not visible',
            'ip_hash' => 'hash-rejected',
        ]);
        $stillPendingId = $comments->create($postId, [
            'author_name' => 'Pending Reader',
            'body' => 'Still pending',
            'ip_hash' => 'hash-pending',
        ]);

        $listed = $this->request('GET', '/admin/comments?status=pending&page=1');
        self::assertSame(200, $listed->getStatusCode());
        $listedBody = $this->decode($listed);
        self::assertCount(3, $listedBody['data']);
        self::assertSame('commented-post', $listedBody['data'][0]['post_slug']);
        self::assertSame('Commented post', $listedBody['data'][0]['post_title']);
        self::assertSame(['page' => 1, 'per_page' => 20], $listedBody['meta']);

        $approved = $this->request('PATCH', '/admin/comments/' . $approvedId, ['status' => 'approved']);
        self::assertSame(200, $approved->getStatusCode());
        self::assertSame('approved', $this->decode($approved)['data']['status']);

        $rejected = $this->request('PATCH', '/admin/comments/' . $rejectedId, ['status' => 'rejected']);
        self::assertSame(200, $rejected->getStatusCode());
        self::assertSame('rejected', $this->decode($rejected)['data']['status']);

        $invalid = $this->request('PATCH', '/admin/comments/' . $stillPendingId, ['status' => 'spam']);
        self::assertSame(422, $invalid->getStatusCode());
        self::assertArrayHasKey('status', $this->decode($invalid)['fields']);
        self::assertSame('pending', $comments->find($stillPendingId)['status']);

        $publicComments = $comments->listApprovedForPost($postId);
        self::assertCount(1, $publicComments);
        self::assertSame($approvedId, $publicComments[0]['id']);

        $publicPost = $this->request('GET', '/posts/commented-post');
        self::assertSame(200, $publicPost->getStatusCode());
        $embedded = $this->decode($publicPost)['data']['comments'];
        self::assertSame([$approvedId], array_column($embedded, 'id'));
        self::assertNotContains($rejectedId, array_column($embedded, 'id'));
    }

    /** @param array<string, mixed>|null $body */
    private function request(string $method, string $path, ?array $body = null): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path)
            ->withHeader('Authorization', 'Bearer ' . $this->token());

        $query = parse_url($path, PHP_URL_QUERY);
        if (is_string($query)) {
            parse_str($query, $params);
            $request = $request->withQueryParams($params);
        }
        if ($body !== null) {
            $request = $request
                ->withHeader('Content-Type', 'application/json')
                ->withBody((new StreamFactory())->createStream(json_encode($body, JSON_THROW_ON_ERROR)));
        }

        return $this->app->handle($request);
    }

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'https://issuer.example',
            'aud' => 'forge-admin',
            'sub' => 'admin-123',
            'scope' => 'admin',
            'nbf' => time() - 5,
            'exp' => time() + 300,
        ], $this->privateKey, 'RS256', 'test-key');
    }

    /** @return array<string, mixed> */
    private function decode(ResponseInterface $response): array
    {
        $data = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }
}
