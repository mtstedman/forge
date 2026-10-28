<?php

declare(strict_types=1);

namespace Forge\Api\Controller;

use Forge\Api\Config;
use Forge\Api\Repository\MediaRepository;
use finfo;
use PDO;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\UploadedFileInterface;
use RuntimeException;
use Throwable;

/**
 * Admin media library: JWT protection is applied by the /admin route group.
 *
 * Uploads are identified by their content (finfo + getimagesize), never by the
 * client-supplied name or MIME type, and are stored under UPLOAD_DIR with a
 * random hex name whose extension is derived from the detected type.
 */
final class AdminMediaController
{
    private const DEFAULT_UPLOAD_DIR = 'api/public/uploads';
    private const DEFAULT_MAX_BYTES = 5242880;
    private const COPY_CHUNK_BYTES = 65536;

    /** Detected MIME type => stored extension. SVG is deliberately excluded. */
    private const ALLOWED_TYPES = [
        'image/jpeg' => 'jpg',
        'image/png' => 'png',
        'image/webp' => 'webp',
        'image/gif' => 'gif',
    ];

    /** Detected MIME type => getimagesize() image type that must agree with it. */
    private const IMAGE_TYPES = [
        'image/jpeg' => IMAGETYPE_JPEG,
        'image/png' => IMAGETYPE_PNG,
        'image/webp' => IMAGETYPE_WEBP,
        'image/gif' => IMAGETYPE_GIF,
    ];

    /** Only names this controller generates are ever resolved to a path. */
    private const STORED_NAME_PATTERN = '/^[a-f0-9]{32}\.(?:jpg|png|webp|gif)$/';

    private readonly MediaRepository $media;
    private readonly string $uploadDir;
    private readonly int $maxBytes;
    private readonly string $baseUrl;

    public function __construct(PDO $pdo, Config $config)
    {
        $this->media = new MediaRepository($pdo);
        $this->uploadDir = self::resolveUploadDir((string) $config->get('UPLOAD_DIR', self::DEFAULT_UPLOAD_DIR));
        $maxBytes = $config->int('UPLOAD_MAX_BYTES', self::DEFAULT_MAX_BYTES);
        $this->maxBytes = $maxBytes > 0 ? $maxBytes : self::DEFAULT_MAX_BYTES;
        $this->baseUrl = rtrim((string) $config->get('MEDIA_BASE_URL', ''), '/');
    }

