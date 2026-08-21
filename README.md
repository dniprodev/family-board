# Family Board

Family Board is a mobile-first shared page of links. An Editor maintains a
Page through an Edit link, while Readers use a separate Read link. The MVP
uses bearer-link access: no accounts, passwords, or identity provider are
required.

## Stack

- React and TypeScript for the browser application
- Vite with the Cloudflare Vite plugin for local development and builds
- Tailwind CSS for UI styling
- One TypeScript Cloudflare Worker for the application boundary
- Cloudflare D1 for persistence and Wrangler for local/remote operations
- Vitest with the Cloudflare Vitest plugin for Worker-runtime tests

There is no separate backend service, ORM, UI framework, or database server.

## Requirements

Use Node.js 20 or newer and npm. Cloudflare login is only required for remote
D1 operations and deployment.

## Local development

Install dependencies and apply the initial D1 migration:

```sh
npm install
npm run db:migrate:local
```

Start the Vite development server. The Cloudflare Vite plugin runs the React
frontend and Worker together, with a local D1 simulation for `DB`:

```sh
npm run dev
```

The application and Worker API are available at the local URL printed by Vite.
The foundation health endpoint is `GET /api/health`.

To preview the production build in the Workers runtime, use:

```sh
npm run build
npm run preview
```

## Verification

```sh
npm run typecheck
npm test
npm run build
```

Worker boundary tests run locally in the Cloudflare Workers runtime with
isolated test storage. The initial suite intentionally starts at the
application boundary; feature behavior will extend this seam as the MVP is
implemented.

## D1 and deployment

The checked-in `wrangler.jsonc` defines the `DB` binding, migration directory,
and `workers_dev: true` deployment target. The database ID is not a credential,
but the committed value is a safe placeholder until a maintainer creates the
production database. Complete the one-time Cloudflare account steps with:

```sh
npx wrangler login
npx wrangler d1 create family-board
```

Copy the returned database ID into `wrangler.jsonc` as `database_id`. Do not
commit API tokens, `.dev.vars*`, or other secrets. Apply the production schema
and deploy the Worker and built frontend:

```sh
npm run db:migrate:remote
npm run deploy
```

Wrangler prints the deployed `workers.dev` URL. Verify the public health check
without exposing Page data or bearer credentials:

```sh
npm run smoke:health -- https://family-board.<subdomain>.workers.dev
```

The same command can read `FAMILY_BOARD_URL` when it is more convenient:

```sh
FAMILY_BOARD_URL=https://family-board.<subdomain>.workers.dev npm run smoke:health
```

The smoke test requests `/api/health` and requires HTTP 200, a JSON content
type, and the exact body `{\"status\":\"ok\"}`.
