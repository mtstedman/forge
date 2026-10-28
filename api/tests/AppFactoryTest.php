<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use RuntimeException;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;

final class AppFactoryTest extends TestCase
{
    /** @param array<string, mixed> $config */
    private function app(array $config = []): App
    {
        return AppFactory::create(Database::create('sqlite::memory:'), Config::fromArray($config));
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

    /** @return array<mixed> */
    private function decode(ResponseInterface $response): array
    {
        $data = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }

    public function testHealthReturnsJson(): void
    {
        $response = $this->request($this->app(), 'GET', '/health');

        self::assertSame(200, $response->getStatusCode());
        self::assertStringStartsWith('application/json', $response->getHeaderLine('Content-Type'));
        self::assertSame(['status' => 'ok'], $this->decode($response));
    }

    public function testUnknownRouteReturnsJson404WithoutTrace(): void
    {
        $response = $this->request($this->app(), 'GET', '/does-not-exist');
        $body = (string) $response->getBody();

        self::assertSame(404, $response->getStatusCode());
        self::assertStringStartsWith('application/json', $response->getHeaderLine('Content-Type'));
        $data = $this->decode($response);
        self::assertArrayHasKey('message', $data);
        self::assertArrayNotHasKey('exception', $data);
        self::assertStringNotContainsStringIgnoringCase('trace', $body);
        self::assertStringNotContainsString('.php', $body);
    }

    public function testUnexpectedErrorHidesDetailsOutsideDev(): void
    {
        $app = $this->app(['APP_ENV' => 'production']);
        $app->get('/boom', static function (): never {
            throw new RuntimeException('secret internal detail');
        });

        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $response = $this->request($app, 'GET', '/boom');
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
        }
        $body = (string) $response->getBody();

        self::assertSame(500, $response->getStatusCode());
        self::assertStringStartsWith('application/json', $response->getHeaderLine('Content-Type'));
        self::assertArrayNotHasKey('exception', $this->decode($response));
        self::assertStringNotContainsString('secret internal detail', $body);
    }

    public function testUnexpectedErrorShowsDetailsInDev(): void
    {
        $app = $this->app(['APP_ENV' => 'dev']);
        $app->get('/boom', static function (): never {
            throw new RuntimeException('visible in dev');
        });

        $previousLog = ini_set('error_log', '/dev/null');
        try {
            $response = $this->request($app, 'GET', '/boom');
        } finally {
            ini_set('error_log', $previousLog === false ? '' : $previousLog);
        }

        self::assertSame(500, $response->getStatusCode());
        self::assertStringContainsString('visible in dev', (string) $response->getBody());
    }

    public function testPreflightFromAllowedOriginGetsCorsHeaders(): void
    {
        $app = $this->app(['CORS_ALLOWED_ORIGINS' => 'https://ancoratiming.com, https://admin.example.test']);
        $response = $this->request($app, 'OPTIONS', '/health', [
            'Origin' => 'https://admin.example.test',
            'Access-Control-Request-Method' => 'POST',
            'Access-Control-Request-Headers' => 'Authorization, Content-Type',
        ]);

        self::assertLessThan(300, $response->getStatusCode());
        self::assertSame('https://admin.example.test', $response->getHeaderLine('Access-Control-Allow-Origin'));
        $allowedHeaders = strtolower($response->getHeaderLine('Access-Control-Allow-Headers'));
        self::assertStringContainsString('authorization', $allowedHeaders);
        self::assertStringContainsString('content-type', $allowedHeaders);
    }

    public function testPreflightFromUnlistedOriginGetsNoAllowOrigin(): void
    {
        $app = $this->app(['CORS_ALLOWED_ORIGINS' => 'https://ancoratiming.com']);
        $response = $this->request($app, 'OPTIONS', '/health', [
            'Origin' => 'https://evil.example',
            'Access-Control-Request-Method' => 'POST',
        ]);

        self::assertFalse($response->hasHeader('Access-Control-Allow-Origin'));
    }

    public function testSimpleRequestFromAllowedOriginGetsAllowOrigin(): void
    {
        $app = $this->app(['CORS_ALLOWED_ORIGINS' => 'https://ancoratiming.com']);
        $response = $this->request($app, 'GET', '/health', ['Origin' => 'https://ancoratiming.com']);

        self::assertSame(200, $response->getStatusCode());
        self::assertSame('https://ancoratiming.com', $response->getHeaderLine('Access-Control-Allow-Origin'));
    }

    public function testSecurityHeaders(): void
    {
        $app = $this->app();

        $public = $this->request($app, 'GET', '/health');
        self::assertSame('nosniff', $public->getHeaderLine('X-Content-Type-Options'));
        self::assertStringContainsString("frame-ancestors 'none'", $public->getHeaderLine('Content-Security-Policy'));
        self::assertStringNotContainsString('no-store', $public->getHeaderLine('Cache-Control'));

        $admin = $this->request($app, 'GET', '/admin/anything');
        self::assertSame('no-store', $admin->getHeaderLine('Cache-Control'));
        self::assertSame('nosniff', $admin->getHeaderLine('X-Content-Type-Options'));
    }

    public function testPublicCommentsDisabledByDefault(): void
    {
        self::assertFalse(Config::fromArray([])->bool('PUBLIC_COMMENTS_ENABLED'));

        $previousEnv = $_ENV['PUBLIC_COMMENTS_ENABLED'] ?? null;
        $previousGetenv = getenv('PUBLIC_COMMENTS_ENABLED');
        unset($_ENV['PUBLIC_COMMENTS_ENABLED']);
        putenv('PUBLIC_COMMENTS_ENABLED');
        try {
            self::assertFalse(Config::fromEnv()->bool('PUBLIC_COMMENTS_ENABLED'));
        } finally {
            if ($previousEnv !== null) {
                $_ENV['PUBLIC_COMMENTS_ENABLED'] = $previousEnv;
            }
            if ($previousGetenv !== false) {
                putenv('PUBLIC_COMMENTS_ENABLED=' . $previousGetenv);
            }
        }
    }

    public function testConfigAccessors(): void
    {
        $config = Config::fromArray([
            'PUBLIC_COMMENTS_ENABLED' => 'true',
            'COMMENT_RATE_LIMIT' => '5',
            'UPLOAD_MAX_BYTES' => 'not-a-number',
            'APP_ENV' => 'dev',
        ]);

        self::assertTrue($config->bool('PUBLIC_COMMENTS_ENABLED'));
        self::assertSame(5, $config->int('COMMENT_RATE_LIMIT', 3));
        self::assertSame(5242880, $config->int('UPLOAD_MAX_BYTES', 5242880));
        self::assertSame('dev', $config->get('APP_ENV'));
        self::assertSame('api/public/uploads', $config->get('UPLOAD_DIR', 'api/public/uploads'));
        self::assertNull($config->get('MEDIA_BASE_URL'));
    }
}
