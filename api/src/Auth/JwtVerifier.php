<?php

declare(strict_types=1);

namespace Forge\Api\Auth;

use Firebase\JWT\JWK;
use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Forge\Api\Config;
use GuzzleHttp\Client;
use JsonException;
use RuntimeException;
use stdClass;
use UnexpectedValueException;

final class JwtVerifier
{
    private const ALLOWED_ALGORITHMS = ['RS256', 'ES256'];
    private const LEEWAY_SECONDS = 30;
    private const JWKS_CACHE_TTL_SECONDS = 300;

    /** @var callable(): array<string, Key>|null */
    private $keyProvider;

    public function __construct(
        private readonly Config $config,
        ?callable $keyProvider = null,
    ) {
        $this->keyProvider = $keyProvider;
    }

    /**
     * @return array<string, mixed>
     */
    public function verify(string $jwt): array
    {
        $issuer = $this->requiredConfig('OAUTH_ISSUER');
        $audience = $this->requiredConfig('OAUTH_AUDIENCE');
        $this->requiredConfig('OAUTH_JWKS_URL');

        $algorithm = $this->algorithm($jwt);
        if (!in_array($algorithm, self::ALLOWED_ALGORITHMS, true)) {
            throw new UnexpectedValueException('JWT algorithm is not allowed.');
        }

        $keys = $this->keys();
        $previousLeeway = JWT::$leeway;
        JWT::$leeway = self::LEEWAY_SECONDS;
        try {
            $decoded = JWT::decode($jwt, $keys);
        } finally {
            JWT::$leeway = $previousLeeway;
        }

        $claims = self::normalizeObject($decoded);
        if (($claims['iss'] ?? null) !== $issuer) {
            throw new UnexpectedValueException('JWT issuer is invalid.');
        }
        if (!$this->audienceMatches($claims['aud'] ?? null, $audience)) {
            throw new UnexpectedValueException('JWT audience is invalid.');
        }

        $requiredScope = trim((string) $this->config->get('OAUTH_REQUIRED_SCOPE', ''));
        if ($requiredScope !== '' && !in_array($requiredScope, $this->scopes($claims), true)) {
            throw new UnexpectedValueException('JWT scope is insufficient.');
        }

        return $claims;
    }

    private function requiredConfig(string $name): string
    {
        $value = $this->config->get($name);
        if ($value === null || trim($value) === '') {
            throw new RuntimeException('OAuth configuration is incomplete.');
        }

        return trim($value);
    }

    private function algorithm(string $jwt): string
    {
        $segments = explode('.', $jwt);
        if (count($segments) !== 3) {
            throw new UnexpectedValueException('JWT is malformed.');
        }

        $encoded = strtr($segments[0], '-_', '+/');
        $padding = strlen($encoded) % 4;
        if ($padding !== 0) {
            $encoded .= str_repeat('=', 4 - $padding);
        }
        $json = base64_decode($encoded, true);
        if ($json === false) {
            throw new UnexpectedValueException('JWT header is malformed.');
        }

        try {
            $header = json_decode($json, true, 32, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new UnexpectedValueException('JWT header is malformed.', 0, $exception);
        }
        if (!is_array($header) || !is_string($header['alg'] ?? null)) {
            throw new UnexpectedValueException('JWT algorithm is missing.');
        }

        return $header['alg'];
    }

    /** @return array<string, Key> */
    private function keys(): array
    {
        $keys = $this->keyProvider !== null
            ? ($this->keyProvider)()
            : JWK::parseKeySet($this->jwks());

        if (!is_array($keys)) {
            throw new UnexpectedValueException('JWT key provider returned invalid keys.');
        }

        $allowed = [];
        foreach ($keys as $kid => $key) {
            if ($key instanceof Key && in_array($key->getAlgorithm(), self::ALLOWED_ALGORITHMS, true)) {
                $allowed[(string) $kid] = $key;
            }
        }
        if ($allowed === []) {
            throw new UnexpectedValueException('No allowed JWT verification keys are available.');
        }

        return $allowed;
    }

    /** @return array<string, mixed> */
    private function jwks(): array
    {
        $url = $this->requiredConfig('OAUTH_JWKS_URL');
        $cacheDirectory = dirname(__DIR__, 2) . '/var';
        $cachePath = $cacheDirectory . '/jwks-' . hash('sha256', $url) . '.json';

        $cached = $this->readFreshCache($cachePath);
        if ($cached !== null) {
            return $cached;
        }

        $response = (new Client([
            'connect_timeout' => 3.0,
            'timeout' => 5.0,
            'http_errors' => true,
        ]))->get($url, ['headers' => ['Accept' => 'application/json']]);
        $json = (string) $response->getBody();
        $jwks = self::decodeJwks($json);

        if ((!is_dir($cacheDirectory) && !@mkdir($cacheDirectory, 0775, true) && !is_dir($cacheDirectory))
            || @file_put_contents($cachePath, $json, LOCK_EX) === false) {
            // A cache write failure must not turn a successfully verified fetch into an auth outage.
        }

        return $jwks;
    }

    /** @return array<string, mixed>|null */
    private function readFreshCache(string $cachePath): ?array
    {
        $modified = @filemtime($cachePath);
        if ($modified === false || $modified < time() - self::JWKS_CACHE_TTL_SECONDS) {
            return null;
        }

        $json = @file_get_contents($cachePath);
        if ($json === false) {
            return null;
        }

        try {
            return self::decodeJwks($json);
        } catch (UnexpectedValueException) {
            return null;
        }
    }

    /** @return array<string, mixed> */
    private static function decodeJwks(string $json): array
    {
        try {
            $jwks = json_decode($json, true, 64, JSON_THROW_ON_ERROR);
        } catch (JsonException $exception) {
            throw new UnexpectedValueException('JWKS response is invalid.', 0, $exception);
        }
        if (!is_array($jwks) || !isset($jwks['keys']) || !is_array($jwks['keys'])) {
            throw new UnexpectedValueException('JWKS response is invalid.');
        }

        return $jwks;
    }

    private function audienceMatches(mixed $claim, string $audience): bool
    {
        if (is_string($claim)) {
            return $claim === $audience;
        }
        if (!is_array($claim)) {
            return false;
        }

        return in_array($audience, $claim, true);
    }

    /** @param array<string, mixed> $claims @return list<string> */
    private function scopes(array $claims): array
    {
        $scopes = [];
        foreach (['scope', 'scp'] as $claimName) {
            $value = $claims[$claimName] ?? null;
            if (is_string($value)) {
                foreach (preg_split('/\s+/', trim($value)) ?: [] as $scope) {
                    if ($scope !== '') {
                        $scopes[] = $scope;
                    }
                }
            } elseif (is_array($value)) {
                foreach ($value as $scope) {
                    if (is_string($scope) && $scope !== '') {
                        $scopes[] = $scope;
                    }
                }
            }
        }

        return array_values(array_unique($scopes));
    }

    /** @return array<string, mixed> */
    private static function normalizeObject(stdClass $object): array
    {
        $normalize = static function (mixed $value) use (&$normalize): mixed {
            if ($value instanceof stdClass) {
                $value = get_object_vars($value);
            }
            if (is_array($value)) {
                return array_map($normalize, $value);
            }

            return $value;
        };

        /** @var array<string, mixed> $claims */
        $claims = $normalize(get_object_vars($object));

        return $claims;
    }
}
