# Cloudflare edge hardening

Family Board uses bearer-link access. A Read link or Edit link is the
authority, so edge protections reduce automated abuse and accidental discovery
but do not turn a bearer link into identity-based authorization.

## Checked-in protections

- Page creation requires a server-verified Turnstile token with the
  `create-page` action and an allowlisted hostname. Read-link access does not
  require Turnstile.
- `CREATE_RATE_LIMITER` allows 5 Page-creation attempts per client key in 60
  seconds.
- `EDIT_API_RATE_LIMITER` allows 60 Edit API requests per client key in 60
  seconds. It covers Edit-link reads and Link item mutations. The binding
  configuration is in `wrangler.jsonc` and uses
  Cloudflare's Workers Rate Limiting API.
- API responses and credential-bearing `/read/` and `/edit/` application
  responses use `Cache-Control: no-store` and `Referrer-Policy: no-referrer`.
  Read responses also use `X-Robots-Tag: noindex, nofollow`.
- `public/robots.txt` disallows crawler requests to Read and Edit URL paths.
  This is discovery reduction, not authorization.
- Wrangler observability remains enabled as a configuration surface, but
  invocation logs and traces are disabled because Cloudflare telemetry includes
  request URLs and bearer credentials are carried in those paths.
- The Worker does not log request URLs, bearer tokens, Page data, or challenge
  tokens. Challenge and rate-limit failures are generic.

The Workers Rate Limiting API is intentionally a low-load control: counters are
per Cloudflare location and eventually consistent. It complements, rather than
replaces, Turnstile and bearer-link authorization.

The two checked-in namespace IDs (`1001` and `1002`) must be unique within the
Cloudflare account. If either is already in use, replace it with an unused
positive integer before deployment; the binding names and limits remain the
same.

## Production setup

The production Turnstile widget and secret are account-specific and are not
checked into Git. Complete these steps before relying on Page creation:

1. Create a managed Turnstile widget for the deployed hostname. Register the
   exact `workers.dev` hostname (and any later custom hostname), not a wildcard
   or a local hostname.
2. Set `TURNSTILE_SITE_KEY` and `TURNSTILE_HOSTNAMES` in the production
   `vars` section of `wrangler.jsonc`. `TURNSTILE_HOSTNAMES` is a comma-separated
   exact hostname allowlist and must not contain `localhost` or `127.0.0.1` in
   production.
3. Store the widget secret as a Worker secret, without putting its value in a
   command argument or file committed to Git:

   ```sh
   wrangler secret put TURNSTILE_SECRET
   ```

4. Deploy and verify that `GET /api/config` returns only the public site key.
   Exercise Page creation with a fresh browser challenge, then verify that a
   missing, expired, invalid, replayed, wrong-action, or wrong-hostname token
   is rejected.
5. If the account's plan supports Cloudflare WAF rate-limiting rules, add a
   defense-in-depth rule for `POST /api/pages` and the `/api/edit/*` paths. Keep
   the checked-in Worker limits as the source of application behavior; WAF
   rules are edge configuration and should be recorded in the account's change
   history or infrastructure-as-code repository.

For local development, use the Turnstile testing keys only. The Worker boundary
tests use the testing secret and mock Siteverify responses, so they verify the
application's fail-closed behavior without sending a bearer token or relying
on a live account.