    public function index(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, [
            'data' => array_map(fn (array $row): array => $this->present($row), $this->media->list()),
        ]);
    }

    public function upload(ServerRequestInterface $request, ResponseInterface $response): ResponseInterface
    {
        $file = $request->getUploadedFiles()['file'] ?? null;
        if (!$file instanceof UploadedFileInterface) {
            return $this->validationError($response, ['file' => 'An image file is required.']);
        }

        $altText = $this->input($request)['alt_text'] ?? null;
        if ($altText !== null && !is_string($altText)) {
            return $this->validationError($response, ['alt_text' => 'Must be a string.']);
        }
        $altText = $altText === null ? null : trim($altText);
        if ($altText === '') {
            $altText = null;
        }

        $error = $file->getError();
        if ($error === UPLOAD_ERR_INI_SIZE || $error === UPLOAD_ERR_FORM_SIZE) {
            return $this->tooLarge($response);
        }
        if ($error !== UPLOAD_ERR_OK) {
            return $this->validationError($response, ['file' => 'The file could not be uploaded.']);
        }
        $reportedSize = $file->getSize();
        if ($reportedSize !== null && $reportedSize > $this->maxBytes) {
            return $this->tooLarge($response);
        }

        $staged = $this->stage($file);
        try {
            if ($staged === null) {
                return $this->tooLarge($response);
            }

            $size = filesize($staged);
            if ($size === false || $size > $this->maxBytes) {
                return $this->tooLarge($response);
            }

            $mimeType = (new finfo(FILEINFO_MIME_TYPE))->file($staged);
            if (!is_string($mimeType) || !isset(self::ALLOWED_TYPES[$mimeType])) {
                return $this->validationError($response, ['file' => 'Only JPEG, PNG, WebP and GIF images are allowed.']);
            }

            $info = @getimagesize($staged);
            if (!is_array($info)
                || ($info[2] ?? null) !== self::IMAGE_TYPES[$mimeType]
                || !is_int($info[0] ?? null) || $info[0] <= 0
                || !is_int($info[1] ?? null) || $info[1] <= 0) {
                return $this->validationError($response, ['file' => 'The file is not a valid image.']);
            }

            $filename = bin2hex(random_bytes(16)) . '.' . self::ALLOWED_TYPES[$mimeType];
            $target = $this->ensureUploadDir() . DIRECTORY_SEPARATOR . $filename;
            if (file_exists($target) || !@rename($staged, $target)) {
                throw new RuntimeException('Unable to store the uploaded media file.');
            }
            @chmod($target, 0644);

            try {
                $id = $this->media->create([
                    'filename' => $filename,
                    'original_name' => self::originalName($file->getClientFilename()),
                    'mime_type' => $mimeType,
                    'size_bytes' => $size,
                    'width' => $info[0],
                    'height' => $info[1],
                    'alt_text' => $altText,
                ]);
            } catch (Throwable $e) {
                @unlink($target);
                throw $e;
            }
        } finally {
            if ($staged !== null && is_file($staged)) {
                @unlink($staged);
            }
        }

        $row = $this->media->find($id);
        if ($row === null) {
            throw new RuntimeException('Stored media row could not be read back.');
        }

        return $this->json($response, ['data' => $this->present($row)], 201);
    }

    /** @param array<string, string> $args */
    public function delete(ServerRequestInterface $request, ResponseInterface $response, array $args): ResponseInterface
    {
        $id = (int) $args['id'];
        $row = $this->media->find($id);
        if ($row === null) {
            return $this->json($response, ['error' => 'Media not found.'], 404);
        }

        // posts.cover_media_id is ON DELETE SET NULL, so referencing posts lose their cover.
        $this->media->delete($id);
        $this->removeStoredFile((string) $row['filename']);

        return $response->withStatus(204);
    }

    /**
     * Copies the upload into a private temporary file, enforcing the byte limit
     * while reading. Returns null when the content exceeds UPLOAD_MAX_BYTES.
     */
    private function stage(UploadedFileInterface $file): ?string
    {
        $staged = tempnam(sys_get_temp_dir(), 'forge-upload-');
        if ($staged === false) {
            throw new RuntimeException('Unable to create a temporary upload file.');
        }

        $out = fopen($staged, 'wb');
        if ($out === false) {
            @unlink($staged);
            throw new RuntimeException('Unable to open the temporary upload file.');
        }

        $total = 0;
        try {
            $stream = $file->getStream();
            if ($stream->isSeekable()) {
                $stream->rewind();
            }
            while (!$stream->eof()) {
                $chunk = $stream->read(self::COPY_CHUNK_BYTES);
                if ($chunk === '') {
                    break;
                }
                $total += strlen($chunk);
                if ($total > $this->maxBytes) {
                    fclose($out);
                    $out = null;
                    @unlink($staged);

                    return null;
                }
                if (fwrite($out, $chunk) !== strlen($chunk)) {
                    throw new RuntimeException('Unable to write the temporary upload file.');
                }
            }
        } catch (Throwable $e) {
            if ($out !== null) {
                fclose($out);
                $out = null;
            }
            @unlink($staged);
            throw $e;
        } finally {
            if ($out !== null) {
                fclose($out);
            }
        }

        return $staged;
    }

    /** Deletes a stored file only if it is a generated name directly inside UPLOAD_DIR. */
    private function removeStoredFile(string $filename): void
    {
        if (preg_match(self::STORED_NAME_PATTERN, $filename) !== 1) {
            error_log('[forge-api] media delete skipped file removal: unexpected stored filename');

            return;
        }

        $dir = realpath($this->uploadDir);
        if ($dir === false) {
            return;
        }
        $candidate = $dir . DIRECTORY_SEPARATOR . $filename;
        if (is_link($candidate)) {
            error_log('[forge-api] media delete skipped file removal: stored file is a symlink');

            return;
        }
        $path = realpath($candidate);
        if ($path === false || !is_file($path) || dirname($path) !== $dir) {
            return;
        }

        if (!@unlink($path)) {
            error_log('[forge-api] media delete could not remove the stored file');
        }
    }

    private function ensureUploadDir(): string
    {
        if (!is_dir($this->uploadDir) && !@mkdir($this->uploadDir, 0775, true) && !is_dir($this->uploadDir)) {
            throw new RuntimeException('Unable to create the upload directory.');
        }
        $dir = realpath($this->uploadDir);
        if ($dir === false || !is_writable($dir)) {
            throw new RuntimeException('The upload directory is not writable.');
        }

        return $dir;
    }

    private static function resolveUploadDir(string $dir): string
    {
        $dir = rtrim($dir, '/\\');
        if ($dir === '') {
            $dir = self::DEFAULT_UPLOAD_DIR;
        }
        if (str_starts_with($dir, '/') || preg_match('/^[A-Za-z]:[\\\\\/]/', $dir) === 1) {
            return $dir;
        }

        return dirname(__DIR__, 3) . DIRECTORY_SEPARATOR . $dir;
    }

    /** The client name is kept as display metadata only; it never becomes a path. */
    private static function originalName(?string $clientName): string
    {
        $name = str_replace('\\', '/', (string) $clientName);
        $name = basename($name);
        $name = preg_replace('/[\x00-\x1F\x7F]/u', '', $name) ?? '';
        $name = trim($name);
        if (function_exists('mb_substr')) {
            $name = mb_substr($name, 0, 255);
        } else {
            $name = substr($name, 0, 255);
        }

        return $name;
    }

    /**
     * @param array<string, mixed> $row
     * @return array<string, mixed>
     */
    private function present(array $row): array
    {
        return [
            'id' => $row['id'],
            'url' => $this->baseUrl . '/uploads/' . rawurlencode((string) $row['filename']),
            'original_name' => $row['original_name'],
            'mime_type' => $row['mime_type'],
            'size_bytes' => $row['size_bytes'],
            'width' => $row['width'],
            'height' => $row['height'],
            'alt_text' => $row['alt_text'],
            'created_at' => $row['created_at'],
        ];
    }

    /** @return array<string, mixed> */
    private function input(ServerRequestInterface $request): array
    {
        $body = $request->getParsedBody();

        return is_array($body) ? $body : [];
    }

    private function tooLarge(ResponseInterface $response): ResponseInterface
    {
        return $this->json($response, [
            'error' => 'File too large.',
            'fields' => ['file' => sprintf('The file must not exceed %d bytes.', $this->maxBytes)],
        ], 413);
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
