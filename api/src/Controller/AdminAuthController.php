<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Repository\AdminSessionRepository;
use Forge\Api\Repository\AdminUserRepository;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class AdminAuthController
{
    private const SESSION_TTL_SECONDS = 12 * 3600;
    private const INVALID_CREDENTIALS = 'Invalid email or password.';

    /** Runtime-generated hash used to equalise work when the email is unknown. */
    private static ?string $dummyHash = null;

    public function __construct(
        private readonly AdminUserRepository $users,
        private readonly AdminSessionRepository $sessions,
    ) {
    }

    public function login(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $input = $request->getParsedBody();
        $input = is_array($input) ? $input : [];
        $email = $input['email'] ?? null;
        $password = $input['password'] ?? null;

        $fields = [];
        if (!is_string($email) || trim($email) === '') {
            $fields['email'] = 'Email is required.';
        }
        if (!is_string($password) || trim($password) === '') {
            $fields['password'] = 'Password is required.';
        }
        if ($fields !== [] || !is_string($email) || !is_string($password)) {
            return $this->json($response, ['error' => 'Validation failed.', 'fields' => $fields], 422);
        }

        $user = $this->users->findByEmail(strtolower(trim($email)));
        // Always run password_verify so unknown emails cost the same as wrong passwords.
        $hash = $user !== null ? (string) $user['password_hash'] : self::dummyHash();
        $valid = password_verify($password, $hash);
        if ($user === null || !$valid) {
            return $this->json($response, ['error' => self::INVALID_CREDENTIALS], 401);
        }

        $now = time();
        $this->sessions->purgeExpired(self::timestamp($now));

        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        $expiresAt = self::timestamp($now + self::SESSION_TTL_SECONDS);
        $this->sessions->create((int) $user['id'], hash('sha256', $token), $expiresAt);

        $name = (string) $user['name'];

        return $this->json($response, [
            'data' => [
                'access_token' => $token,
                'token_type' => 'Bearer',
                'expires_at' => $expiresAt,
                'user' => [
                    'sub' => (string) $user['id'],
                    'name' => $name === '' ? null : $name,
                    'email' => (string) $user['email'],
                ],
            ],
        ]);
    }

    public function logout(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $sessionId = $request->getAttribute('admin_session_id');
        if (is_int($sessionId)) {
            $this->sessions->delete($sessionId);
        }

        return $response->withStatus(204);
    }

    private static function dummyHash(): string
    {
        return self::$dummyHash ??= password_hash(bin2hex(random_bytes(16)), PASSWORD_DEFAULT);
    }

    private static function timestamp(int $time): string
    {
        return gmdate('Y-m-d\\TH:i:s\\Z', $time);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
