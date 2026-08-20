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

Start the Vite development server:

```sh
npm run dev
```

The application and Worker API are available at the local URL printed by Vite.
The foundation health endpoint is `GET /api/health`.

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

The checked-in `wrangler.jsonc` contains the local configuration and a
placeholder database ID. To create a remote database, authenticate with
Wrangler and create the database:

```sh
npx wrangler login
npx wrangler d1 create family-board
```

Copy the returned database ID into `wrangler.jsonc`, then apply migrations and
deploy:

```sh
npm run db:migrate:remote
npm run deploy
```

Do not commit Cloudflare credentials, `.dev.vars`, or production database
secrets. The initial deployment target is a `workers.dev` hostname.
