import type { NextConfig } from "next";

/*
 * Runtime environment (read on the server only; never prefixed NEXT_PUBLIC_):
 *   SITE_URL=https://www.example.com          canonical site origin
 *   API_BASE_URL=http://localhost:8080        API origin for server-side fetches
 *   PUBLIC_API_URL=https://api.example.com    API origin handed to the browser
 *   OAUTH_AUTHORIZE_URL, OAUTH_TOKEN_URL, OAUTH_CLIENT_ID, OAUTH_AUDIENCE,
 *   OAUTH_SCOPE, OAUTH_REDIRECT_URI           public PKCE client settings
 * Values reach pages through SSR props. This config intentionally defines no
 * `env` block, so API signing keys, database settings and other secrets are
 * never inlined into client bundles.
 */

/** Baseline headers for every response. Admin no-store/CSP is set by the admin pages. */
const securityHeaders = [
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "Content-Security-Policy", value: "frame-ancestors 'none'" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Canonical routes mix trailing-slash (/resources/, /admin/) and bare
  // (/resources/{slug}) forms, so trailing slashes are redirected explicitly below.
  skipTrailingSlashRedirect: true,

  async headers() {
    return [{ source: "/:path*", headers: securityHeaders }];
  },

  async redirects() {
    return [
      // Legacy PHP entry points. Request query strings (e.g. ?page=) pass through.
      { source: "/index.php", destination: "/", permanent: true },
      { source: "/resources/index.php", destination: "/resources/", permanent: true },
      {
        source: "/resources/post.php",
        has: [{ type: "query", key: "slug", value: "(?<slug>[^/]+)" }],
        destination: "/resources/:slug",
        permanent: true,
      },
      { source: "/admin/index.php", destination: "/admin/", permanent: true },
      { source: "/robots.php", destination: "/robots.txt", permanent: true },
      { source: "/sitemap.php", destination: "/sitemap.xml", permanent: true },

      // Trailing-slash canonicalisation.
      // Next allows an optional trailing slash in redirect matchers. Anchor
      // these at the bare path so the destination cannot redirect to itself.
      { source: "/resources((?!/)$)", destination: "/resources/", permanent: true },
      { source: "/admin((?!/)$)", destination: "/admin/", permanent: true },
      { source: "/resources/:slug/", destination: "/resources/:slug", permanent: true },
    ];
  },
};

export default nextConfig;
