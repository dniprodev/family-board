# Continuous deployment

`.github/workflows/production.yml` runs on every push to `main` and from the
GitHub Actions **Run workflow** button. It runs the repository checks in order:

1. `npm ci`
2. `npm run typecheck`
3. `npm test`
4. `npm run build`
5. Wrangler deployment to the production Worker
6. `npm run smoke:health` against the public Worker URL, checking health,
   public configuration, and the SPA shell route

## GitHub setup

Create a GitHub environment named `production`, then add these environment
secrets under **Settings → Environments → production → Environment secrets**:

- `CLOUDFLARE_API_TOKEN`: a narrowly scoped Cloudflare API token with the
  permissions required to deploy this Worker
- `CLOUDFLARE_ACCOUNT_ID`: the Cloudflare account ID for the Worker

Keep the token only in GitHub's encrypted secrets storage. Do not put it in the
repository, workflow YAML, or command output. The Worker-side
`TURNSTILE_SECRET` remains managed in Cloudflare and is not copied into GitHub.

The workflow intentionally runs public endpoint checks after deployment, but
does not run `smoke:production`: that test requires a fresh, browser-issued
Turnstile token and disposable production data, which should not be automated
from a static CI secret.
