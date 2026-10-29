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
use Forge\Api\Repository\ConsultationRequestRepository;
use Forge\Api\Repository\PostRepository;
use OpenSSLAsymmetricKey;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use RuntimeException;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

final class AdminApiTest extends TestCase
{
    private PDO $pdo;
    private App $app;
    private OpenSSLAsymmetricKey $privateKey;
    private bool $captchaAccepted = true;
    private ?RuntimeException $captchaFailure = null;
    /** @var list<string> */
    private array $captchaTokens = [];

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
            'captcha_verifier' => function (string $token): bool {
                $this->captchaTokens[] = $token;
                if ($this->captchaFailure !== null) {
                    throw $this->captchaFailure;
                }

                return $this->captchaAccepted;
            },
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

    public function testTaxonomyEndpointRequiresAdminAuthenticationAndStartsEmpty(): void
    {
        $unauthorized = $this->request('GET', '/admin/taxonomy', null, false);
        self::assertSame(401, $unauthorized->getStatusCode());
        self::assertSame(['error' => 'Unauthorized'], $this->decode($unauthorized));

        $empty = $this->request('GET', '/admin/taxonomy');
        self::assertSame(200, $empty->getStatusCode());
        self::assertSame('{"data":{"categories":[],"tags":[]}}', (string) $empty->getBody());
    }

    public function testPostsSaveMultipleCategoriesAndTagsAndPersistReusableVocabulary(): void
    {
        $created = $this->request('POST', '/admin/posts', [
            'slug' => 'taxonomy-post',
            'title' => 'Taxonomy post',
            'categories' => [' Rehab ', 'Strength', 'Rehab', '', '  '],
            'tags' => ['knee', ' knee ', 'ACL', ''],
        ]);
        self::assertSame(201, $created->getStatusCode());
        $post = $this->decode($created)['data'];
        self::assertSame(['Rehab', 'Strength'], $post['categories']);
        self::assertSame('Rehab', $post['category']);
        self::assertSame(['knee', 'ACL'], $post['tags']);
        $id = $post['id'];

        $draft = $this->request('POST', '/admin/posts', [
            'slug' => 'draft-post',
            'title' => 'Draft post',
            'categories' => ['Mobility'],
            'tags' => ['hip'],
        ]);
        self::assertSame(201, $draft->getStatusCode());
        self::assertSame(200, $this->request('POST', '/admin/posts/' . $id . '/publish')->getStatusCode());

        $shown = $this->decode($this->request('GET', '/admin/posts/' . $id))['data'];
        self::assertSame(['Rehab', 'Strength'], $shown['categories']);
        self::assertSame('Rehab', $shown['category']);
        self::assertSame(['knee', 'ACL'], $shown['tags']);
        $listed = array_column($this->decode($this->request('GET', '/admin/posts'))['data'], null, 'slug');
        self::assertSame(['Mobility'], $listed['draft-post']['categories']);
        self::assertSame('Mobility', $listed['draft-post']['category']);
        self::assertSame(['hip'], $listed['draft-post']['tags']);

        self::assertSame(
            ['categories' => ['Mobility', 'Rehab', 'Strength'], 'tags' => ['ACL', 'hip', 'knee']],
            $this->taxonomy()
        );

        $partial = $this->decode($this->request('PUT', '/admin/posts/' . $id, ['title' => 'Renamed']))['data'];
        self::assertSame('Renamed', $partial['title']);
        self::assertSame(['Rehab', 'Strength'], $partial['categories']);
        self::assertSame('Rehab', $partial['category']);
        self::assertSame(['knee', 'ACL'], $partial['tags']);

        $tagsOnly = $this->decode($this->request('PUT', '/admin/posts/' . $id, ['tags' => ['ACL', 'Running']]))['data'];
        self::assertSame(['Rehab', 'Strength'], $tagsOnly['categories']);
        self::assertSame(['ACL', 'Running'], $tagsOnly['tags']);

        $cleared = $this->decode($this->request('PUT', '/admin/posts/' . $id, ['categories' => [], 'tags' => []]))['data'];
        self::assertSame([], $cleared['categories']);
        self::assertSame('', $cleared['category']);
        self::assertSame([], $cleared['tags']);
        $reloaded = $this->decode($this->request('GET', '/admin/posts/' . $id))['data'];
        self::assertSame([], $reloaded['categories']);
        self::assertSame([], $reloaded['tags']);

        self::assertSame(204, $this->request('DELETE', '/admin/posts/' . $this->decode($draft)['data']['id'])->getStatusCode());
        self::assertSame(
            ['categories' => ['Mobility', 'Rehab', 'Strength'], 'tags' => ['ACL', 'hip', 'knee', 'Running']],
            $this->taxonomy()
        );

        $reused = $this->decode($this->request('POST', '/admin/posts', [
            'slug' => 'reused-post',
            'title' => 'Reused',
            'categories' => ['Mobility'],
            'tags' => ['hip'],
        ]))['data'];
        self::assertSame(['Mobility'], $reused['categories']);
        self::assertSame(1, (int) $this->pdo->query("SELECT COUNT(*) FROM taxonomy_terms WHERE kind = 'category' AND name = 'Mobility'")->fetchColumn());
        self::assertSame(1, (int) $this->pdo->query("SELECT COUNT(*) FROM taxonomy_terms WHERE kind = 'tag' AND name = 'hip'")->fetchColumn());
    }

