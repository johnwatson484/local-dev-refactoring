# Canonical `package.json` script sets

Pick the block matching your service. Common rules across all variants:

- `node --env-file-if-exists=.env` (NOT `--env-file`) so a missing `.env` is a no-op in
  deployed environments and real platform env vars always win.
- `--watch --watch-path=./src` replaces `nodemon` (no nodemon dependency).
- `cross-env TZ=UTC` on every test script for deterministic dates cross-platform.
- Because `.npmrc` sets `ignore-scripts=true`, lifecycle hooks (`pretest`, `postversion`,
  `prepare`) DO NOT run. So: inline any build step into the script itself, and REMOVE any
  `postversion` / `prepare` / `git:pre-commit-hook` scripts (dead code — versioning in CDP
  uses git tags via `anothrNick/github-tag-action`).
- Keep `docker:build` / `docker:dev` (used by the orchestration repo / journey tests).
- DROP `docker:test`, `docker:test:watch`, `docker:test:debug` (replaced by Testcontainers).

Add `cross-env` as a devDependency for every variant.

---

## API-only service (no Vite build). Deps in a container (e.g. Postgres/Redis).

```jsonc
{
  "dev": "NODE_ENV=development node --env-file-if-exists=.env --watch --watch-path=./src src/index.js",
  "dev:debug": "NODE_ENV=development node --env-file-if-exists=.env --watch --watch-path=./src --inspect src/index.js",
  "docker:build": "docker compose --profile app build",
  "docker:dev": "docker compose --profile app up",
  "lint": "eslint",
  "lint:fix": "eslint --fix",
  "local": "npm run services:up && npm run dev",
  "services:up": "docker compose up -d",
  "services:down": "docker compose down",
  "start": "NODE_ENV=production node .",
  "test": "cross-env TZ=UTC vitest run --coverage",
  "test:unit": "cross-env TZ=UTC vitest run --coverage --project unit",
  "test:integration": "cross-env TZ=UTC vitest run --coverage --project integration",
  "test:watch": "cross-env TZ=UTC vitest",
  "test:debug": "cross-env TZ=UTC vitest --inspect --no-file-parallelism"
}
```

---

## SSR/frontend service WITH backing deps (e.g. admin with Redis).

Uses Vite + `npm-run-all2` to run the Vite watcher and server watcher in parallel. The
`vite build --mode development` up front guarantees the manifest exists before the server
starts (avoids a race on a fresh clone). Tests inline `build:frontend` (no `pretest`).

```jsonc
{
  "build:frontend": "vite build",
  "dev": "vite build --mode development && npm-run-all2 --parallel frontend:watch server:watch",
  "dev:debug": "vite build --mode development && npm-run-all2 --parallel frontend:watch server:debug",
  "frontend:watch": "vite build --mode development --watch",
  "server:watch": "node --env-file-if-exists=.env --watch --watch-path=./src --watch-path=./.public/assets-manifest.json src/index.js",
  "server:debug": "node --env-file-if-exists=.env --watch --watch-path=./src --watch-path=./.public/assets-manifest.json --inspect src/index.js",
  "docker:build": "docker compose --profile app build",
  "docker:dev": "docker compose --profile app up",
  "lint": "eslint",
  "lint:fix": "eslint --fix",
  "local": "npm run services:up && npm run dev",
  "services:up": "docker compose up -d",
  "services:down": "docker compose down",
  "start": "NODE_ENV=production node .",
  "test": "npm run build:frontend && cross-env TZ=UTC vitest run --coverage",
  "test:unit": "npm run build:frontend && cross-env TZ=UTC vitest run --coverage --project unit",
  "test:integration": "npm run build:frontend && cross-env TZ=UTC vitest run --coverage --project integration",
  "test:watch": "cross-env TZ=UTC vitest",
  "test:debug": "cross-env TZ=UTC vitest --inspect --no-file-parallelism"
}
```

---

## SSR/frontend service with NO backing deps (all external calls mocked).

Same as above but there are no dependency containers, so `local` == `dev` and the
`services:up` / `services:down` scripts are omitted.

```jsonc
{
  "build:frontend": "vite build",
  "dev": "vite build --mode development && npm-run-all2 --parallel frontend:watch server:watch",
  "dev:debug": "vite build --mode development && npm-run-all2 --parallel frontend:watch server:debug",
  "frontend:watch": "vite build --mode development --watch",
  "server:watch": "node --env-file-if-exists=.env --watch --watch-path=./src --watch-path=./.public/assets-manifest.json src/index.js",
  "server:debug": "node --env-file-if-exists=.env --watch --watch-path=./src --watch-path=./.public/assets-manifest.json --inspect src/index.js",
  "docker:build": "docker compose --profile app build",
  "docker:dev": "docker compose --profile app up",
  "lint": "eslint",
  "lint:fix": "eslint --fix",
  "local": "npm run dev",
  "start": "NODE_ENV=production node .",
  "test": "npm run build:frontend && cross-env TZ=UTC vitest run --coverage",
  "test:unit": "npm run build:frontend && cross-env TZ=UTC vitest run --coverage --project unit",
  "test:integration": "npm run build:frontend && cross-env TZ=UTC vitest run --coverage --project integration",
  "test:watch": "cross-env TZ=UTC vitest",
  "test:debug": "cross-env TZ=UTC vitest --inspect --no-file-parallelism"
}
```

---

## engines

Pin to Node 24 to match `.nvmrc`:

```jsonc
"engines": {
  "node": ">=24.0.0"
}
```
