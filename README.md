# Ancora Timing

Source repository: <https://github.com/mtstedman/forge>

## Hosting

| Purpose | Host | Server directory |
| --- | --- | --- |
| Website | `ancoratiming.com` | `/var/www/ancoratiming.com/htdocs/` |
| API | `api.ancoratiming.com` | `/var/www/ancoratiming.com/api/` |
| GitHub webhook | `deploy.ancoratiming.com/github` | Shared deployment listener |

HTTPS and the push webhook are provisioned. Signed pushes to `main` are
acknowledged with `202 webhook received; deployment not configured`.
There is no deployment script yet, and pushes do not publish application files.
The empty website and API roots do not contain an application yet.

Host deployment configuration and its activation instructions live in
`/home/mason/repos/deployment/forge/README.md`. Webhook secrets remain in that
repository's ignored runtime directory, outside all public document roots.

## Repository layout

| Path | Contents |
| --- | --- |
| `src/` | Public website (landing page, `/resources/` blog, admin UI in `src/admin/`). The website is built from this directory. |
| `src/includes/` | Site PHP classes (`Forge\Site\…`). Denied over HTTP by `src/.htaccess`. |
| `api/public/` | Front controller (`index.php`) for the PHP JSON API, plus the uploads directory. Web root for the API. |
| `api/src/` | API PHP classes (`Forge\Api\…`). |
| `api/bin/migrate.php` | Applies `api/database/schema.sql` to the configured database. |
| `api/database/` | `schema.sql` (tables) and `seed.sql` (optional sample posts). |
| `api/var/` | Runtime data: default SQLite database, JWKS cache, PHPUnit cache. |
| `api/tests/`, `tests/site/` | PHPUnit suites `api` and `site`. |

The entry points and `tests/bootstrap.php` register the namespaces
`Forge\Api\` (`api/src/`) and `Forge\Site\` (`src/includes/`) at runtime.
They call `$loader->addPsr4()` on the Composer class loader, so `vendor/`
does not need to be regenerated after you add classes.

## Requirements

- PHP 8.1 or newer with the `pdo_sqlite`, `mbstring` and `fileinfo` extensions
- [Composer](https://getcomposer.org/)
- Apache with `mod_rewrite` in production. Both document roots include an
  `.htaccess` file.
- The `sqlite3` CLI, only if you want to load the optional seed data

## Setup

1. Install dependencies from the repository root:

   ```sh
   composer install
   ```

2. Create the repository-root `.env`. Every entry point (API, migration script
   and website) loads this one file with phpdotenv. Variables that are already
   set in the real process environment are not overwritten.

   ```sh
   cp .env.example .env
   cat database.env.example >> .env
   ```

   `.env.example` contains the API and site settings, and `database.env.example`
   contains the database connection. Never commit `.env`. Generate a private
   `APP_KEY`:

   ```sh
   php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
   ```

3. Create or update the database schema. You can re-run this safely because
   the schema uses `CREATE TABLE IF NOT EXISTS`:

   ```sh
   php api/bin/migrate.php
   ```

   With the default settings, this creates `api/var/forge.sqlite`.

4. Optional: load the sample posts. The seed uses `INSERT OR IGNORE`, so you can
   apply it more than once:

   ```sh
   sqlite3 api/var/forge.sqlite < api/database/seed.sql
   ```

### Database

Set `DATABASE_URL` if you can. Examples:

- `sqlite:api/var/forge.sqlite` (relative to the repository root)
- `sqlite:///absolute/path/forge.sqlite`

If `DATABASE_URL` is empty, the API uses `DB_CONNECTION` and `DB_DATABASE`
instead. The connection layer can also parse `mysql://` and `postgres://` URLs,
but the bundled schema is written for SQLite.

## Running locally

Run the API and the website in two terminals with PHP's built-in server:

```sh
php -S localhost:8080 -t api/public    # API  -> http://localhost:8080/health
php -S localhost:8000 -t src           # site -> http://localhost:8000/
```

