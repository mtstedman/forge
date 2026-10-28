<?php

declare(strict_types=1);

namespace Forge\Api\Tests;

use Firebase\JWT\JWT;
use Firebase\JWT\Key;
use Forge\Api\AppFactory;
use Forge\Api\Config;
use Forge\Api\Database;
use Forge\Api\Migrator;
use Forge\Api\Repository\MediaRepository;
use Forge\Api\Repository\PostRepository;
use OpenSSLAsymmetricKey;
use PDO;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Slim\App;
use Slim\Psr7\Factory\ServerRequestFactory;
use Slim\Psr7\UploadedFile;

final class AdminMediaTest extends TestCase
{
    /** 1x1 transparent PNG. */
    private const PNG_BASE64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
    private const MAX_BYTES = 2048;

    private PDO $pdo;
    private App $app;
    private OpenSSLAsymmetricKey $privateKey;
    private string $sandbox;
    private string $uploadDir;
    private string $sourceDir;

    protected function setUp(): void
    {
        $this->sandbox = sys_get_temp_dir() . DIRECTORY_SEPARATOR . 'forge-media-test-' . bin2hex(random_bytes(6));
        $this->uploadDir = $this->sandbox . DIRECTORY_SEPARATOR . 'uploads';
        $this->sourceDir = $this->sandbox . DIRECTORY_SEPARATOR . 'client';
        self::assertTrue(mkdir($this->uploadDir, 0775, true));
        self::assertTrue(mkdir($this->sourceDir, 0775, true));

        $this->pdo = Database::create('sqlite::memory:');
        Migrator::migrate($this->pdo);

        $key = openssl_pkey_new(['private_key_bits' => 2048, 'private_key_type' => OPENSSL_KEYTYPE_RSA]);
        self::assertInstanceOf(OpenSSLAsymmetricKey::class, $key);
        $details = openssl_pkey_get_details($key);
        self::assertIsArray($details);
        self::assertIsString($details['key']);
        $this->privateKey = $key;

        $this->app = AppFactory::create($this->pdo, Config::fromArray([
            'OAUTH_ISSUER' => 'https://issuer.example',
            'OAUTH_AUDIENCE' => 'forge-admin',
            'OAUTH_JWKS_URL' => 'https://issuer.example/.well-known/jwks.json',
            'OAUTH_REQUIRED_SCOPE' => 'admin',
            'UPLOAD_DIR' => $this->uploadDir,
            'UPLOAD_MAX_BYTES' => (string) self::MAX_BYTES,
            'MEDIA_BASE_URL' => 'https://media.example',
        ]), [
            'jwt_key_provider' => fn (): array => ['test-key' => new Key($details['key'], 'RS256')],
        ]);
    }

    protected function tearDown(): void
    {
        self::removeTree($this->sandbox);
    }

    public function testValidPngUploadIsStoredWithRandomNameAndContractShape(): void
    {
        $response = $this->upload($this->clientFile('../../photo.png', self::png()), 'A single pixel');

        self::assertSame(201, $response->getStatusCode());
        $data = $this->decode($response)['data'];
        self::assertSame(
            ['id', 'url', 'original_name', 'mime_type', 'size_bytes', 'width', 'height', 'alt_text', 'created_at'],
            array_keys($data),
        );
        self::assertIsInt($data['id']);
        self::assertSame('photo.png', $data['original_name']);
        self::assertSame('image/png', $data['mime_type']);
        self::assertSame(strlen(self::png()), $data['size_bytes']);
        self::assertSame(1, $data['width']);
        self::assertSame(1, $data['height']);
        self::assertSame('A single pixel', $data['alt_text']);
        self::assertIsString($data['created_at']);

        self::assertMatchesRegularExpression('#^https://media\.example/uploads/[a-f0-9]{32}\.png$#', $data['url']);
        $stored = $this->storedFiles();
        self::assertCount(1, $stored);
        self::assertSame(basename($data['url']), $stored[0]);
        self::assertNotSame('photo.png', $stored[0]);
        self::assertSame(self::png(), file_get_contents($this->uploadDir . DIRECTORY_SEPARATOR . $stored[0]));
        self::assertFileDoesNotExist($this->sandbox . DIRECTORY_SEPARATOR . 'photo.png');

        $row = (new MediaRepository($this->pdo))->find($data['id']);
        self::assertNotNull($row);
        self::assertSame($stored[0], $row['filename']);
    }

    public function testUploadWithoutJwtIsRejected(): void
    {
        $request = $this->uploadRequest($this->clientFile('photo.png', self::png()), null, false);
        $response = $this->app->handle($request);

        self::assertSame(401, $response->getStatusCode());
        self::assertNotSame('', $response->getHeaderLine('WWW-Authenticate'));
        self::assertSame([], $this->storedFiles());
        self::assertSame([], (new MediaRepository($this->pdo))->list());
    }

    public function testPhpAndSvgDisguisedAsPngAreRejected(): void
    {
        $php = $this->upload($this->clientFile('shell.png', "<?php echo 'pwned'; ?>\n"));
        self::assertSame(422, $php->getStatusCode());
        self::assertArrayHasKey('file', $this->decode($php)['fields']);

        $svg = '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" width="1" height="1">'
            . '<script>alert(1)</script></svg>';
        $svgResponse = $this->upload($this->clientFile('vector.png', $svg));
        self::assertSame(422, $svgResponse->getStatusCode());
        self::assertArrayHasKey('file', $this->decode($svgResponse)['fields']);

        self::assertSame([], $this->storedFiles());
        self::assertSame([], (new MediaRepository($this->pdo))->list());
    }

