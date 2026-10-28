<?php

declare(strict_types=1);

namespace Forge\Site;

final class Layout
{
    /**
     * @param array<string, mixed> $meta
     */
    public static function header(array $meta, string $active): void
    {
        $head = Seo::head($meta);
        $jsonLd = isset($meta['json_ld']) && is_array($meta['json_ld'])
            ? "\n" . Seo::jsonLd($meta['json_ld'])
            : '';
        $homeCurrent = $active === 'home' ? ' aria-current="page"' : '';
        $resourcesCurrent = $active === 'resources' ? ' aria-current="page"' : '';

        echo <<<HTML
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
{$head}
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;600&amp;family=Lora:wght@400;600&amp;display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/css/site.css">
{$jsonLd}
</head>
<body>
<a class="skip-link" href="#main-content">Skip to content</a>
<header class="site-header">
  <div class="site-header__inner">
    <a class="brand" href="/"{$homeCurrent} aria-label="Forge Performance Therapy home">
      <span class="brand__mark" aria-hidden="true">F</span>
      <span><strong>Forge</strong><small>Performance Therapy</small></span>
    </a>
    <nav class="desktop-nav" aria-label="Primary navigation">
      <a href="/#approach">Approach</a>
      <a href="/#services">Services</a>
      <a href="/#about">About</a>
      <a href="/#pricing">Pricing</a>
      <a href="/#faq">FAQ</a>
      <a href="/resources/"{$resourcesCurrent}>Resources</a>
      <a class="button button--outline" href="/#contact">Free phone consult</a>
    </nav>
    <details class="mobile-nav">
      <summary aria-label="Open navigation"><span></span><span></span><span></span></summary>
      <nav aria-label="Mobile navigation">
        <a href="/#approach">Approach</a>
        <a href="/#services">Services</a>
        <a href="/#about">About</a>
        <a href="/#pricing">Pricing</a>
        <a href="/#faq">FAQ</a>
        <a href="/resources/"{$resourcesCurrent}>Resources</a>
        <a class="button button--outline" href="/#contact">Book a free 15-minute phone consult</a>
      </nav>
    </details>
  </div>
</header>
HTML;
    }

    public static function footer(): void
    {
        $year = date('Y');

        echo <<<HTML
<footer class="site-footer">
  <div class="site-footer__inner">
    <a class="site-footer__brand" href="/">Forge</a>
    <nav aria-label="Footer navigation">
      <a href="/#approach">Approach</a>
      <a href="/#services">Services</a>
      <a href="/#about">About</a>
      <a href="/#pricing">Pricing</a>
      <a href="/#faq">FAQ</a>
      <a href="/resources/">Resources</a>
      <a href="/#contact">Contact</a>
    </nav>
    <span>© {$year} Forge Performance Therapy · Twin Cities, MN</span>
  </div>
</footer>
</body>
</html>
HTML;
    }
}
