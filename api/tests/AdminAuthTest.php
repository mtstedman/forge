<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;
use Forge\Api\Migrator;
use OpenSSLAsymmetricKey;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class AdminAuthTest extends TestCase
{
    private OpenSSLAsymmetricKey $privateKey;
    private string $publicKey;

    protected function setUp(): void
    {
        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        self::assertInstanceOf(OpenSSLAsymmetricKey::class, $key);
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);
        self::assertIsString($details['key']);
        $this->privateKey = $key;
        $this->publicKey = $details['key'];
    }

    public function testEveryAdminEndpointRequiresBearerAuthentication(): void
    {
        $app = $this->app();
        foreach ([
            ['GET', '/admin/me'],
            ['GET', '/admin/posts'],
            ['POST', '/admin/posts'],
            ['GET', '/admin/posts/1'],
            ['PUT', '/admin/posts/1'],
            ['DELETE', '/admin/posts/1'],
            ['POST', '/admin/posts/1/publish'],
            ['POST', '/admin/posts/1/unpublish'],
            ['GET', '/admin/comments'],
            ['PATCH', '/admin/comments/1'],
            ['DELETE', '/admin/comments/1'],
        ] as [$method, $path]) {
            $response = $this->request($app, $method, $path);
            self::assertSame(401, $response->getStatusCode(), $method . ' ' . $path);
            self::assertNotSame('', $response->getHeaderLine('WWW-Authenticate'));
            self::assertArrayHasKey('error', $this->decode($response));
        }
    }

    public function testMalformedDisallowedAndInvalidClaimTokensAreRejected(): void
    {
        $app = $this->app();
        $invalidTokens = [
            'malformed' => 'not-a-jwt',
            'none' => $this->unsignedToken(),
            'hs256' => JWT::encode($this->claims(), 'shared-secret', 'HS256', 'test-key'),
            'wrong issuer' => $this->token(['iss' => 'https://wrong.example']),
            'wrong audience' => $this->token(['aud' => 'someone-else']),
            'expired' => $this->token(['exp' => time() - 120]),
            'not yet valid' => $this->token(['nbf' => time() + 120]),
            'missing scope' => $this->token(['scope' => 'read-only']),
            'unknown key' => $this->token([], 'unknown-key'),
        ];

        foreach ($invalidTokens as $label => $token) {
            $response = $this->request($app, 'GET', '/admin/me', ['Authorization' => 'Bearer ' . $token]);
            self::assertSame(401, $response->getStatusCode(), $label);
            self::assertSame(['error' => 'Unauthorized'], $this->decode($response), $label);
        }
    }

    public function testMissingOAuthConfigurationFailsClosed(): void
    {
        $pdo = Database::create('sqlite::memory:');
        Migrator::migrate($pdo);
        $app = AppFactory::create($pdo, Config::fromArray([]), [
            'jwt_key_provider' => fn (): array => ['test-key' => new Key($this->publicKey, 'RS256')],
        ]);

        $response = $this->request($app, 'GET', '/admin/me', [
            'Authorization' => 'Bearer ' . $this->token(),
        ]);

        self::assertSame(401, $response->getStatusCode());
    }

    public function testValidRs256TokenExposesSelectedIdentityClaims(): void
    {
        $response = $this->request($this->app(), 'GET', '/admin/me', [
            'Authorization' => 'Bearer ' . $this->token(),
        ]);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame([
            'data' => [
                'sub' => 'admin-123',
                'name' => 'Admin User',
                'email' => 'admin@example.test',
            ],
        ], $this->decode($response));
    }

    public function testCorsPreflightDoesNotRequireAuthenticationOrReturnData(): void
    {
        $response = $this->request($this->app(['CORS_ALLOWED_ORIGINS' => 'https://admin.example.test']), 'OPTIONS', '/admin/posts', [
            'Origin' => 'https://admin.example.test',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'Authorization, Content-Type',
        ]);

        self::assertSame(204, $response->getStatusCode());
        self::assertSame('', (string) $response->getBody());
        self::assertSame('https://admin.example.test', $response->getHeaderLine('Access-Control-Allow-Origin'));
    }

    /** @param array<string, mixed> $extraConfig */
    private function app(array $extraConfig = []): App
    {
        $pdo = Database::create('sqlite::memory:');
        Migrator::migrate($pdo);
        $config = Config::fromArray(array_merge([
            'OAUTH_ISSUER' => 'https://issuer.example',
            'OAUTH_AUDIENCE' => 'forge-admin',
            'OAUTH_JWKS_URL' => 'https://issuer.example/.well-known/jwks.json',
            'OAUTH_REQUIRED_SCOPE' => 'admin',
        ], $extraConfig));

        return AppFactory::create($pdo, $config, [
            'jwt_key_provider' => fn (): array => ['test-key' => new Key($this->publicKey, 'RS256')],
        ]);
    }

    /** @param array<string, string> $headers */
    private function request(App $app, string $method, string $path, array $headers = []): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path);
        foreach ($headers as $name => $value) {
            $request = $request->withHeader($name, $value);
        }

        return $app->handle($request);
    }

    /** @return array<string, mixed> */
    private function claims(): array
    {
        return [
            'iss' => 'https://issuer.example',
            'aud' => ['forge-admin', 'another-audience'],
            'sub' => 'admin-123',
            'name' => 'Admin User',
            'email' => 'admin@example.test',
            'scope' => 'openid admin',
            'nbf' => time() - 5,
            'exp' => time() + 300,
        ];
    }

    /** @param array<string, mixed> $overrides */
    private function token(array $overrides = [], string $kid = 'test-key'): string
    {
        return JWT::encode(array_replace($this->claims(), $overrides), $this->privateKey, 'RS256', $kid);
    }

    private function unsignedToken(): string
    {
        return $this->base64Url(json_encode(['typ' => 'JWT', 'alg' => 'none'], JSON_THROW_ON_ERROR)) . '.'
            . $this->base64Url(json_encode($this->claims(), JSON_THROW_ON_ERROR)) . '.';
    }

    private function base64Url(string $value): string
    {
        return rtrim(strtr(base64_encode($value), '+/', '-_'), '=');
    }

    /** @return array<string, mixed> */
    private function decode(ResponseInterface $response): array
    {
        $data = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }
}
