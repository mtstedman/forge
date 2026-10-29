<?php

declare(strict_types=1);

namespace Forge\Api\Auth;

use Psr\Http\Message\ResponseFactoryInterface;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\MiddlewareInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Throwable;

final class JwtAuthMiddleware implements MiddlewareInterface
{
    public function __construct(
        private readonly JwtVerifier $verifier,
        private readonly ResponseFactoryInterface $responseFactory,
        private readonly ?AdminSessionAuthenticator $sessions = null,
    ) {
    }

    public function process(ServerRequestInterface $request, RequestHandlerInterface $handler): ResponseInterface
    {
        $authorization = $request->getHeaderLine('Authorization');
        if (preg_match('/^Bearer\s+(\S+)$/i', trim($authorization), $matches) !== 1) {
            return $this->unauthorized();
        }

        if ($this->sessions !== null) {
            $session = $this->sessions->authenticate($matches[1]);
            if ($session !== null) {
                return $handler->handle(
                    $request
                        ->withAttribute('jwt_claims', $session)
                        ->withAttribute('admin_session_id', $session['session_id'])
                );
            }
        }

        try {
            $claims = $this->verifier->verify($matches[1]);
        } catch (Throwable) {
            return $this->unauthorized();
        }

        return $handler->handle($request->withAttribute('jwt_claims', $claims));
    }

    private function unauthorized(): ResponseInterface
    {
        $response = $this->responseFactory->createResponse(401);
        $response->getBody()->write('{"error":"Unauthorized"}');

        return $response
            ->withHeader('Content-Type', 'application/json')
            ->withHeader('WWW-Authenticate', 'Bearer realm="admin"');
    }
}
