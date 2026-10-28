# Ancora Timing

Source repository: <https://github.com/mtstedman/forge>

This checkout is `/home/mason/repos/joe-sperlack`, on branch `main`.
Its SSH remote is `git@github-forge:mtstedman/forge.git`. The `github-forge`
host alias selects the dedicated, write-enabled GitHub deploy key at
`~/.ssh/id_ed25519_forge`; the private key stays outside the repository.

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