    public function testLegacyCategoryInputMapsToCategoriesAndExplicitCategoriesWin(): void
    {
        $legacy = $this->decode($this->request('POST', '/admin/posts', [
            'slug' => 'legacy-post',
            'title' => 'Legacy',
            'category' => 'Rehab',
        ]))['data'];
        self::assertSame(['Rehab'], $legacy['categories']);
        self::assertSame('Rehab', $legacy['category']);
        self::assertSame([], $legacy['tags']);

        $blank = $this->decode($this->request('POST', '/admin/posts', [
            'slug' => 'blank-post',
            'title' => 'Blank',
            'category' => '',
        ]))['data'];
        self::assertSame([], $blank['categories']);
        self::assertSame('', $blank['category']);

        $both = $this->decode($this->request('POST', '/admin/posts', [
            'slug' => 'both-post',
            'title' => 'Both',
            'category' => 'Legacy',
            'categories' => ['First', 'Second'],
        ]))['data'];
        self::assertSame(['First', 'Second'], $both['categories']);
        self::assertSame('First', $both['category']);

        $id = $legacy['id'];
        $updated = $this->decode($this->request('PUT', '/admin/posts/' . $id, ['category' => ' Recovery ']))['data'];
        self::assertSame(['Recovery'], $updated['categories']);
        self::assertSame('Recovery', $updated['category']);

        $explicit = $this->decode($this->request('PUT', '/admin/posts/' . $id, [
            'category' => 'Ignored',
            'categories' => ['Strength', 'Rehab'],
        ]))['data'];
        self::assertSame(['Strength', 'Rehab'], $explicit['categories']);
        self::assertSame('Strength', $explicit['category']);

        $emptied = $this->decode($this->request('PUT', '/admin/posts/' . $id, ['category' => '']))['data'];
        self::assertSame([], $emptied['categories']);
        self::assertSame('', $emptied['category']);

        self::assertSame(['First', 'Recovery', 'Rehab', 'Second', 'Strength'], $this->taxonomy()['categories']);
    }

    public function testInvalidCategoriesAndTagsReturnFieldErrorsWithoutAddingVocabulary(): void
    {
        $cases = [
            [['categories' => 'Rehab'], 'categories'],
            [['tags' => 'knee'], 'tags'],
            [['categories' => ['Rehab', 5]], 'categories'],
            [['tags' => ['knee', ['nested']]], 'tags'],
            [['categories' => ['Rehab', null]], 'categories'],
            [['tags' => ['knee', true]], 'tags'],
            [['categories' => ['a' => 'Rehab']], 'categories'],
        ];
        foreach ($cases as $index => [$fields, $expected]) {
            $response = $this->request('POST', '/admin/posts', ['slug' => 'invalid-' . $index, 'title' => 'Invalid'] + $fields);
            self::assertSame(422, $response->getStatusCode(), (string) $index);
            $body = $this->decode($response);
            self::assertSame('Validation failed.', $body['error']);
            self::assertArrayHasKey($expected, $body['fields'], (string) $index);
        }
        self::assertSame([], (new PostRepository($this->pdo))->listAll());

        $created = $this->decode($this->request('POST', '/admin/posts', [
            'slug' => 'valid-post',
            'title' => 'Valid',
            'categories' => ['Rehab'],
            'tags' => ['knee'],
        ]))['data'];
        foreach ($cases as $index => [$fields, $expected]) {
            $response = $this->request('PUT', '/admin/posts/' . $created['id'], $fields + ['title' => 'Changed', 'tags' => ['new-tag'], 'categories' => ['New Category']]);
            self::assertSame(422, $response->getStatusCode(), (string) $index);
            self::assertArrayHasKey($expected, $this->decode($response)['fields'], (string) $index);
        }

        $post = (new PostRepository($this->pdo))->find($created['id']);
        self::assertSame('Valid', $post['title']);
        self::assertSame(['Rehab'], $post['categories']);
        self::assertSame(['knee'], $post['tags']);
        self::assertSame(['categories' => ['Rehab'], 'tags' => ['knee']], $this->taxonomy());
    }

