# Forge Performance Therapy

Source repository: <https://github.com/mtstedman/forge>

This repository contains two runtime applications:

- `frontend/` is the public website and admin UI, implemented with the Next.js
  Pages Router, TypeScript, Tailwind CSS v4 and the shared UI components.
- `api/` is the retained PHP JSON API, database layer and upload host.

The former PHP-rendered website has been retired. There is one active frontend:
the Next.js application in `frontend/`.

## Hosting and deployment status

| Purpose | Host | Production role |
| --- | --- | --- |
| Website | `ancoratiming.com` | Reverse proxy to a long-running Node/Next.js service |
| API | `api.ancoratiming.com` | PHP web root at `api/public/` |
| GitHub webhook | `deploy.ancoratiming.com/github` | Shared deployment listener |

The signed `main` push webhook calls the deployment gate in
`/home/mason/repos/deployment/forge/CI/deploy.sh`. That gate installs locked npm
dependencies and compiles the TSX frontend with `npm run build` before publishing
to `/var/www/ancoratiming.com/app/frontend/`, including `.next/` and the Next
runtime. A failed build stops before publication.

On the next successful deployment the gate installs/restarts
`forge-frontend.service` on `127.0.0.1:3100` and installs the website nginx reverse
proxy. The API remains at `app/api/public/`. Database files, uploads and runtime
environment files are preserved. Frontend settings live separately in
`app/frontend/.env.production.local`, initialized once from the public frontend
settings in the existing API `.env`. Host configuration and deployment checks
are maintained in `/home/mason/repos/deployment/forge/`.

## Repository layout

| Path | Contents |
| --- | --- |
| `frontend/` | Next.js website, public resources, discovery routes and `/admin/` UI |
| `frontend/src/pages/` | Pages Router entry points with server-side status/header handling |
| `frontend/src/components/` | React components and Tailwind/shadcn-style UI primitives |
| `api/public/` | PHP API front controller and persistent public upload storage |
| `api/src/` | PHP API classes under the `Forge\Api\` namespace |
| `api/bin/migrate.php` | Applies `api/database/schema.sql` |
| `api/bin/create-admin.php` | Creates an administrator or resets its password |
| `api/database/` | SQLite schema and optional seed data |
| `api/var/` | Runtime database, JWKS cache and PHPUnit cache |
| `api/tests/` | PHPUnit API suite |

Composer and `tests/bootstrap.php` register only `Forge\Api\` from `api/src/`.
The removed PHP renderer and its `Forge\Site\` namespace are not part of the
runtime or test configuration.

## Requirements

- Node.js 20.9 or newer and npm
- PHP 8.1 or newer with `pdo_sqlite`, `mbstring` and `fileinfo`
- Composer
- `sqlite3` only when loading the optional sample data from the command line
- A PHP-capable web server for `api/public/` in production
- A Node process manager and reverse proxy for the Next.js website in production

## Initial setup

### API

Install the retained PHP dependencies from the repository root:

```sh
composer install
```

Create the repository-root `.env` for PHP processes:

```sh
cp .env.example .env
cat database.env.example >> .env
```

The API front controller and PHP commands load this root `.env` with phpdotenv.
Existing process-environment values are not overwritten. Keep secrets such as
`APP_KEY`, database credentials and OAuth verification settings out of Git.
Generate an `APP_KEY`, apply the schema and create the first administrator:

```sh
php -r 'echo bin2hex(random_bytes(32)), PHP_EOL;'
php api/bin/migrate.php
php api/bin/create-admin.php admin@example.com 'change-me' 'Site Admin'
```

The administrator command also accepts the password through `ADMIN_PASSWORD`.
Re-running it for an existing email resets that account's password.

Optional sample data can be loaded after migration:

```sh
sqlite3 api/var/forge.sqlite < api/database/seed.sql
```

The bundled schema is SQLite-oriented. With the default configuration the
runtime database is `api/var/forge.sqlite`. The connection code also accepts
`DATABASE_URL` or the `DB_CONNECTION`/`DB_DATABASE` fallback settings.

### Frontend

The approved frontend manifests are `frontend/package.json` and
`frontend/package-lock.json`. Install exactly the locked dependency graph:

```sh
cd frontend
npm ci
```

Next.js loads frontend settings from the process environment and from files in
`frontend/`, such as `frontend/.env.local`. It does not load the repository-root
PHP `.env` merely because the API loads it. For local development create
`frontend/.env.local` with values like:

```dotenv
SITE_URL=http://localhost:3000
API_BASE_URL=http://localhost:8080
PUBLIC_API_URL=http://localhost:8080
OAUTH_AUTHORIZE_URL=
OAUTH_TOKEN_URL=
OAUTH_CLIENT_ID=
OAUTH_AUDIENCE=
OAUTH_SCOPE=openid profile email
OAUTH_REDIRECT_URI=http://localhost:3000/admin/
```

`API_BASE_URL` is used by server-side Next requests. `PUBLIC_API_URL` is passed
to browser code for comments, authentication and admin requests. OAuth settings
are optional; the single-sign-on option appears only when the required provider
URLs, client ID and redirect URI are all configured. These values are delivered
through server-rendered props rather than a `NEXT_PUBLIC_*` bundle-time mapping.

Available frontend scripts are:

```sh
npm run dev     # Next development server
npm run build   # production build
npm run start   # serve a completed production build
```

## Running locally

Run the API from the repository root and Next.js from `frontend/` in separate
terminals:

```sh
php -S localhost:8080 -t api/public
```

```sh
cd frontend
npm run dev
```

The API health endpoint is `http://localhost:8080/health`; Next.js serves the
website at `http://localhost:3000/` by default.

