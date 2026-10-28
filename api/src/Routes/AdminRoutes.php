<?php

declare(strict_types=1);

namespace Forge\Api\Routes;

use Forge\Api\Config;
use Forge\Api\Controller\AdminCommentController;
use Forge\Api\Controller\AdminMediaController;
use Forge\Api\Controller\AdminPostController;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\Interfaces\RouteCollectorProxyInterface;

final class AdminRoutes
{
    public static function register(RouteCollectorProxyInterface $group, PDO $pdo, Config $config): void
    {
        $posts = new AdminPostController($pdo);
        $comments = new AdminCommentController($pdo);
        $media = new AdminMediaController($pdo, $config);

        $group->get('/me', static function (ServerRequestInterface $request, ResponseInterface $response): ResponseInterface {
            $claims = $request->getAttribute('jwt_claims', []);
            $data = [
                'sub' => is_array($claims) ? ($claims['sub'] ?? null) : null,
                'name' => is_array($claims) ? ($claims['name'] ?? null) : null,
                'email' => is_array($claims) ? ($claims['email'] ?? null) : null,
            ];
            $response->getBody()->write(json_encode(['data' => $data], JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

            return $response->withHeader('Content-Type', 'application/json');
        });

        $group->get('/posts', [$posts, 'index']);
        $group->post('/posts', [$posts, 'create']);
        $group->get('/posts/{id:[0-9]+}', [$posts, 'show']);
        $group->put('/posts/{id:[0-9]+}', [$posts, 'update']);
        $group->delete('/posts/{id:[0-9]+}', [$posts, 'delete']);
        $group->post('/posts/{id:[0-9]+}/publish', [$posts, 'publish']);
        $group->post('/posts/{id:[0-9]+}/unpublish', [$posts, 'unpublish']);

        $group->get('/comments', [$comments, 'index']);
        $group->patch('/comments/{id:[0-9]+}', [$comments, 'update']);
        $group->delete('/comments/{id:[0-9]+}', [$comments, 'delete']);

        $group->get('/media', [$media, 'index']);
        $group->post('/media', [$media, 'upload']);
        $group->delete('/media/{id:[0-9]+}', [$media, 'delete']);
    }
}