    public function testConsultationPublicSubmissionPersistsPopulatedAndOmittedOptionalFields(): void
    {
        $submitted = $this->consultationPayload([
            'name' => '  Taylor Client  ',
            'phone' => '  (612) 555-0199  ',
            'email' => '  taylor@example.com  ',
            'best_time' => ' Afternoon ',
            'message' => "  First line\r\nSecond line  ",
            'captcha_token' => ' accepted-token-one ',
        ]);
        $created = $this->request('POST', '/consultation-requests', $submitted, false);
        self::assertSame(201, $created->getStatusCode());
        self::assertSame('no-store', $created->getHeaderLine('Cache-Control'));
        self::assertSame(['status' => 'pending'], $this->decode($created));

        $repository = new ConsultationRequestRepository($this->pdo);
        $first = $repository->find(1);
        self::assertNotNull($first);
        self::assertSame('Taylor Client', $first['name']);
        self::assertSame('(612) 555-0199', $first['phone']);
        self::assertSame('taylor@example.com', $first['email']);
        self::assertSame('Afternoon', $first['best_time']);
        self::assertSame("First line\nSecond line", $first['message']);
        self::assertSame('pending', $first['status']);
        self::assertMatchesRegularExpression('/^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}:\\d{2}Z$/', $first['consented_at']);
        self::assertSame($first['consented_at'], $first['created_at']);
        self::assertNull($first['resolved_at']);

        $omitted = $this->consultationPayload([
            'name' => 'Optional Fields Omitted',
            'phone' => '612-555-0100',
            'best_time' => 'Morning',
            'captcha_token' => 'accepted-token-two',
        ]);
        unset($omitted['email'], $omitted['message']);
        $createdOmitted = $this->request('POST', '/consultation-requests', $omitted, false);
        self::assertSame(201, $createdOmitted->getStatusCode());
        self::assertSame(['status' => 'pending'], $this->decode($createdOmitted));

        $second = $repository->find(2);
        self::assertNotNull($second);
        self::assertNull($second['email']);
        self::assertSame('', $second['message']);
        self::assertSame(['accepted-token-one', 'accepted-token-two'], $this->captchaTokens);

        Migrator::migrate($this->pdo);
        self::assertSame('Taylor Client', $repository->find(1)['name']);
        self::assertSame('Optional Fields Omitted', $repository->find(2)['name']);
    }

    public function testConsultationValidationRejectsInvalidJsonFieldsWithoutCaptchaOrInsert(): void
    {
        $cases = [
            'missing name' => [[], ['name'], 'name'],
            'non-string name' => [['name' => ['Taylor']], [], 'name'],
            'blank name' => [['name' => '  '], [], 'name'],
            'long name' => [['name' => str_repeat('n', 81)], [], 'name'],
            'missing phone' => [[], ['phone'], 'phone'],
            'non-string phone' => [['phone' => 6125550100], [], 'phone'],
            'blank phone' => [['phone' => '  '], [], 'phone'],
            'long phone' => [['phone' => str_repeat('1', 65)], [], 'phone'],
            'invalid email' => [['email' => 'not-an-email'], [], 'email'],
            'non-string email' => [['email' => false], [], 'email'],
            'long email' => [['email' => str_repeat('a', 246) . '@example.com'], [], 'email'],
            'non-string message' => [['message' => ['private']], [], 'message'],
            'long message' => [['message' => str_repeat('m', 5001)], [], 'message'],
            'missing best time' => [[], ['best_time'], 'best_time'],
            'non-string best time' => [['best_time' => 1], [], 'best_time'],
            'invalid best time' => [['best_time' => 'Night'], [], 'best_time'],
            'missing consent' => [[], ['consent'], 'consent'],
            'false consent' => [['consent' => false], [], 'consent'],
            'non-boolean consent' => [['consent' => 'true'], [], 'consent'],
            'missing captcha' => [[], ['captcha_token'], 'captcha_token'],
            'non-string captcha' => [['captcha_token' => ['token']], [], 'captcha_token'],
            'blank captcha' => [['captcha_token' => '  '], [], 'captcha_token'],
            'long captcha' => [['captcha_token' => str_repeat('t', 2049)], [], 'captcha_token'],
        ];

        foreach ($cases as $label => [$changes, $removed, $field]) {
            $payload = $this->consultationPayload($changes);
            foreach ($removed as $key) {
                unset($payload[$key]);
            }

            $response = $this->request('POST', '/consultation-requests', $payload, false);
            self::assertSame(422, $response->getStatusCode(), $label);
            self::assertSame('no-store', $response->getHeaderLine('Cache-Control'), $label);
            $body = $this->decode($response);
            self::assertSame('Validation failed.', $body['error'], $label);
            self::assertArrayHasKey($field, $body['fields'], $label);
        }

        self::assertSame([], $this->captchaTokens);
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM consultation_requests')->fetchColumn());
    }

