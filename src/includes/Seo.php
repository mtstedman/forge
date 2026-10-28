<?php

declare(strict_types=1);

namespace Forge\Site;

final class Seo
{
    /**
     * @param array<string, mixed> $meta
     */
    public static function head(array $meta): string
    {
        $title = self::value($meta, 'title');
        $description = self::value($meta, 'description');
        $canonical = self::value($meta, 'canonical');
        $robots = self::value($meta, 'robots', 'index,follow');
        $image = self::value($meta, 'image', self::value($meta, 'og_image'));
        $type = self::value($meta, 'type', self::value($meta, 'og_type', 'website'));
        $siteName = self::value($meta, 'site_name', 'Forge Performance Therapy');
        $twitterCard = self::value($meta, 'twitter_card', $image !== '' ? 'summary_large_image' : 'summary');

        $tags = [];
        if ($title !== '') {
            $tags[] = '<title>' . self::escape($title) . '</title>';
        }
        if ($description !== '') {
            $tags[] = self::meta('name', 'description', $description);
        }
        if ($canonical !== '') {
            $tags[] = '<link rel="canonical" href="' . self::escape($canonical) . '">';
        }
        if ($robots !== '') {
            $tags[] = self::meta('name', 'robots', $robots);
        }

        $openGraph = [
            'og:title' => $title,
            'og:description' => $description,
            'og:type' => $type,
            'og:url' => $canonical,
            'og:site_name' => $siteName,
            'og:image' => $image,
        ];
        foreach ($openGraph as $property => $content) {
            if ($content !== '') {
                $tags[] = self::meta('property', $property, $content);
            }
        }

        $twitter = [
            'twitter:card' => $twitterCard,
            'twitter:title' => $title,
            'twitter:description' => $description,
            'twitter:image' => $image,
        ];
        foreach ($twitter as $name => $content) {
            if ($content !== '') {
                $tags[] = self::meta('name', $name, $content);
            }
        }

        return implode("\n", $tags);
    }

    /**
     * @param array<string, mixed> $graph
     */
    public static function jsonLd(array $graph): string
    {
        $json = json_encode(
            $graph,
            JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE | JSON_HEX_TAG | JSON_HEX_AMP | JSON_HEX_APOS | JSON_HEX_QUOT | JSON_THROW_ON_ERROR
        );

        return '<script type="application/ld+json">' . $json . '</script>';
    }

    private static function meta(string $attribute, string $key, string $content): string
    {
        return '<meta ' . $attribute . '="' . self::escape($key) . '" content="' . self::escape($content) . '">';
    }

    /**
     * @param array<string, mixed> $meta
     */
    private static function value(array $meta, string $key, string $default = ''): string
    {
        $value = $meta[$key] ?? $default;

        return is_scalar($value) ? (string) $value : $default;
    }

    private static function escape(string $value): string
    {
        return htmlspecialchars($value, ENT_QUOTES | ENT_SUBSTITUTE | ENT_HTML5, 'UTF-8');
    }
}
