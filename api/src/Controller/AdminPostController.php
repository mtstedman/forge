<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Repository\PostRepository;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class AdminPostController
{
    private const SLUG_PATTERN = '/^[a-z0-9]+(?:-[a-z0-9]+)*$/';
    private const STRING_FIELDS = [
        'slug', 'title', 'excerpt', 'body_markdown', 'category',
        'meta_title', 'meta_description', 'author_name',
    ];

    private readonly PostRepository $posts;

    public function __construct(PDO $pdo)
    {
        $this->posts = new PostRepository($pdo);
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $status = $request->getQueryParams()['status'] ?? null;
        if ($status !== null && !in_array($status, ['draft', 'published'], true)) {
            return $this->validationError($response, ['status' => 'Must be draft or published.']);
        }

        return $this->json($response, ['data' => $this->posts->listAll($status)]);
    }

    public function create(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = $this->input($request);
        $fields = $this->validate($input, null, true);
        if ($fields !== []) {
            return $this->validationError($response, $fields);
        }

        $data = $this->writableData($input);
        $data['status'] = 'draft';
        $data['published_at'] = null;
        $data['comments_enabled'] = $data['comments_enabled'] ?? 0;
        $id = $this->posts->create($data);

        return $this->json($response, ['data' => $this->posts->find($id)], 201);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $post = $this->posts->find((int) $args['id']);
        if ($post === null) {
            return $this->notFound($response);
        }

        return $this->json($response, ['data' => $post]);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) $args['id'];
        if ($this->posts->find($id) === null) {
            return $this->notFound($response);
        }

        $input = $this->input($request);
        $fields = $this->validate($input, $id, false);
        if ($fields !== []) {
            return $this->validationError($response, $fields);
        }

        $this->posts->update($id, $this->writableData($input));

        return $this->json($response, ['data' => $this->posts->find($id)]);
    }

    /** @param array<string, string> $args */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) $args['id'];
        if ($this->posts->find($id) === null) {
            return $this->notFound($response);
        }

        $this->posts->delete($id);

        return $response->withStatus(204);
    }

    /** @param array<string, string> $args */
    public function publish(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return $this->changePublicationStatus($response, (int) $args['id'], true);
    }

    /** @param array<string, string> $args */
    public function unpublish(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        return $this->changePublicationStatus($response, (int) $args['id'], false);
    }

    private function changePublicationStatus(ResponseInterface $response, int $id, bool $publish): ResponseInterface
    {
        if ($this->posts->find($id) === null) {
            return $this->notFound($response);
        }

        if ($publish) {
            $this->posts->publish($id);
        } else {
            $this->posts->unpublish($id);
        }

        return $this->json($response, ['data' => $this->posts->find($id)]);
    }

    /** @return array<string, mixed> */
    private function input(ServerRequestInterface $request): array
    {
        $body = $request->getParsedBody();

        return is_array($body) ? $body : [];
    }

    /** @param array<string, mixed> $input @return array<string, string> */
    private function validate(array $input, ?int $currentId, bool $creating): array
    {
        $fields = [];
        if ($creating || array_key_exists('slug', $input)) {
            $slug = $input['slug'] ?? null;
            if (!is_string($slug) || preg_match(self::SLUG_PATTERN, $slug) !== 1) {
                $fields['slug'] = 'Use lowercase letters, numbers, and single hyphens only.';
            } elseif ($this->slugExists($slug, $currentId)) {
                $fields['slug'] = 'This slug is already in use.';
            }
        }
        if ($creating || array_key_exists('title', $input)) {
            if (!is_string($input['title'] ?? null) || trim((string) $input['title']) === '') {
                $fields['title'] = 'Title is required.';
            }
        }

        foreach (self::STRING_FIELDS as $field) {
            if (!array_key_exists($field, $input) || isset($fields[$field])) {
                continue;
            }
            if ($input[$field] !== null && !is_string($input[$field])) {
                $fields[$field] = 'Must be a string.';
            }
        }
        foreach (['tags', 'faq'] as $field) {
            if (array_key_exists($field, $input) && !is_array($input[$field])) {
                $fields[$field] = 'Must be an array.';
            }
        }
        if (array_key_exists('comments_enabled', $input) && $this->booleanValue($input['comments_enabled']) === null) {
            $fields['comments_enabled'] = 'Must be a boolean.';
        }
        if (array_key_exists('cover_media_id', $input)
            && $input['cover_media_id'] !== null
            && filter_var($input['cover_media_id'], FILTER_VALIDATE_INT) === false) {
            $fields['cover_media_id'] = 'Must be an integer or null.';
        }

        return $fields;
    }

    private function slugExists(string $slug, ?int $currentId): bool
    {
        foreach ($this->posts->listAll() as $post) {
            if ($post['slug'] === $slug && $post['id'] !== $currentId) {
                return true;
            }
        }

        return false;
    }

    /** @param array<string, mixed> $input @return array<string, mixed> */
    private function writableData(array $input): array
    {
        $data = [];
        foreach (self::STRING_FIELDS as $field) {
            if (array_key_exists($field, $input)) {
                $data[$field] = $input[$field];
            }
        }
        foreach (['tags', 'faq', 'cover_media_id'] as $field) {
            if (array_key_exists($field, $input)) {
                $data[$field] = $input[$field];
            }
        }
        if (array_key_exists('comments_enabled', $input)) {
            $data['comments_enabled'] = $this->booleanValue($input['comments_enabled']) ? 1 : 0;
        }

        return $data;
    }

    private function booleanValue(mixed $value): ?bool
    {
        if (is_bool($value)) {
            return $value;
        }
        if ($value === 0 || $value === 1 || $value === '0' || $value === '1') {
            return (bool) $value;
        }

        return null;
    }

    /** @param array<string, string> $fields */
    private function validationError(ResponseInterface $response, array $fields): ResponseInterface
    {
        return $this->json($response, ['error' => 'Validation failed.', 'fields' => $fields], 422);
    }

    private function notFound(ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, ['error' => 'Post not found.'], 404);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