    public function testConsultationCaptchaRejectionAndUnavailableProviderNeverInsert(): void
    {
        $this->captchaAccepted = false;
        $rejected = $this->request('POST', '/consultation-requests', $this->consultationPayload([
            'name' => 'Sensitive Name',
            'message' => 'Sensitive message',
            'captcha_token' => 'rejected-token',
        ]), false);
        self::assertSame(422, $rejected->getStatusCode());
        self::assertArrayHasKey('captcha_token', $this->decode($rejected)['fields']);
        self::assertStringNotContainsString('Sensitive Name', (string) $rejected->getBody());
        self::assertStringNotContainsString('Sensitive message', (string) $rejected->getBody());

        $this->captchaAccepted = true;
        $this->captchaFailure = new RuntimeException('provider detail that must not be exposed');
        $unavailable = $this->request('POST', '/consultation-requests', $this->consultationPayload([
            'captcha_token' => 'unavailable-token',
        ]), false);
        self::assertSame(503, $unavailable->getStatusCode());
        self::assertSame(['error' => 'CAPTCHA verification is unavailable.'], $this->decode($unavailable));
        self::assertSame('no-store', $unavailable->getHeaderLine('Cache-Control'));

        self::assertSame(['rejected-token', 'unavailable-token'], $this->captchaTokens);
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM consultation_requests')->fetchColumn());
    }

    public function testConsultationAdminAuthenticationFiltersPaginationAndValidation(): void
    {
        $repository = new ConsultationRequestRepository($this->pdo);
        $ids = [];
        for ($number = 1; $number <= 23; $number++) {
            $ids[] = $repository->create([
                'name' => 'Request ' . $number,
                'phone' => '612-555-' . str_pad((string) $number, 4, '0', STR_PAD_LEFT),
                'email' => null,
                'best_time' => 'Morning',
                'message' => '',
            ]);
        }
        $repository->setStatus($ids[0], 'completed');
        $repository->setStatus($ids[1], 'ignored');

        self::assertSame(401, $this->request('GET', '/admin/consultation-requests', null, false)->getStatusCode());
        self::assertSame(401, $this->request('PATCH', '/admin/consultation-requests/' . $ids[2], ['status' => 'completed'], false)->getStatusCode());

        $default = $this->request('GET', '/admin/consultation-requests');
        self::assertSame(200, $default->getStatusCode());
        $defaultBody = $this->decode($default);
        self::assertCount(20, $defaultBody['data']);
        self::assertSame($ids[22], $defaultBody['data'][0]['id']);
        self::assertSame(['page' => 1, 'per_page' => 20], $defaultBody['meta']);

        $secondPage = $this->decode($this->request('GET', '/admin/consultation-requests?status=pending&page=2'));
        self::assertCount(1, $secondPage['data']);
        self::assertSame($ids[2], $secondPage['data'][0]['id']);
        self::assertSame(['page' => 2, 'per_page' => 20], $secondPage['meta']);

        $completed = $this->decode($this->request('GET', '/admin/consultation-requests?status=completed'));
        self::assertSame([$ids[0]], array_column($completed['data'], 'id'));
        $ignored = $this->decode($this->request('GET', '/admin/consultation-requests?status=ignored'));
        self::assertSame([$ids[1]], array_column($ignored['data'], 'id'));

        foreach (['status=unknown' => 'status', 'page=0' => 'page', 'page=1.5' => 'page', 'status[]=pending' => 'status'] as $query => $field) {
            $invalid = $this->request('GET', '/admin/consultation-requests?' . $query);
            self::assertSame(422, $invalid->getStatusCode(), $query);
            self::assertArrayHasKey($field, $this->decode($invalid)['fields'], $query);
        }

        $invalidUpdate = $this->request('PATCH', '/admin/consultation-requests/' . $ids[2], ['status' => 'pending']);
        self::assertSame(422, $invalidUpdate->getStatusCode());
        self::assertArrayHasKey('status', $this->decode($invalidUpdate)['fields']);
        self::assertSame('pending', $repository->find($ids[2])['status']);
    }

