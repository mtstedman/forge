<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\PostRepository;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class AdminCommentController
{
    private const STATUSES = ['pending', 'approved', 'rejected'];
    private const PER_PAGE = 20;

    private readonly CommentRepository $comments;
    private readonly PostRepository $posts;

    public function __construct(PDO $pdo)
    {
        $this->comments = new CommentRepository($pdo);
        $this->posts = new PostRepository($pdo);
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $status = $query['status'] ?? null;
        if ($status !== null && !in_array($status, self::STATUSES, true)) {
            return $this->validationError($response, ['status' => 'Must be pending, approved, or rejected.']);
        }

        $pageValue = $query['page'] ?? '1';
        $page = filter_var($pageValue, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($page === false) {
            return $this->validationError($response, ['page' => 'Must be a positive integer.']);
        }

        $comments = $this->comments->listByStatus($status, self::PER_PAGE, ($page - 1) * self::PER_PAGE);
        foreach ($comments as &$comment) {
            $post = $this->posts->find($comment['post_id']);
            $comment['post_slug'] = $post['slug'] ?? null;
            $comment['post_title'] = $post['title'] ?? null;
        }
        unset($comment);

        return $this->json($response, [
            'data' => $comments,
            'meta' => ['page' => $page, 'per_page' => self::PER_PAGE],
        ]);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) $args['id'];
        if ($this->comments->find($id) === null) {
            return $this->notFound($response);
        }

        $input = $request->getParsedBody();
        $status = is_array($input) ? ($input['status'] ?? null) : null;
        if (!is_string($status) || !in_array($status, self::STATUSES, true)) {
            return $this->validationError($response, ['status' => 'Must be pending, approved, or rejected.']);
        }

        $this->comments->setStatus($id, $status);

        return $this->json($response, ['data' => $this->enrich($this->comments->find($id))]);
    }

    /** @param array<string, string> $args */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) $args['id'];
        if ($this->comments->find($id) === null) {
            return $this->notFound($response);
        }

        $this->comments->delete($id);

        return $response->withStatus(204);
    }

    /** @param array<string, mixed>|null $comment @return array<string, mixed>|null */
    private function enrich(?array $comment): ?array
    {
        if ($comment === null) {
            return null;
        }
        $post = $this->posts->find($comment['post_id']);
        $comment['post_slug'] = $post['slug'] ?? null;
        $comment['post_title'] = $post['title'] ?? null;

        return $comment;
    }

    /** @param array<string, string> $fields */
    private function validationError(ResponseInterface $response, array $fields): ResponseInterface
    {
        return $this->json($response, ['error' => 'Validation failed.', 'fields' => $fields], 422);
    }

    private function notFound(ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, ['error' => 'Comment not found.'], 404);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
