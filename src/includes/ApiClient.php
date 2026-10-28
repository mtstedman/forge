<?php

declare(strict_types=1);

namespace Forge\Site;

use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\BadResponseException;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Promise\PromiseInterface;
use Psr\Http\Message\ResponseInterface;
use Throwable;

final class ApiClient
{
    private string $baseUrl;
    private ClientInterface $http;

    public function __construct(string $baseUrl, ?ClientInterface $http = null)
    {
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->http = $http ?? new Client([
            'connect_timeout' => 2.0,
            'timeout' => 4.0,
        ]);
    }

    public function getPostsAsync(int $page, int $perPage): PromiseInterface
    {
        return $this->requestAsync('/posts', [
            'query' => [
                'page' => $page,
                'per_page' => $perPage,
            ],
        ]);
    }

    public function getPostAsync(string $slug): PromiseInterface
    {
        return $this->requestAsync('/posts/' . rawurlencode($slug));
    }

    /**
     * @param array<string, mixed> $options
     */
    private function requestAsync(string $path, array $options = []): PromiseInterface
    {
        return $this->http->requestAsync('GET', $this->baseUrl . $path, $options)->then(
            static function (ResponseInterface $response): ?array {
                $status = $response->getStatusCode();

                if ($status === 404) {
                    return null;
                }

                if ($status >= 400) {
                    throw new \RuntimeException('API request failed with HTTP status ' . $status);
                }

                /** @var array<string, mixed> $decoded */
                $decoded = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);

                return $decoded;
            },
            static function (mixed $reason): mixed {
                if ($reason instanceof BadResponseException && $reason->getResponse()?->getStatusCode() === 404) {
                    return null;
                }

                return Create::rejectionFor($reason);
            }
        );
    }
}
