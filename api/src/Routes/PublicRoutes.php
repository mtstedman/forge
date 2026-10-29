<?php

declare(strict_types=1);

namespace Forge\Api\Routes;

use Forge\Api\Captcha\TurnstileVerifier;
use Forge\Api\Config;
use Forge\Api\Controller\MainPageContentController;
use Forge\Api\Controller\PublicCommentController;
use Forge\Api\Controller\PublicConsultationRequestController;
use Forge\Api\Controller\PublicPostController;
use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\ConsultationRequestRepository;
use Forge\Api\Repository\MainPageContentRepository;
use Forge\Api\Repository\MediaRepository;
use Forge\Api\Repository\PostRepository;
use PDO;
use Slim\Interfaces\RouteCollectorProxyInterface;

/**
 * Public (unauthenticated) API routes, mounted at the API root.
 *
 * GET  /posts                   published post summaries, newest first
 * GET  /posts/{slug}            published post with approved comments
 * GET  /posts/{slug}/comments   approved comments, oldest first
 * POST /posts/{slug}/comments   protected submission, off by default
 * GET  /main-page-content       editable main-page copy document (cacheable)
 */
final class PublicRoutes
{
    public static function register(
        RouteCollectorProxyInterface $routes,
        PDO $pdo,
        Config $config,
        ?callable $captchaVerifier = null,
    ): void {
        $postRepository = new PostRepository($pdo);
        $commentRepository = new CommentRepository($pdo);

        $posts = new PublicPostController($postRepository, $commentRepository, new MediaRepository($pdo), $config);
        $comments = new PublicCommentController($postRepository, $commentRepository, $config);
        $consultations = new PublicConsultationRequestController(
            new ConsultationRequestRepository($pdo),
            $captchaVerifier ?? new TurnstileVerifier($config),
        );

        $mainPageContent = new MainPageContentController(new MainPageContentRepository($pdo));

        $routes->get('/main-page-content', [$mainPageContent, 'show']);
        $routes->post('/consultation-requests', [$consultations, 'create']);
        $routes->get('/posts', [$posts, 'index']);
        $routes->get('/posts/{slug}', [$posts, 'show']);
        $routes->get('/posts/{slug}/comments', [$comments, 'list']);
        $routes->post('/posts/{slug}/comments', [$comments, 'create']);
    }
}
