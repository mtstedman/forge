<?php

declare(strict_types=1);

namespace Forge\Tests\Site;

use Forge\Site\ApiClient;
use GuzzleHttp\Client;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Promise\Create;
use GuzzleHttp\Promise\PromiseInterface;
use GuzzleHttp\Psr7\Response;
use PHPUnit\Framework\TestCase;
use Psr\Http\Message\RequestInterface;

final class ResourcePageTest extends TestCase
{
    private const SITE_URL = 'https://forge.example';
    private const PUBLIC_API_URL = 'https://api.forge.example';

    /** @var array<string, mixed> */
    private array $originalEnv = [];

    /** @var array<string, mixed> */
    private array $originalGet = [];

    protected function setUp(): void
    {
        $this->originalEnv = $_ENV;
        $this->originalGet = $_GET;
        $_ENV['SITE_URL'] = self::SITE_URL;
        $_ENV['PUBLIC_API_URL'] = self::PUBLIC_API_URL;
    }

    protected function tearDown(): void
    {
        $_ENV = $this->originalEnv;
        $_GET = $this->originalGet;
    }

    public function testDetailPageRendersSeoMetadataAndStructuredData(): void
    {
        $client = $this->client([
            '/posts/knee-pain-running' => [200, ['data' => $this->post()]],
            '/posts' => [200, $this->list([
                $this->summary('knee-pain-running', 'Knee pain and running'),
                $this->summary('hip-mobility', 'Hip mobility basics'),
            ])],
        ]);

        [$status, $html] = $this->render('resources/post.php', ['slug' => 'knee-pain-running'], $client);

        self::assertSame(200, $status);
        self::assertSame(1, preg_match_all('/<h1[\s>]/i', $html));
        self::assertStringContainsString('<link rel="canonical" href="' . self::SITE_URL . '/resources/knee-pain-running">', $html);
        self::assertStringContainsString('<meta name="description" content="Custom meta description for knee pain.">', $html);
        self::assertStringContainsString('<meta property="og:type" content="article">', $html);
        self::assertStringContainsString('<meta property="article:published_time" content="2026-09-01T12:00:00+00:00">', $html);
        self::assertStringContainsString('<meta property="article:modified_time" content="2026-09-05T08:30:00+00:00">', $html);

        // Answer-first summary directly under the h1, and machine-readable dates.
        self::assertMatchesRegularExpression('#</h1>\s*<p class="article__summary">Run pain-free by loading the knee progressively\.</p>#', $html);
        self::assertStringContainsString('<time datetime="2026-09-01T12:00:00+00:00">', $html);

        $graph = $this->jsonLdGraph($html);
        $posting = $this->nodeOfType($graph, 'BlogPosting');
        self::assertSame('Knee pain and running', $posting['headline']);
        self::assertSame('2026-09-01T12:00:00+00:00', $posting['datePublished']);
        self::assertSame('2026-09-05T08:30:00+00:00', $posting['dateModified']);
        self::assertSame(['@type' => 'Person', 'name' => 'Dr. Joseph Sperlak'], $posting['author']);
        self::assertSame(self::SITE_URL . '/uploads/knee.jpg', $posting['image']['url']);
        self::assertSame('Organization', $posting['publisher']['@type']);
        self::assertSame('Forge Performance Therapy', $posting['publisher']['name']);

        $breadcrumbs = $this->nodeOfType($graph, 'BreadcrumbList');
        self::assertCount(3, $breadcrumbs['itemListElement']);
        self::assertSame(self::SITE_URL . '/resources/knee-pain-running', $breadcrumbs['itemListElement'][2]['item']);

        $faq = $this->nodeOfType($graph, 'FAQPage');
        self::assertCount(1, $faq['mainEntity']);
        self::assertSame('How long until I can run again?', $faq['mainEntity'][0]['name']);
        self::assertSame('Most runners return within 6 weeks.', $faq['mainEntity'][0]['acceptedAnswer']['text']);
        self::assertStringContainsString('<summary>How long until I can run again?</summary>', $html);

        // Related resources exclude the current post.
        self::assertStringContainsString('href="/resources/hip-mobility"', $html);
        self::assertStringNotContainsString('href="/resources/knee-pain-running"', $html);
    }

    public function testDetailPageFallsBackToExcerptAndOmitsFaqPageWithoutFaq(): void
    {
        $post = $this->post();
        $post['meta_description'] = null;
        $post['faq'] = [];
        $client = $this->client(['/posts/knee-pain-running' => [200, ['data' => $post]]]);

        [$status, $html] = $this->render('resources/post.php', ['slug' => 'knee-pain-running'], $client);

        self::assertSame(200, $status);
        self::assertStringContainsString('<meta name="description" content="Run pain-free by loading the knee progressively.">', $html);
        $types = array_map(static fn (array $node): mixed => $node['@type'], $this->jsonLdGraph($html));
        self::assertContains('BlogPosting', $types);
        self::assertContains('BreadcrumbList', $types);
        self::assertNotContains('FAQPage', $types);
        self::assertStringNotContainsString('id="faq"', $html);
    }