    public function testOversizeUploadIsRejected(): void
    {
        // A valid PNG padded past UPLOAD_MAX_BYTES with trailing bytes.
        $content = self::png() . str_repeat("\0", self::MAX_BYTES);
        $response = $this->upload($this->clientFile('big.png', $content));

        self::assertContains($response->getStatusCode(), [413, 422]);
        self::assertSame([], $this->storedFiles());
        self::assertSame([], (new MediaRepository($this->pdo))->list());
    }

    public function testListAndDeleteRemoveRowAndFile(): void
    {
        $first = $this->decode($this->upload($this->clientFile('one.png', self::png()), 'One'))['data'];
        $second = $this->decode($this->upload($this->clientFile('two.png', self::png())))['data'];

        $posts = new PostRepository($this->pdo);
        $postId = $posts->create([
            'slug' => 'with-cover',
            'title' => 'With cover',
            'cover_media_id' => $first['id'],
        ]);
        self::assertSame($first['id'], $posts->find($postId)['cover_media_id']);

        $listed = $this->request('GET', '/admin/media');
        self::assertSame(200, $listed->getStatusCode());
        $ids = array_column($this->decode($listed)['data'], 'id');
        self::assertCount(2, $ids);
        self::assertContains($first['id'], $ids);
        self::assertContains($second['id'], $ids);

        $firstPath = $this->uploadDir . DIRECTORY_SEPARATOR . basename($first['url']);
        self::assertFileExists($firstPath);

        $deleted = $this->request('DELETE', '/admin/media/' . $first['id']);
        self::assertSame(204, $deleted->getStatusCode());
        self::assertNull((new MediaRepository($this->pdo))->find($first['id']));
        self::assertFileDoesNotExist($firstPath);
        self::assertFileExists($this->uploadDir . DIRECTORY_SEPARATOR . basename($second['url']));
        self::assertNull($posts->find($postId)['cover_media_id']);

        self::assertSame(404, $this->request('DELETE', '/admin/media/' . $first['id'])->getStatusCode());

        $remaining = array_column($this->decode($this->request('GET', '/admin/media'))['data'], 'id');
        self::assertSame([$second['id']], $remaining);
    }

    public function testDeleteNeverFollowsATraversalFilename(): void
    {
        $victim = $this->sandbox . DIRECTORY_SEPARATOR . 'victim.png';
        file_put_contents($victim, self::png());
        $id = (new MediaRepository($this->pdo))->create([
            'filename' => '../victim.png',
            'original_name' => 'victim.png',
            'mime_type' => 'image/png',
            'size_bytes' => strlen(self::png()),
            'width' => 1,
            'height' => 1,
        ]);

        $deleted = $this->request('DELETE', '/admin/media/' . $id);

        self::assertSame(204, $deleted->getStatusCode());
        self::assertNull((new MediaRepository($this->pdo))->find($id));
        self::assertFileExists($victim);
    }

    private function upload(UploadedFile $file, ?string $altText = null): ResponseInterface
    {
        return $this->app->handle($this->uploadRequest($file, $altText, true));
    }

    private function uploadRequest(UploadedFile $file, ?string $altText, bool $authenticated): ServerRequestInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest('POST', '/admin/media')
            ->withHeader('Content-Type', 'multipart/form-data; boundary=forge-test')
            ->withUploadedFiles(['file' => $file])
            ->withParsedBody($altText === null ? [] : ['alt_text' => $altText]);
        if ($authenticated) {
            $request = $request->withHeader('Authorization', 'Bearer ' . $this->token());
        }

        return $request;
    }

    private function request(string $method, string $path): ResponseInterface
    {
        $request = (new ServerRequestFactory())->createServerRequest($method, $path)
            ->withHeader('Authorization', 'Bearer ' . $this->token());

        return $this->app->handle($request);
    }

    private function clientFile(string $clientName, string $content): UploadedFile
    {
        $path = $this->sourceDir . DIRECTORY_SEPARATOR . bin2hex(random_bytes(8));
        file_put_contents($path, $content);

        return new UploadedFile($path, $clientName, 'image/png', strlen($content), UPLOAD_ERR_OK);
    }

    /** @return list<string> */
    private function storedFiles(): array
    {
        $files = array_values(array_filter(
            scandir($this->uploadDir) ?: [],
            static fn (string $name): bool => $name !== '.' && $name !== '..',
        ));
        sort($files);

        return $files;
    }

    private static function png(): string
    {
        return (string) base64_decode(self::PNG_BASE64, true);
    }

    private function token(): string
    {
        return JWT::encode([
            'iss' => 'https://issuer.example',
            'aud' => 'forge-admin',
            'sub' => 'admin-123',
            'scope' => 'admin',
            'nbf' => time() - 5,
            'exp' => time() + 300,
        ], $this->privateKey, 'RS256', 'test-key');
    }

    /** @return array<string, mixed> */
    private function decode(ResponseInterface $response): array
    {
        $data = json_decode((string) $response->getBody(), true, 512, JSON_THROW_ON_ERROR);
        self::assertIsArray($data);

        return $data;
    }

    private static function removeTree(string $path): void
    {
        if (is_link($path) || is_file($path)) {
            @unlink($path);

            return;
        }
        if (!is_dir($path)) {
            return;
        }
        foreach (scandir($path) ?: [] as $entry) {
            if ($entry !== '.' && $entry !== '..') {
                self::removeTree($path . DIRECTORY_SEPARATOR . $entry);
            }
        }
        @rmdir($path);
    }
}