Because the browser calls the API on another origin, the root PHP `.env` must
allow the exact frontend origin:

```dotenv
APP_ENV=dev
CORS_ALLOWED_ORIGINS=http://localhost:3000
```

If OAuth is enabled, register `http://localhost:3000/admin/` as the provider's
allowed callback and use that exact value for the frontend
`OAUTH_REDIRECT_URI`. The frontend's requested `OAUTH_AUDIENCE` must match the
API's verifier setting. `APP_ENV=dev` exposes API error details; use a
non-development value in production.

## Runtime configuration

### PHP API (`api/` root `.env`)

| Variable | Default | Purpose |
| --- | --- | --- |
| `APP_ENV` | unset | `dev` includes error details; production values hide them |
| `APP_KEY` | empty | HMAC key for commenter IP hashes; comments remain closed without it |
| `CORS_ALLOWED_ORIGINS` | empty | Comma-separated browser origins allowed to call the API |
| `PUBLIC_COMMENTS_ENABLED` | `false` | Global public-comment switch |
| `COMMENT_RATE_LIMIT` | `3` | Accepted comments per IP in a 600-second window |
| `OAUTH_ISSUER` | unset | Expected provider `iss` claim for optional SSO |
| `OAUTH_AUDIENCE` | unset | Expected provider `aud` claim |
| `OAUTH_JWKS_URL` | unset | Provider signing-key endpoint |
| `OAUTH_REQUIRED_SCOPE` | empty | Optional scope required on provider tokens |
| `UPLOAD_DIR` | `api/public/uploads` | Filesystem location for uploaded images |
| `UPLOAD_MAX_BYTES` | `5242880` | Maximum upload size |
| `MEDIA_BASE_URL` | `/uploads` | Public upload URL prefix |
| `DATABASE_URL`, `DB_CONNECTION`, `DB_DATABASE` | unset | Database connection settings |
| `ADMIN_PASSWORD` | unset | One-command password input for `create-admin.php` |

### Next.js frontend (`frontend/.env.local` or process environment)

| Variable | Purpose |
| --- | --- |
| `SITE_URL` | Canonical website origin; defaults to `http://localhost` |
| `API_BASE_URL` | API origin used by SSR requests |
| `PUBLIC_API_URL` | API origin handed to browser code |
| `OAUTH_AUTHORIZE_URL` | Optional provider authorization endpoint |
| `OAUTH_TOKEN_URL` | Optional provider token endpoint |
| `OAUTH_CLIENT_ID` | Public PKCE client ID |
| `OAUTH_AUDIENCE` | Audience requested by the frontend; match the API value |
| `OAUTH_SCOPE` | Requested scopes |
| `OAUTH_REDIRECT_URI` | Exact registered callback, ending in `/admin/` |

## Routes and compatibility

The completed Next.js application owns `/`, `/resources/`,
`/resources/{slug}`, `/admin/`, `/robots.txt`, `/sitemap.xml` and the custom 404
page. Resource pages and discovery endpoints preserve explicit server-side HTTP
statuses and response headers, including 404 responses and temporary 503
responses with `Retry-After` where appropriate.

Permanent redirects preserve links to the retired PHP entry points:

- `/index.php` → `/`
- `/resources/index.php` → `/resources/` (including pagination query strings)
- `/resources/post.php?slug={slug}` → `/resources/{slug}`
- `/admin/index.php` → `/admin/`
- `/robots.php` → `/robots.txt`
- `/sitemap.php` → `/sitemap.xml`

Canonical redirects also normalize `/resources`, `/admin` and trailing slashes
on resource detail routes. There is no second PHP frontend serving these paths.

## Admin authentication

`/admin/` signs in with email and password through `POST /admin/login` and sends
the returned bearer token to the API's `/admin/*` routes. Sign-out calls
`POST /admin/logout`. Administrators are stored in `admin_users`; create or
reset one with:

```sh
php api/bin/create-admin.php <email> [password] [name]
```

Optional OAuth/OIDC sign-in uses Authorization Code with PKCE (`S256`) and a
public client. Configure the API's issuer, audience and JWKS verification values
in the root `.env`, and configure the provider/client values separately for the
Next service. Provider tokens may use `RS256` or `ES256`. If the site and API
have different origins, the site origin must be present in
`CORS_ALLOWED_ORIGINS`.

## Comments

Public comments are accepted only when `PUBLIC_COMMENTS_ENABLED=true`,
`APP_KEY` is set and the individual post has comments enabled. New comments are
always pending until an administrator approves them. The public API does not
return commenter email addresses or IP hashes.

## Persistent uploads

Admin media uploads remain API-owned runtime data. Files are stored under
`UPLOAD_DIR` (default `api/public/uploads/`) and served by the API host through
`MEDIA_BASE_URL`. The API accepts JPEG, PNG, WebP and GIF content and rejects
SVG uploads.

Do not place uploads in the Next build output and do not replace the upload
directory during frontend deployment. The API web-server user needs write
access, `api/public/uploads/.htaccess` must remain in place, and the upload tree
must be persisted and backed up together with the database.

## Verification boundary

PHPUnit now contains only the retained API suite:

```sh
vendor/bin/phpunit
vendor/bin/phpunit --testsuite api
```

The retired PHP renderer tests have been removed. `frontend/package.json`
currently has no Next.js test script, so there is no automated frontend runtime
test command to document. The available `npm run build` command checks whether
the Next application can produce a production build when dependencies and
configuration are present, but the legacy renderer tests and API PHPUnit results
must not be presented as verification of the Next.js runtime or browser UI.