    public function testUnknownSlugReturns404(): void
    {
        $client = $this->client(['/posts/missing' => [404, ['error' => 'Post not found.']]]);

        [$status, $html] = $this->render('resources/post.php', ['slug' => 'missing'], $client);

        self::assertSame(404, $status);
        self::assertSame(1, preg_match_all('/<h1[\s>]/i', $html));
        self::assertStringContainsString('<meta name="robots" content="noindex,follow">', $html);
        self::assertStringNotContainsString('application/ld+json', $html);
    }

    public function testApiOutageReturns503WithRetryMessage(): void
    {
        $client = $this->client(['/posts/knee-pain-running' => 'down']);

        [$status, $html] = $this->render('resources/post.php', ['slug' => 'knee-pain-running'], $client);

        self::assertSame(503, $status);
        self::assertStringContainsString('Please wait a minute and try again.', $html);
        self::assertStringContainsString('href="/resources/knee-pain-running">Try again</a>', $html);
    }

    public function testServerErrorFromApiReturns503(): void
    {
        $client = $this->client(['/posts/knee-pain-running' => [500, ['error' => 'boom']]]);

        [$status] = $this->render('resources/post.php', ['slug' => 'knee-pain-running'], $client);

        self::assertSame(503, $status);
    }

    public function testCommentsAreEscapedAndFormHiddenWhenCommentsDisabled(): void
    {
        $post = $this->post();
        $post['comments_enabled'] = false;
        $post['comments'] = [[
            'id' => 1,
            'author_name' => '<b>Mallory</b>',
            'body' => '<script>alert("x")</script> great post',
            'created_at' => '2026-09-06T10:00:00+00:00',
        ]];
        $client = $this->client(['/posts/knee-pain-running' => [200, ['data' => $post]]]);

        [, $html] = $this->render('resources/post.php', ['slug' => 'knee-pain-running'], $client);

        self::assertStringNotContainsString('<form', $html);
        self::assertStringNotContainsString('name="website"', $html);
        self::assertStringNotContainsString('<script>alert', $html);
        self::assertStringNotContainsString('<b>Mallory</b>', $html);
        self::assertStringContainsString('&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; great post', $html);
        self::assertStringContainsString('&lt;b&gt;Mallory&lt;/b&gt;', $html);
    }

    public function testCommentFormWithHoneypotRenderedWhenCommentsEnabled(): void
    {
        $client = $this->client(['/posts/knee-pain-running' => [200, ['data' => $this->post()]]]);

        [, $html] = $this->render('resources/post.php', ['slug' => 'knee-pain-running'], $client);

        self::assertStringContainsString('data-comment-form', $html);
        self::assertMatchesRegularExpression('/<input id="comment-website" name="website" type="text" tabindex="-1"/', $html);
        self::assertStringContainsString('data-api-url="' . self::PUBLIC_API_URL . '"', $html);
        self::assertStringContainsString('<script src="/assets/js/comments.js" defer></script>', $html);
    }

    public function testListingPageRendersPaginationAndStructuredData(): void
    {
        $client = $this->client([
            '/posts' => [200, $this->list([
                $this->summary('hip-mobility', 'Hip mobility basics'),
                $this->summary('ankle-sprain', 'Ankle sprain recovery'),
            ], 2, 25)],
        ]);

        [$status, $html] = $this->render('resources/index.php', ['page' => '2'], $client);

        self::assertSame(200, $status);
        self::assertSame(1, preg_match_all('/<h1[\s>]/i', $html));
        self::assertStringContainsString('<link rel="canonical" href="' . self::SITE_URL . '/resources/?page=2">', $html);
        self::assertStringContainsString('<link rel="prev" href="' . self::SITE_URL . '/resources/">', $html);
        self::assertStringContainsString('<link rel="next" href="' . self::SITE_URL . '/resources/?page=3">', $html);
        self::assertStringContainsString('<title>Resources — Page 2 of 3 | Forge Performance Therapy</title>', $html);

        $graph = $this->jsonLdGraph($html);
        $itemList = $this->nodeOfType($graph, 'ItemList');
        self::assertSame(10, $itemList['itemListElement'][0]['position']);
        self::assertSame(self::SITE_URL . '/resources/hip-mobility', $itemList['itemListElement'][0]['url']);
        $breadcrumbs = $this->nodeOfType($graph, 'BreadcrumbList');
        self::assertSame('Resources', $breadcrumbs['itemListElement'][1]['name']);
    }

    public function testListingPageBeyondLastPageReturns404(): void
    {
        $client = $this->client(['/posts' => [200, $this->list([], 9, 3)]]);

        [$status] = $this->render('resources/index.php', ['page' => '9'], $client);

        self::assertSame(404, $status);
    }

