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

Website Will be build from /src/ directory.
API will be a php backend in /api/
