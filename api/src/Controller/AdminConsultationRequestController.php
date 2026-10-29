<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Repository\ConsultationRequestRepository;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;

final class AdminConsultationRequestController
{
    private const STATUSES = ['pending', 'completed', 'ignored'];
    private const TERMINAL_STATUSES = ['completed', 'ignored'];
    private const PER_PAGE = 20;

    private readonly ConsultationRequestRepository $consultations;

    public function __construct(PDO $pdo)
    {
        $this->consultations = new ConsultationRequestRepository($pdo);
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $query = $request->getQueryParams();
        $status = $query['status'] ?? 'pending';
        if (!is_string($status) || !in_array($status, self::STATUSES, true)) {
            return $this->validationError($response, ['status' => 'Must be pending, completed, or ignored.']);
        }

        $pageValue = $query['page'] ?? '1';
        $page = filter_var($pageValue, FILTER_VALIDATE_INT, ['options' => ['min_range' => 1]]);
        if ($page === false) {
            return $this->validationError($response, ['page' => 'Must be a positive integer.']);
        }

        return $this->json($response, [
            'data' => $this->consultations->listByStatus($status, self::PER_PAGE, ($page - 1) * self::PER_PAGE),
            'meta' => ['page' => $page, 'per_page' => self::PER_PAGE],
        ]);
    }

    /** @param array<string, string> $args */
    public function update(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) ($args['id'] ?? 0);
        if ($this->consultations->find($id) === null) {
            return $this->json($response, ['error' => 'Consultation request not found.'], 404);
        }

        $input = $request->getParsedBody();
        $status = is_array($input) ? ($input['status'] ?? null) : null;
        if (!is_string($status) || !in_array($status, self::TERMINAL_STATUSES, true)) {
            return $this->validationError($response, ['status' => 'Must be completed or ignored.']);
        }

        $this->consultations->setStatus($id, $status);

        return $this->json($response, ['data' => $this->consultations->find($id)]);
    }

    /** @param array<string, string> $fields */
    private function validationError(ResponseInterface $response, array $fields): ResponseInterface
    {
        return $this->json($response, ['error' => 'Validation failed.', 'fields' => $fields], 422);
    }

    /** @param array<string, mixed> $data */
    private function json(ResponseInterface $response, array $data, int $status = 200): ResponseInterface
    {
        $response->getBody()->write(json_encode($data, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE));

        return $response->withHeader('Content-Type', 'application/json')->withStatus($status);
    }
}