Use these `.env` values for this setup:

```dotenv
APP_ENV=dev
SITE_URL=http://localhost:8000
API_BASE_URL=http://localhost:8080
PUBLIC_API_URL=http://localhost:8080
CORS_ALLOWED_ORIGINS=http://localhost:8000
OAUTH_REDIRECT_URI=http://localhost:8000/admin/
```

The built-in server ignores `.htaccess`, which has two effects when you run
locally:

- Apache rewrites are not applied. Open posts as
  `/resources/post.php?slug=<slug>` instead of `/resources/<slug>`. Use
  `/sitemap.php` and `/robots.php` instead of `/sitemap.xml` and `/robots.txt`.
- `src/includes/` is not protected from HTTP access. Use the built-in server
  only for development.

With `APP_ENV=dev`, API error responses include details. Use
`APP_ENV=production` on the server.

## Configuration reference

All settings live in the repository-root `.env`. Keep real values, such as
production OAuth settings and `APP_KEY`, out of the repository.

### API (`api/src`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | unset | `dev` includes error details in responses. Any other value, such as `production`, hides them. |
| `APP_KEY` | empty | Secret HMAC key used to hash commenter IP addresses. Public comments stay closed while this is empty. |
| `CORS_ALLOWED_ORIGINS` | empty | Comma-separated browser origins that may call the API, e.g. `https://ancoratiming.com`. |
| `PUBLIC_COMMENTS_ENABLED` | `false` | Global switch for public comment submission. See [Comments](#comments). |
| `COMMENT_RATE_LIMIT` | `3` | Number of comments accepted per IP address in each 600-second window. |
| `OAUTH_ISSUER` | – | Expected `iss` claim of admin access tokens. Required for `/admin`. |
| `OAUTH_AUDIENCE` | – | Expected `aud` claim (the API identifier). Required for `/admin`. |
| `OAUTH_JWKS_URL` | – | Provider JWKS endpoint used to verify token signatures. Required for `/admin`. |
| `OAUTH_REQUIRED_SCOPE` | empty | If set, tokens must include this scope in `scope` or `scp`. |
| `UPLOAD_DIR` | `api/public/uploads` | Storage directory for uploaded images. Relative paths resolve against the repository root. |
| `UPLOAD_MAX_BYTES` | `5242880` | Maximum upload size in bytes (5 MiB). |
| `MEDIA_BASE_URL` | `/uploads` for post covers | Public URL prefix for uploaded files. See [Uploads](#uploads). |
| `DATABASE_URL`, `DB_CONNECTION`, `DB_DATABASE` | – | Database connection. See `database.env.example`. |

### Website (`src/includes`)

| Variable | Example | Purpose |
| --- | --- | --- |
| `SITE_URL` | `https://ancoratiming.com` | Site origin used for canonical URLs, the sitemap and robots.txt. Defaults to `http://localhost`. |
| `API_BASE_URL` | `https://api.ancoratiming.com` | API base URL for the PHP pages (server side). |
| `PUBLIC_API_URL` | `https://api.ancoratiming.com` | API base URL for browser scripts (comments and admin). |
| `OAUTH_AUTHORIZE_URL` | `https://auth.example.com/authorize` | Provider authorization endpoint. |
| `OAUTH_TOKEN_URL` | `https://auth.example.com/oauth/token` | Provider token endpoint. |
| `OAUTH_CLIENT_ID` | `your-public-client-id` | Client ID of the public (PKCE) admin client. |
| `OAUTH_AUDIENCE` | `https://api.ancoratiming.com` | Audience requested for access tokens. Must match the API's `OAUTH_AUDIENCE`. |
| `OAUTH_SCOPE` | `openid profile email` | Scopes requested at sign-in. If `OAUTH_REQUIRED_SCOPE` is set, include it here. |
| `OAUTH_REDIRECT_URI` | `https://ancoratiming.com/admin/` | URL the provider returns to after sign-in. |

## OAuth provider

The admin UI (`/admin/`) signs in through an external OAuth 2.0 / OpenID Connect
provider. It calls the API's `/admin/*` routes with an
`Authorization: Bearer <access token>` header. Configure the provider as
follows:

- **Issuer**: set the provider's issuer identifier as `OAUTH_ISSUER`. The
  token's `iss` claim must match it exactly.
- **Audience**: register an API (resource) identifier, such as
  `https://api.ancoratiming.com`, that issues JWT access tokens. Use the same
  value for both `OAUTH_AUDIENCE` entries. The API accepts an `aud` claim that
  is either this string or an array containing it.
- **JWKS**: set the provider's public key set URL as `OAUTH_JWKS_URL`. Tokens
  must be signed with `RS256` or `ES256`, and other algorithms are rejected.
  The API caches the keys for five minutes in `api/var/`.
- **Client**: create a *public* single-page application client that uses the
  Authorization Code flow with PKCE (`S256`) and has no client secret. Put its
  ID in `OAUTH_CLIENT_ID`, and set `OAUTH_AUTHORIZE_URL` and `OAUTH_TOKEN_URL`
  to the provider's endpoints.
- **Redirect URI**: register the exact `OAUTH_REDIRECT_URI` as an allowed
  callback. Use `https://ancoratiming.com/admin/` in production and
  `http://localhost:8000/admin/` locally. If the provider requires it, allow
  the site origin for CORS on the token endpoint.
- **Scope** (optional): to limit admin access to specific users, set
  `OAUTH_REQUIRED_SCOPE` and grant that scope only to administrators.

If the site and the API run on different origins, add the site origin to
`CORS_ALLOWED_ORIGINS`. Otherwise the admin UI and the comment form cannot
call the API. Requests to `/admin/*` fail until `OAUTH_ISSUER`,
`OAUTH_AUDIENCE` and `OAUTH_JWKS_URL` are all set.

## Comments

Comments are off by default. A post accepts public comments only when **all**
of these conditions are met:

1. `PUBLIC_COMMENTS_ENABLED=true` is set in `.env`. This is the global switch,
   and its default is `false`.
2. `APP_KEY` is set.
3. The post has `comments_enabled` turned on. This is off by default. Turn it
   on for each post in the admin UI, or send `PUT /admin/posts/{id}` with
   `{"comments_enabled": true}`.

The public post response reports the effective state as `comments_enabled`.

Moderation is required. Every submitted comment is stored as `pending` and
stays hidden until an administrator approves it. Approve it in the admin UI, or
send `PATCH /admin/comments/{id}` with `{"status": "approved"}` (or
`"rejected"`). `GET /admin/comments?status=pending` lists the moderation queue.
The public API never returns commenter email addresses or IP hashes. Each IP
address can submit up to `COMMENT_RATE_LIMIT` comments per 10 minutes.

## Uploads

Images uploaded through the admin media library (`POST /admin/media`) are
stored in `UPLOAD_DIR` (default `api/public/uploads/`) under random names.
The API accepts only JPEG, PNG, WebP and GIF files up to `UPLOAD_MAX_BYTES`
and rejects SVG. It detects the file type from the file contents.

- The directory is created on the first upload. The web server user needs
  write access to it.
- `api/public/uploads/.htaccess` disables script execution and serves the
  files as static content only. Keep this file in place if you move the
  directory.
- Public post cover URLs have the form `MEDIA_BASE_URL/<file>`, which is
  `/uploads/<file>` by default. The admin media listing builds
  `MEDIA_BASE_URL/uploads/<file>`.
- Uploaded files are runtime data and are not deployed from the repository.
  Back them up together with the database.

## Tests

```sh
vendor/bin/phpunit                    # all suites
vendor/bin/phpunit --testsuite api    # api/tests
vendor/bin/phpunit --testsuite site   # tests/site
```

`phpunit.xml` uses `tests/bootstrap.php`, which loads the Composer autoloader
and registers both project namespaces. The tests build their own configuration
and do not need an OAuth provider.
