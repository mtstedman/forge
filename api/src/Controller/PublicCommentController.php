<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Config;
use Forge\Api\Repository\CommentRepository;
use Forge\Api\Repository\PostRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

/**
 * Public comment endpoints.
 *
 * GET  /posts/{slug}/comments  approved comments only, oldest first.
 * POST /posts/{slug}/comments  accepted only when PUBLIC_COMMENTS_ENABLED is true
 *                              AND the post has comments_enabled = 1 (both off by default).
 *
 * Submitted comments are always stored as 'pending'. Email addresses and IP
 * hashes are never part of any response.
 */
final class PublicCommentController
{
    public const NAME_MAX = 80;
    public const EMAIL_MAX = 254;
    public const BODY_MIN = 2;
    public const BODY_MAX = 5000;
    public const USER_AGENT_MAX = 255;
    public const RATE_LIMIT_DEFAULT = 3;
    public const RATE_LIMIT_WINDOW_SECONDS = 600;

    private const CACHE_PUBLIC = 'public, max-age=60, stale-while-revalidate=300';

    public function __construct(
        private readonly PostRepository $posts,
        private readonly CommentRepository $comments,
        private readonly Config $config,
    ) {
    }

    /**
     * Public projection of a stored comment: never includes email, ip_hash,
     * user agent or moderation state.
     *
     * @param array<string, mixed> $comment
     * @return array{id: int, author_name: string, body: string, created_at: string}
     */
    public static function present(array $comment): array
    {
        return [
            'id' => (int) $comment['id'],
            'author_name' => (string) $comment['author_name'],
            'body' => (string) $comment['body'],
            'created_at' => (string) $comment['created_at'],
        ];
    }

    /** @param array<string, string> $args */
    public function list(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $post = $this->posts->findPublishedBySlug((string) ($args['slug'] ?? ''));
        if ($post === null) {
            return self::json($response, ['error' => 'Post not found.'], 404, 'no-store');
        }

        $comments = array_map(
            static fn (array $comment): array => self::present($comment),
            $this->comments->listApprovedForPost((int) $post['id']),
        );

        return self::json($response, ['data' => $comments], 200, self::CACHE_PUBLIC);
    }

    /** @param array<string, string> $args */
    public function create(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $appKey = (string) $this->config->get('APP_KEY', '');
        // Without APP_KEY the IP hash would be an unkeyed (reversible) digest, so
        // public commenting stays closed rather than storing weakly protected data.
        if (!$this->config->bool('PUBLIC_COMMENTS_ENABLED', false) || $appKey === '') {
            return self::json($response, ['error' => 'Comments are disabled.'], 403);
        }

        $post = $this->posts->findPublishedBySlug((string) ($args['slug'] ?? ''));
        if ($post === null) {
            return self::json($response, ['error' => 'Post not found.'], 404);
        }

        if ((int) $post['comments_enabled'] !== 1) {
            return self::json($response, ['error' => 'Comments are disabled for this post.'], 403);
        }

        $body = $request->getParsedBody();
        if (!is_array($body)) {
            $body = [];
        }

        // Honeypot: bots that fill the hidden field get the normal answer, but nothing is stored.
        $website = $body['website'] ?? null;
        if ($website !== null && !(is_string($website) && trim($website) === '')) {
            return self::json($response, ['status' => 'pending'], 202);
        }

        $fields = [];

        $name = self::cleanText($body['author_name'] ?? null, false);
        if ($name === null || $name === '' || mb_strlen($name, 'UTF-8') > self::NAME_MAX) {
            $fields['author_name'] = sprintf('Name is required and must be at most %d characters.', self::NAME_MAX);
        }

        $email = self::cleanText($body['author_email'] ?? null, false);
        if (
            $email === null
            || $email === ''
            || strlen($email) > self::EMAIL_MAX
            || filter_var($email, FILTER_VALIDATE_EMAIL) === false
        ) {
            $fields['author_email'] = sprintf('A valid email address of at most %d characters is required.', self::EMAIL_MAX);
        }

        $text = self::cleanText($body['body'] ?? null, true);
        $textLength = $text === null ? 0 : mb_strlen($text, 'UTF-8');
        if ($text === null || $textLength < self::BODY_MIN || $textLength > self::BODY_MAX) {
            $fields['body'] = sprintf('Comment must be between %d and %d characters.', self::BODY_MIN, self::BODY_MAX);
        }

        if ($fields !== []) {
            return self::json($response, ['error' => 'Validation failed.', 'fields' => $fields], 422);
        }

        $ipHash = hash_hmac('sha256', self::clientIp($request), $appKey);
        $limit = $this->config->int('COMMENT_RATE_LIMIT', self::RATE_LIMIT_DEFAULT);
        if ($limit < 1) {
            $limit = self::RATE_LIMIT_DEFAULT;
        }
        if ($this->comments->countRecentByIpHash($ipHash, self::RATE_LIMIT_WINDOW_SECONDS) >= $limit) {
            return self::json($response, ['error' => 'Too many comments. Please try again later.'], 429)
                ->withHeader('Retry-After', (string) self::RATE_LIMIT_WINDOW_SECONDS);
        }

        $userAgent = self::cleanText($request->getHeaderLine('User-Agent'), false);
        $userAgent = ($userAgent === null || $userAgent === '')
            ? null
            : mb_substr($userAgent, 0, self::USER_AGENT_MAX, 'UTF-8');

        $this->comments->create((int) $post['id'], [
            'author_name' => $name,
            'author_email' => $email,
            'body' => $text,
            'ip_hash' => $ipHash,
            'user_agent' => $userAgent,
        ]);

        return self::json($response, ['status' => 'pending'], 202);
    }

    /**
     * Strips control characters (C0, DEL, C1) and trims. Multiline text keeps
     * newlines and tabs, with CRLF/CR normalised to LF. Returns null for
     * non-string input or invalid UTF-8.
     */
    private static function cleanText(mixed $value, bool $multiline): ?string
    {
        if (!is_string($value) || !mb_check_encoding($value, 'UTF-8')) {
            return null;
        }

        if ($multiline) {
            $value = str_replace(["\r\n", "\r"], "\n", $value);
            $pattern = '/[\x{0000}-\x{0008}\x{000B}-\x{001F}\x{007F}-\x{009F}]/u';
        } else {
            $pattern = '/[\x{0000}-\x{001F}\x{007F}-\x{009F}]/u';
        }

        $clean = preg_replace($pattern, '', $value);

        return $clean === null ? null : trim($clean);
    }

    /**
     * The direct peer address only; forwarding headers are client-controlled
     * and are not trusted for rate limiting.
     */
    private static function clientIp(ServerRequestInterface $request): string
    {
        $ip = $request->getServerParams()['REMOTE_ADDR'] ?? null;

        return is_string($ip) && filter_var($ip, FILTER_VALIDATE_IP) !== false ? $ip : 'unknown';
    }

    /** @param array<mixed> $data */
    private static function json(ResponseInterface $response, array $data, int $status, string $cacheControl = 'no-store'): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('Cache-Control', $cacheControl)
            ->withStatus($status);
    }
}