    public function testSitemapListsOnlyPublishedResources(): void
    {
        $draft = $this->summary('draft-post', 'Draft');
        $draft['published_at'] = null;
        $client = $this->client([
            '/posts' => [200, $this->list([$this->summary('hip-mobility', 'Hip mobility basics'), $draft], 1, 2)],
        ]);

        [$status, $xml] = $this->render('sitemap.php', [], $client);

        self::assertSame(200, $status);
        $document = simplexml_load_string($xml);
        self::assertNotFalse($document);
        $document->registerXPathNamespace('s', 'http://www.sitemaps.org/schemas/sitemap/0.9');
        $locations = array_map('strval', $document->xpath('//s:url/s:loc') ?: []);
        self::assertSame([
            self::SITE_URL . '/',
            self::SITE_URL . '/resources/',
            self::SITE_URL . '/resources/hip-mobility',
        ], $locations);
        self::assertCount(3, $document->xpath('//s:url/s:lastmod') ?: []);
    }

    /**
     * @param array<string, string> $query
     * @return array{0: int, 1: string}
     */
    private function render(string $script, array $query, ApiClient $apiClient): array
    {
        $_GET = $query;
        $file = dirname(__DIR__, 2) . '/src/' . $script;
        $level = ob_get_level();
        ob_start();

        try {
            $status = (static function (string $__file, ApiClient $apiClient): int {
                require $__file;

                return isset($responseStatus) && is_int($responseStatus) ? $responseStatus : 200;
            })($file, $apiClient);
            $html = (string) ob_get_contents();
        } finally {
            while (ob_get_level() > $level) {
                ob_end_clean();
            }
        }

        return [$status, $html];
    }

    /**
     * @param array<string, array{0: int, 1: array<string, mixed>}|string> $routes
     */
    private function client(array $routes): ApiClient
    {
        $handler = static function (RequestInterface $request) use ($routes): PromiseInterface {
            $route = $routes[$request->getUri()->getPath()] ?? [404, ['error' => 'Not found.']];
            if ($route === 'down') {
                return Create::rejectionFor(new ConnectException('Connection refused', $request));
            }

            return Create::promiseFor(new Response(
                $route[0],
                ['Content-Type' => 'application/json'],
                json_encode($route[1], JSON_THROW_ON_ERROR)
            ));
        };

        return new ApiClient(self::PUBLIC_API_URL, new Client(['handler' => HandlerStack::create($handler)]));
    }

    /** @return array<string, mixed> */
    private function summary(string $slug, string $title): array
    {
        return [
            'id' => crc32($slug),
            'slug' => $slug,
            'title' => $title,
            'excerpt' => 'Summary of ' . $title . '.',
            'category' => 'Rehab',
            'tags' => ['running'],
            'cover' => null,
            'author_name' => 'Dr. Joseph Sperlak',
            'published_at' => '2026-08-01T12:00:00+00:00',
            'updated_at' => '2026-08-02T12:00:00+00:00',
        ];
    }

    /**
     * @param list<array<string, mixed>> $items
     * @return array<string, mixed>
     */
    private function list(array $items, int $page = 1, ?int $total = null): array
    {
        return ['data' => $items, 'meta' => ['page' => $page, 'per_page' => 9, 'total' => $total ?? count($items)]];
    }

    /** @return array<string, mixed> */
    private function post(): array
    {
        return [
            'id' => 7,
            'slug' => 'knee-pain-running',
            'title' => 'Knee pain and running',
            'excerpt' => 'Run pain-free by loading the knee progressively.',
            'category' => 'Running',
            'tags' => ['knee', 'running'],
            'cover' => ['url' => '/uploads/knee.jpg', 'alt' => 'Runner stretching'],
            'author_name' => 'Dr. Joseph Sperlak',
            'published_at' => '2026-09-01T12:00:00+00:00',
            'updated_at' => '2026-09-05T08:30:00+00:00',
            'body_html' => '<p>Start with isometrics.</p>',
            'faq' => [['question' => 'How long until I can run again?', 'answer' => 'Most runners return within 6 weeks.']],
            'meta_title' => null,
            'meta_description' => 'Custom meta description for knee pain.',
            'comments_enabled' => true,
            'comments' => [],
        ];
    }

    /** @return list<array<string, mixed>> */
    private function jsonLdGraph(string $html): array
    {
        self::assertSame(1, preg_match('#<script type="application/ld\+json">(.*?)</script>#s', $html, $matches));
        $data = json_decode($matches[1], true, 512, JSON_THROW_ON_ERROR);
        self::assertSame('https://schema.org', $data['@context']);
        self::assertIsArray($data['@graph']);

        return $data['@graph'];
    }

    /**
     * @param list<array<string, mixed>> $graph
     * @return array<string, mixed>
     */
    private function nodeOfType(array $graph, string $type): array
    {
        foreach ($graph as $node) {
            if (($node['@type'] ?? null) === $type) {
                return $node;
            }
        }
        self::fail('JSON-LD node of type ' . $type . ' not found.');
    }
}
