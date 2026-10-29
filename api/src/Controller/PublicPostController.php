<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Config;
use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\MediaRepository;
use Forge\Api\Repository\PostRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Public read-only post endpoints. Only published posts are ever returned;
 * drafts are indistinguishable from missing posts (404).
 *
 * GET /posts?page=1&per_page=10&tags[]=<tag>
 * GET /posts/{slug}
 */
final class PublicPostController
{
    public const DEFAULT_PER_PAGE = 10;
    public const MAX_PER_PAGE = 50;
    private const MAX_PAGE = 100000;
    private const DEFAULT_MEDIA_BASE_URL = '/uploads';
    private const CACHE_PUBLIC = 'public, max-age=60, stale-while-revalidate=300';

    /** @var array<int, array{url: string, alt: string}|null> */
    private array $coverCache = [];

    public function __construct(
        private readonly PostRepository $posts,
        private readonly CommentRepository $comments,
        private readonly MediaRepository $media,
        private readonly Config $config,
    ) {
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $this->coverCache = [];
        $query = $request->getQueryParams();
        $page = self::positiveInt($query['page'] ?? null, 1, self::MAX_PAGE);
        $perPage = self::positiveInt($query['per_page'] ?? null, self::DEFAULT_PER_PAGE, self::MAX_PER_PAGE);

        $tags = self::tags($query['tags'] ?? null);

        $posts = $this->posts->listPublished($perPage, ($page - 1) * $perPage, $tags);

        return self::json($response, [
            'data' => array_map(fn (array $post): array => $this->summary($post), $posts),
            'meta' => [
                'page' => $page,
                'per_page' => $perPage,
                'total' => $this->posts->countPublished($tags),
                'available_tags' => $this->posts->publishedTags(),
            ],
        ], 200, self::CACHE_PUBLIC);
    }

    /** @param array<string, string> $args */
    public function show(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $this->coverCache = [];
        $post = $this->posts->findPublishedBySlug((string) ($args['slug'] ?? ''));
        if ($post === null) {
            return self::json($response, ['error' => 'Post not found.'], 404, 'no-store');
        }

        $comments = array_map(
            static fn (array $comment): array => PublicCommentController::present($comment),
            $this->comments->listApprovedForPost((int) $post['id']),
        );

        $data = $this->summary($post) + [
            'body_html' => (string) $post['body_html'],
            'faq' => self::faq($post['faq'] ?? []),
            'meta_title' => $post['meta_title'] === null ? null : (string) $post['meta_title'],
            'meta_description' => $post['meta_description'] === null ? null : (string) $post['meta_description'],
            // Effective state: whether a POST to this post's comments would be accepted.
            'comments_enabled' => $this->config->bool('PUBLIC_COMMENTS_ENABLED', false)
                && (int) $post['comments_enabled'] === 1,
            'comments' => $comments,
        ];

        return self::json($response, ['data' => $data], 200, self::CACHE_PUBLIC);
    }

    /**
     * @param array<string, mixed> $post
     * @return array<string, mixed>
     */
    private function summary(array $post): array
    {
        return [
            'id' => (int) $post['id'],
            'slug' => (string) $post['slug'],
            'title' => (string) $post['title'],
            'excerpt' => (string) $post['excerpt'],
            'category' => (string) $post['category'],
            'tags' => array_values(array_filter($post['tags'] ?? [], 'is_string')),
            'cover' => $this->cover($post['cover_media_id'] ?? null),
            'author_name' => (string) $post['author_name'],
            'published_at' => $post['published_at'] === null ? null : (string) $post['published_at'],
            'updated_at' => (string) $post['updated_at'],
        ];
    }

    /** @return array{url: string, alt: string}|null */
    private function cover(mixed $mediaId): ?array
    {
        if (!is_int($mediaId)) {
            return null;
        }

        if (!array_key_exists($mediaId, $this->coverCache)) {
            $media = $this->media->find($mediaId);
            $this->coverCache[$mediaId] = $media === null ? null : [
                'url' => rtrim((string) $this->config->get('MEDIA_BASE_URL', self::DEFAULT_MEDIA_BASE_URL), '/')
                    . '/' . rawurlencode((string) $media['filename']),
                'alt' => (string) ($media['alt_text'] ?? ''),
            ];
        }

        return $this->coverCache[$mediaId];
    }

    /**
     * @param mixed $faq
     * @return list<array{question: string, answer: string}>
     */
    private static function faq(mixed $faq): array
    {
        if (!is_array($faq)) {
            return [];
        }

        $items = [];
        foreach ($faq as $item) {
            if (
                is_array($item)
                && isset($item['question'], $item['answer'])
                && is_scalar($item['question'])
                && is_scalar($item['answer'])
            ) {
                $items[] = [
                    'question' => (string) $item['question'],
                    'answer' => (string) $item['answer'],
                ];
            }
        }

        return $items;
    }

    /**
     * Selected tag filters: a scalar string or flat array of strings, trimmed, with
     * blank and non-string entries dropped and exact duplicates removed.
     *
     * @return list<string>
     */
    private static function tags(mixed $value): array
    {
        if (is_string($value)) {
            $value = [$value];
        }
        if (!is_array($value)) {
            return [];
        }

        $tags = [];
        foreach ($value as $entry) {
            if (!is_string($entry)) {
                continue;
            }
            $tag = trim($entry);
            if ($tag !== '' && !in_array($tag, $tags, true)) {
                $tags[] = $tag;
            }
        }

        return $tags;
    }

    private static function positiveInt(mixed $value, int $default, int $max): int
    {
        if (!is_string($value)) {
            return $default;
        }

        $parsed = filter_var(trim($value), FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);

        return $parsed === false ? $default : min($parsed, $max);
    }

    /** @param array<mixed> $data */
    private static function json(ResponseInterface $response, array $data, int $status, string $cacheControl): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Cache-Control', $cacheControl)
            ->withStatus($status);
    }
}