    public function testConsultationFrontendPayloadLifecycleMovesRequestsBetweenAdminQueues(): void
    {
        $completedPayload = $this->consultationPayload([
            'name' => 'Frontend Complete',
            'phone' => '612-555-0101',
            'email' => 'complete@example.com',
            'best_time' => 'Midday',
            'message' => 'Please call after lunch.',
            'captcha_token' => 'frontend-complete-token',
        ]);
        $ignoredPayload = $this->consultationPayload([
            'name' => 'Frontend Ignore',
            'phone' => '612-555-0102',
            'email' => '',
            'best_time' => 'Evening',
            'message' => '',
            'captcha_token' => 'frontend-ignore-token',
        ]);
        self::assertSame(201, $this->request('POST', '/consultation-requests', $completedPayload, false)->getStatusCode());
        self::assertSame(201, $this->request('POST', '/consultation-requests', $ignoredPayload, false)->getStatusCode());

        $pending = $this->decode($this->request('GET', '/admin/consultation-requests'))['data'];
        self::assertSame(['Frontend Ignore', 'Frontend Complete'], array_column($pending, 'name'));
        $byName = array_column($pending, null, 'name');
        self::assertSame('612-555-0101', $byName['Frontend Complete']['phone']);
        self::assertSame('complete@example.com', $byName['Frontend Complete']['email']);
        self::assertSame('Midday', $byName['Frontend Complete']['best_time']);
        self::assertSame('Please call after lunch.', $byName['Frontend Complete']['message']);
        self::assertNull($byName['Frontend Ignore']['email']);
        self::assertSame('', $byName['Frontend Ignore']['message']);
        self::assertSame(
            ['id', 'name', 'phone', 'email', 'best_time', 'message', 'consented_at', 'status', 'created_at', 'resolved_at'],
            array_keys($pending[0]),
        );

        $completedId = $byName['Frontend Complete']['id'];
        $ignoredId = $byName['Frontend Ignore']['id'];
        $completed = $this->decode($this->request('PATCH', '/admin/consultation-requests/' . $completedId, ['status' => 'completed']))['data'];
        self::assertSame('completed', $completed['status']);
        self::assertNotNull($completed['resolved_at']);
        self::assertSame('Please call after lunch.', $completed['message']);
        $resolvedAt = $completed['resolved_at'];

        $repeated = $this->decode($this->request('PATCH', '/admin/consultation-requests/' . $completedId, ['status' => 'completed']))['data'];
        self::assertSame($resolvedAt, $repeated['resolved_at']);

        $ignored = $this->decode($this->request('PATCH', '/admin/consultation-requests/' . $ignoredId, ['status' => 'ignored']))['data'];
        self::assertSame('ignored', $ignored['status']);
        self::assertNotNull($ignored['resolved_at']);
        self::assertNull($ignored['email']);

        self::assertSame([], $this->decode($this->request('GET', '/admin/consultation-requests'))['data']);
        self::assertSame([$completedId], array_column($this->decode($this->request('GET', '/admin/consultation-requests?status=completed'))['data'], 'id'));
        self::assertSame([$ignoredId], array_column($this->decode($this->request('GET', '/admin/consultation-requests?status=ignored'))['data'], 'id'));

        $invalid = $this->request('PATCH', '/admin/consultation-requests/' . $completedId, ['status' => 'reopened']);
        self::assertSame(422, $invalid->getStatusCode());
        self::assertSame('completed', (new ConsultationRequestRepository($this->pdo))->find($completedId)['status']);

        $missing = $this->request('PATCH', '/admin/consultation-requests/999999', ['status' => 'completed']);
        self::assertSame(404, $missing->getStatusCode());
        self::assertSame(['error' => 'Consultation request not found.'], $this->decode($missing));
    }

    /** @param array<string, mixed> $overrides @return array<string, mixed> */
    private function consultationPayload(array $overrides = []): array
    {
        return array_replace([
            'name' => 'Taylor Client',
            'phone' => '612-555-0199',
            'email' => 'taylor@example.com',
            'best_time' => 'Afternoon',
            'message' => 'I would like to schedule a consultation.',
            'consent' => true,
            'captcha_token' => 'accepted-token',
        ], $overrides);
    }

    /** @return array<string, mixed> */
    private function taxonomy(): array
    {
        $response = $this->request('GET', '/admin/taxonomy');
        self::assertSame(200, $response->getStatusCode());

        return $this->decode($response)['data'];
    }

    /** @param array<string, mixed>|null $body */
    private function request(string $method, string $path, ?array $body = null, bool $authenticated = true): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        if ($authenticated) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $this->token());
        }

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
