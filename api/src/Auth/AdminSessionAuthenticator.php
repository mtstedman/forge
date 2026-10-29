<?php

declare(strict_types=1);

namespace Forge\Api\Auth;

use Forge\Api\Repository\AdminSessionRepository;

/**
 * Resolves opaque local admin session bearer tokens (issued by POST /admin/login).
 * Only the sha256 hex digest of a token is ever looked up or stored.
 */
final class AdminSessionAuthenticator
{
    /** 32 random bytes encoded as base64url without padding. */
    private const TOKEN_PATTERN = '/^[A-Za-z0-9_-]{43}$/';

    public function __construct(private readonly AdminSessionRepository $sessions)
    {
    }

    /** @return array{sub: string, name: ?string, email: string, session_id: int}|null */
    public function authenticate(string $bearerToken): ?array
    {
        if (preg_match(self::TOKEN_PATTERN, $bearerToken) !== 1) {
            return null;
        }

        $session = $this->sessions->findActiveByTokenHash(
            hash('sha256', $bearerToken),
            gmdate('Y-m-d\\TH:i:s\\Z'),
        );
        if ($session === null) {
            return null;
        }

        $name = (string) $session['name'];

        return [
            'sub' => (string) $session['admin_user_id'],
            'name' => $name === '' ? null : $name,
            'email' => (string) $session['email'],
            'session_id' => (int) $session['session_id'],
        ];
    }
}
