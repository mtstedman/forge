<?php

declare(strict_types=1);

namespace Forge\Api;

use Forge\Api\Auth\JwtAuthMiddleware;
use Forge\Api\Auth\JwtVerifier;
use Forge\Api\Routes\AdminRoutes;
use Forge\Api\Routes\PublicRoutes;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Slim\App;
use Slim\Exception\HttpException;
use Slim\Factory\AppFactory as SlimAppFactory;
use Slim\Handlers\ErrorHandler;
use Slim\Interfaces\RouteCollectorProxyInterface;
use Throwable;

/**
 * Builds the Slim application for the Forge JSON API.
 *
 * $overrides is reserved for test injection, e.g. 'jwt_key_provider'
 * (a callable returning array<string, \Firebase\JWT\Key>).
 */
final class AppFactory
{
    private const CORS_ALLOWED_HEADERS = 'Authorization, Content-Type';
    private const CORS_ALLOWED_METHODS = 'GET, POST, PUT, PATCH, DELETE, OPTIONS';
    private const CORS_MAX_AGE = '600';

    /** @param array<string, mixed> $overrides */
    public static function create(PDO $pdo, Config $config, array $overrides = []): App
    {
        $app = SlimAppFactory::create();

        $app->addBodyParsingMiddleware();
        $app->addRoutingMiddleware();
        self::addErrorHandling($app, $config);
        // Added after the error middleware so they also wrap error responses.
        $app->add(self::securityHeadersMiddleware());
        $app->add(self::corsMiddleware($app, self::allowedOrigins($config)));

        $app->get('/health', static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            return self::json($response, ['status' => 'ok']);
        });

        PublicRoutes::register($app, $pdo, $config);
        $keyProvider = $overrides['jwt_key_provider'] ?? null;
        if ($keyProvider !== null && !is_callable($keyProvider)) {
            throw new \InvalidArgumentException('jwt_key_provider must be callable.');
        }
        $app->group('/admin', static function (RouteCollectorProxyInterface $group) use ($pdo, $config): void {
            AdminRoutes::register($group, $pdo, $config);
        })->add(new JwtAuthMiddleware(
            new JwtVerifier($config, $keyProvider),
            $app->getResponseFactory(),
        ));

        return $app;
    }

    /** @param array<mixed> $data */
    private static function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withStatus($status);
    }

    private static function addErrorHandling(App $app, Config $config): void
    {
        $displayDetails = $config->get('APP_ENV') === 'dev';

        // Unexpected errors are logged server-side with details; clients only
        // see details when APP_ENV=dev.
        $errorMiddleware = $app->addErrorMiddleware($displayDetails, true, true);

        $defaultHandler = $errorMiddleware->getDefaultErrorHandler();
        if ($defaultHandler instanceof ErrorHandler) {
            $defaultHandler->forceContentType('application/json');
        }

        // Expected HTTP errors (404, 405, ...) are rendered the same way but not logged.
        $errorMiddleware->setErrorHandler(
            HttpException::class,
            static function (
                ServerRequestInterface $request,
                Throwable $exception,
                bool $displayErrorDetails,
            ) use ($defaultHandler): ResponseInterface {
                return $defaultHandler($request, $exception, $displayErrorDetails, false, false);
            },
            true,
        );
    }

    private static function securityHeadersMiddleware(): callable
    {
        return static function (ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface {
            $response = $handler->handle($request)
                ->withHeader('X-Content-Type-Options', 'nosniff')
                ->withHeader('Content-Security-Policy', "frame-ancestors 'none'")
                ->withHeader('X-Frame-Options', 'DENY');

            $path = $request->getUri()->getPath();
            if ($path === '/admin' || str_starts_with($path, '/admin/')) {
                $response = $response->withHeader('Cache-Control', 'no-store');
            }

            return $response;
        };
    }

    /** @param list<string> $allowedOrigins */
    private static function corsMiddleware(App $app, array $allowedOrigins): callable
    {
        $responseFactory = $app->getResponseFactory();

        return static function (ServerRequestInterface $request, RequestHandlerInterface $handler) use ($allowedOrigins, $responseFactory): ResponseInterface {
            $isPreflight = strtoupper($request->getMethod()) === 'OPTIONS'
                && $request->hasHeader('Access-Control-Request-Method');

            $response = $isPreflight
                ? $responseFactory->createResponse(204)
                : $handler->handle($request);

            $response = $response->withAddedHeader('Vary', 'Origin');

            $origin = $request->getHeaderLine('Origin');
            if ($origin === '' || !in_array($origin, $allowedOrigins, true)) {
                return $response;
            }

            $response = $response->withHeader('Access-Control-Allow-Origin', $origin);
            if ($isPreflight) {
                $response = $response
                    ->withHeader('Access-Control-Allow-Methods', self::CORS_ALLOWED_METHODS)
                    ->withHeader('Access-Control-Allow-Headers', self::CORS_ALLOWED_HEADERS)
                    ->withHeader('Access-Control-Max-Age', self::CORS_MAX_AGE);
            }

            return $response;
        };
    }

    /** @return list<string> */
    private static function allowedOrigins(Config $config): array
    {
        $origins = [];
        foreach (explode(',', (string) $config->get('CORS_ALLOWED_ORIGINS', '')) as $origin) {
            $origin = rtrim(trim($origin), '/');
            if ($origin !== '') {
                $origins[] = $origin;
            }
        }

        return array_values(array_unique($origins));
    }
}
