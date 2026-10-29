<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;
use Forge\Api\Migrator;
use Forge\Api\Repository\AdminSessionRepository;
use Forge\Api\Repository\AdminUserRepository;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\Factory\StreamFactory;

final class AdminLoginTest extends TestCase
{
    private const EMAIL = 'hundo.watt@gmail.com';
    private const PASSWORD = 'phazerlabs123!';

    private PDO $pdo;
    private App $app;
    private int $userId;

    protected function setUp(): void
    {
        $this->pdo = Database::create('sqlite::memory:');
        Migrator::migrate($this->pdo);
        $this->userId = (new AdminUserRepository($this->pdo))
            ->create(self::EMAIL, password_hash(self::PASSWORD, PASSWORD_DEFAULT));
        // No OAuth configuration at all: only local sessions can authenticate.
        $this->app = AppFactory::create($this->pdo, Config::fromArray([]));
    }

    public function testSchemaDefinesAdminTablesAndMigrationIsRepeatable(): void
    {
        Migrator::migrate($this->pdo);

        $tables = $this->pdo->query(
            "SELECT name FROM sqlite_master WHERE type IN ('table', 'index') AND name LIKE '%admin%' ORDER BY name"
        )->fetchAll(PDO::FETCH_COLUMN);
        self::assertContains('admin_users', $tables);
        self::assertContains('admin_sessions', $tables);
        self::assertContains('idx_admin_sessions_expires_at', $tables);

        $user = (new AdminUserRepository($this->pdo))->find($this->userId);
        self::assertNotNull($user);
        self::assertSame(self::EMAIL, $user['email']);
        self::assertSame('', $user['name']);
        self::assertTrue(password_verify(self::PASSWORD, $user['password_hash']));
    }

    public function testLoginSucceedsAndTokenAuthorizesAdminRoutes(): void
    {
        $response = $this->login(['email' => self::EMAIL, 'password' => self::PASSWORD]);

        self::assertSame(200, $response->getStatusCode());
        $data = $this->decode($response)['data'];
        self::assertIsString($data['access_token']);
        self::assertMatchesRegularExpression('/^[A-Za-z0-9_-]{43}$/', $data['access_token']);
        self::assertSame('Bearer', $data['token_type']);
        self::assertMatchesRegularExpression('/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/', $data['expires_at']);
        self::assertSame(['sub' => (string) $this->userId, 'name' => null, 'email' => self::EMAIL], $data['user']);

        $stored = $this->pdo->query('SELECT token_hash FROM admin_sessions')->fetchAll(PDO::FETCH_COLUMN);
        self::assertSame([hash('sha256', $data['access_token'])], $stored);

        $me = $this->request('GET', '/admin/me', null, $data['access_token']);
        self::assertSame(200, $me->getStatusCode());
        self::assertSame([
            'data' => ['sub' => (string) $this->userId, 'name' => null, 'email' => self::EMAIL],
        ], $this->decode($me));

        $posts = $this->request('GET', '/admin/posts', null, $data['access_token']);
        self::assertSame(200, $posts->getStatusCode());
    }

    public function testLoginNormalisesEmailCaseAndWhitespace(): void
    {
        $response = $this->login(['email' => '  Hundo.Watt@GMAIL.com ', 'password' => self::PASSWORD]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame(self::EMAIL, $this->decode($response)['data']['user']['email']);
    }

    public function testWrongPasswordAndUnknownEmailFailIdentically(): void
    {
        $wrongPassword = $this->login(['email' => self::EMAIL, 'password' => 'not-the-password']);
        $unknownEmail = $this->login(['email' => 'nobody@example.test', 'password' => self::PASSWORD]);

        foreach ([$wrongPassword, $unknownEmail] as $response) {
            self::assertSame(401, $response->getStatusCode());
            self::assertSame('{"error":"Invalid email or password."}', (string) $response->getBody());
            self::assertSame('', $response->getHeaderLine('WWW-Authenticate'));
        }
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM admin_sessions')->fetchColumn());
    }

    public function testInvalidLoginBodiesReturnValidationErrors(): void
    {
        $cases = [
            'missing password' => [['email' => self::EMAIL], ['password']],
            'missing email' => [['password' => self::PASSWORD], ['email']],
            'empty body' => [[], ['email', 'password']],
            'blank email' => [['email' => '   ', 'password' => self::PASSWORD], ['email']],
            'non-string password' => [['email' => self::EMAIL, 'password' => 123], ['password']],
        ];

        foreach ($cases as $label => [$body, $fields]) {
            $response = $this->login($body);
            self::assertSame(422, $response->getStatusCode(), $label);
            $decoded = $this->decode($response);
            self::assertSame('Validation failed.', $decoded['error'], $label);
            self::assertIsArray($decoded['fields'], $label);
            self::assertSame($fields, array_keys($decoded['fields']), $label);
        }
    }

    public function testLoginIsNotProtectedByTheBearerMiddleware(): void
    {
        $response = $this->app->handle((new ServerRequestFactory())->createServerRequest('POST', '/admin/login'));

        self::assertSame(422, $response->getStatusCode());
        self::assertSame('', $response->getHeaderLine('WWW-Authenticate'));
        self::assertNotSame(['error' => 'Unauthorized'], $this->decode($response));
    }

    public function testLogoutRevokesTheSessionToken(): void
    {
        $token = $this->decode($this->login(['email' => self::EMAIL, 'password' => self::PASSWORD]))['data']['access_token'];

        $logout = $this->request('POST', '/admin/logout', null, $token);
        self::assertSame(204, $logout->getStatusCode());
        self::assertSame('', (string) $logout->getBody());
        self::assertSame(0, (int) $this->pdo->query('SELECT COUNT(*) FROM admin_sessions')->fetchColumn());

        $me = $this->request('GET', '/admin/me', null, $token);
        self::assertSame(401, $me->getStatusCode());
        self::assertSame(['error' => 'Unauthorized'], $this->decode($me));
    }

    public function testExpiredSessionIsRejectedAndPurgedOnLogin(): void
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        (new AdminSessionRepository($this->pdo))
            ->create($this->userId, hash('sha256', $token), gmdate('Y-m-d\\TH:i:s\\Z', time() - 60));

        $me = $this->request('GET', '/admin/me', null, $token);
        self::assertSame(401, $me->getStatusCode());
        self::assertNotSame('', $me->getHeaderLine('WWW-Authenticate'));

        self::assertSame(200, $this->login(['email' => self::EMAIL, 'password' => self::PASSWORD])->getStatusCode());
        $remaining = $this->pdo->query('SELECT token_hash FROM admin_sessions')->fetchAll(PDO::FETCH_COLUMN);
        self::assertNotContains(hash('sha256', $token), $remaining);
        self::assertCount(1, $remaining);
    }

    /** @param array<string, mixed> $body */
    private function login(array $body): ResponseInterface
    {
        return $this->request('POST', '/admin/login', $body);
    }

    /** @param array<string, mixed>|null $body */
    private function request(string $method, string $path, ?array $body = null, ?string $token = null): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        if ($token !== null) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $token);
        }
        if ($body !== null) {
            $request = $request
                ->withHeader('Content-Type', 'application/json')
                ->withBody((new StreamFactory())->createStream(json_encode($body, JSON_THROW_ON_ERROR)));
        }

        return $this->app->handle($request);
    }

    /** @return array<string, mixed> */
    private function decode(ResponseInterface $response): array
    {
        $data = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }
}
