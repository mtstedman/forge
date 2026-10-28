<?php

declare(strict_types=1);

namespace Forge\Tests\Site;

use Forge\Site\Seo;
use PHPUnit\Framework\TestCase;

final class SeoTest extends TestCase
{
    public function testHeadEscapesEveryRenderedValue(): void
    {
        $head = Seo::head([
            'title' => 'Forge <Therapy> & "Care"',
            'description' => 'A <better> recovery "plan"',
            'canonical' => 'https://example.test/?a=1&b="two"',
            'robots' => 'index,follow"><script>alert(1)</script>',
            'image' => 'https://example.test/image.jpg?x=1&y=2',
            'site_name' => 'Forge & Co.',
        ]);

        self::assertStringContainsString('<title>Forge &lt;Therapy&gt; &amp; &quot;Care&quot;</title>', $head);
        self::assertStringContainsString('content="A &lt;better&gt; recovery &quot;plan&quot;"', $head);
        self::assertStringContainsString('href="https://example.test/?a=1&amp;b=&quot;two&quot;"', $head);
        self::assertStringNotContainsString('<script>alert(1)</script>', $head);
        self::assertStringContainsString('Forge &amp; Co.', $head);
    }

    public function testJsonLdCannotBreakOutOfScriptElement(): void
    {
        $jsonLd = Seo::jsonLd([
            '@context' => 'https://schema.org',
            'name' => '</script><script>alert("x")</script>',
        ]);

        self::assertStringStartsWith('<script type="application/ld+json">', $jsonLd);
        self::assertStringEndsWith('</script>', $jsonLd);
        self::assertSame(1, substr_count(strtolower($jsonLd), '</script>'));
        self::assertStringContainsString('\\u003C/script\\u003E', $jsonLd);
        self::assertStringNotContainsString('<script>alert', $jsonLd);
    }
}
