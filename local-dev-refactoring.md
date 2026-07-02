---
description: "Modernise a Docker-first Node.js service to a host-native inner loop with Testcontainers, Vite, and consistent tooling. Assessment, decision, investigation, and repeatable implementation steps, backed by copy-ready templates."
---

# Local Development Modernisation: Docker-first → Host-native inner loop

Use this playbook to modernise a Node.js service from a **Docker-first** development workflow
(app + tests run inside containers via `docker compose`) to a **host-native inner loop**
(app + tests run directly on the host; only stateful dependencies run in containers), with
consistent tooling (Vite, ESLint/neostandard, Node 24, `.npmrc`/`.nvmrc`, `.vscode`) and
modernised Dockerfiles.

This is a distilled, repeatable playbook based on the migration of the DEFRA FCP services
(MPDP frontend/backend/admin, the Defra ID stub, and the MPDP core orchestration repo).

The goal is that this repo is **self-contained**: you can convert any old-style repo using
only the files here plus the linked PRs — no need to have the reference repos checked out.

## How to use this kit

1. Work through **Part 1–3** to assess the repo and decide the target model.
2. Apply the **Part 4** implementation steps (Steps 1–8 are the host-native/Testcontainers
   mechanics; Steps 9–13 are Docker, Vite, tooling hygiene, ESLint, and health check — these
   are independent and can be applied in any order).
3. Copy canonical files from the [`templates/`](./templates/) folder (the "setup data") and
   adapt the placeholders (service name, ports, DB name). Each template has a header comment
   explaining variants and substitutions.
4. Use the **conversion checklist** (Part 8) to confirm every item is covered, then the
   **verification checklist** (Part 9) to prove it works.

### Template index ([`templates/`](./templates/))

| Concern | Template(s) |
| --- | --- |
| npm / Node | [`.npmrc`](./templates/.npmrc), [`.nvmrc`](./templates/.nvmrc), [`package-scripts.md`](./templates/package-scripts.md) |
| Lint | [`eslint.config.js`](./templates/eslint.config.js) (API + SSR variants) |
| Ignore files | [`.gitignore`](./templates/.gitignore), [`.dockerignore`](./templates/.dockerignore) |
| Env | [`.env.example`](./templates/.env.example) |
| Docker image | [`Dockerfile.api`](./templates/Dockerfile.api), [`Dockerfile.ssr`](./templates/Dockerfile.ssr) |
| Compose | [`compose.no-deps.yml`](./templates/compose.no-deps.yml), [`compose.redis.yml`](./templates/compose.redis.yml), [`compose.postgres.yml`](./templates/compose.postgres.yml) |
| Vite | [`vite.config.js`](./templates/vite.config.js) |
| Vitest | [`vitest.no-deps.config.js`](./templates/vitest.no-deps.config.js), [`vitest.redis.config.js`](./templates/vitest.redis.config.js), [`vitest.postgres.config.js`](./templates/vitest.postgres.config.js) |
| Testcontainers | [`test-setup/global-redis.js`](./templates/test-setup/global-redis.js), [`test-setup/global-db.js`](./templates/test-setup/global-db.js) |
| Health check | [`pulse.js`](./templates/pulse.js) |
| VS Code | [`vscode/launch.json`](./templates/vscode/launch.json), [`vscode/tasks.json`](./templates/vscode/tasks.json), [`vscode/settings.json`](./templates/vscode/settings.json) |
| Orchestration (core) | [`core/my.code-workspace`](./templates/core/my.code-workspace), [`core/clone`](./templates/core/clone), [`core/build`](./templates/core/build), [`core/start`](./templates/core/start), [`core/stop`](./templates/core/stop), [`core/seed`](./templates/core/seed) |

## Reference pull requests (fetch for concrete context)

Fetch these with the GitHub tools when you need real before/after examples. The **Defra ID
stub PR #55** is the most complete single example — it combines the host-native shift with
the Webpack→Vite migration and all the tooling hygiene (husky/postcss/sonarlint removal,
`.npmrc`/`.nvmrc`, ESLint `curly`, Dockerfile modernisation). The four MPDP PRs cover the
host-native + Testcontainers mechanics per dependency shape.

- **fcp-defra-id-stub** (⭐ most complete: Webpack→Vite + tooling hygiene + Dockerfile + host-native): https://github.com/DEFRA/fcp-defra-id-stub/pull/55
- **fcp-mpdp-frontend** (no dependencies, Plan A only): https://github.com/DEFRA/fcp-mpdp-frontend/pull/73
- **fcp-mpdp-backend** (Postgres + Liquibase via Testcontainers): https://github.com/DEFRA/fcp-mpdp-backend/pull/41
- **fcp-mpdp-admin** (Redis + OIDC via Testcontainers): https://github.com/DEFRA/fcp-mpdp-admin/pull/30
- **fcp-mpdp-core** (orchestration repo, compose profiles): https://github.com/DEFRA/fcp-mpdp-core/pull/12

---

## Part 1 — Assessment: why move away from Docker-first

Symptoms of a Docker-first inner loop that this refactor solves:

- **Slow feedback**: every code change triggers a container rebuild or bind-mount sync;
  test runs go through `docker compose run`, adding image build + startup latency.
- **Debugging friction**: attaching a debugger means remote-attach over an exposed inspector
  port (`0.0.0.0:9229`), fragile source maps, and `localRoot`/`remoteRoot` mapping.
- **Config duplication**: multiple compose files (`compose.yml`, `compose.override.yml`,
  `compose.test.yml`, `compose.test.watch.yml`, `compose.test.debug.yml`) drift out of sync.
- **CI mismatch**: CI runs `npm run docker:test` — a different code path from what a
  developer runs locally, so "works on my machine" gaps appear.
- **Environment coupling**: hardcoded service hostnames (`postgres`, `redis`, backend URLs)
  bleed into test/dev config, making standalone single-service work impossible.

## Part 2 — Decision: the target model

Two complementary shifts:

- **Plan A — host-native inner loop.** The app and its tests run on the host (Node directly).
  Only stateful backing services (Postgres, Redis) run in containers, started with a simple
  `docker compose up -d`. Debug via a normal local launch config (inspector on `127.0.0.1`).
- **Plan B — Testcontainers for integration tests.** Where a test needs real infrastructure,
  spin it up programmatically inside the test process (`testcontainers`) so `npm test` is
  self-contained and identical locally and in CI. No manual `services:up` needed for tests.

Guiding principles:

- `npm run dev` runs on the host with hot reload. `npm run local` = `services:up && dev`.
- `npm test` runs both unit and integration on the host; integration uses Testcontainers.
- One `compose.yml` per repo. The **app** service is behind a `profiles: ["app"]` gate so
  `docker compose up -d` starts **dependencies only**; `--profile app` starts the full stack.
- Deployed environments are untouched: use `node --env-file-if-exists=.env` so a missing
  `.env` is a no-op and real platform env vars always win.
- Do NOT create a shared cross-repo package. Keep each repo independent; keep configs
  copy-consistent instead of coupling them.

### Why Redis (not in-memory cache) for local development

For services that use a session cache (e.g. `@hapi/catbox-redis`), **keep Redis running in a
container for local dev** via `npm run services:up`. Do not switch to `@hapi/catbox-memory`
locally.

Reason: the app uses `node --watch` for hot reload. An in-memory cache lives inside the Node
process — it is lost on every file-save restart, which means every code change logs you out.
Redis is external to the process so sessions survive restarts.

The `@hapi/catbox-memory` adapter is only used in **tests**, where it is auto-mocked by
Vitest. It never runs in local dev or production.

`@hapi/catbox-redis` in single-node mode (i.e. not cluster/sentinel) requires
`USE_SINGLE_INSTANCE_CACHE=true` in the environment. Set this in:
- `.env.example` (and your local `.env`)
- `sharedEnv` in `vitest.config.js` (so tests that boot the server see it)
- Inside `globalSetup` alongside `REDIS_HOST`/`REDIS_PORT` (so the Testcontainers Redis
  session is also treated as a single node)

## Part 3 — Investigation: assess the repo before changing anything

Run these checks first (adapt tools to what's available):

1. **Runtime & config**: confirm Node version (`.nvmrc`, `engines`), config library
   (Convict/dotenv), and how env vars are read. Note any config that validates at import
   time (Convict does) — missing vars will hard-crash at startup.
2. **Dependencies**: does the service use a real datastore?
   - No datastore, all external calls mocked → **Plan A only** (like frontend).
   - Real Postgres/MySQL + migrations → **Testcontainers** for the DB + migration runner.
   - Real Redis/cache → **Testcontainers** for the cache.
3. **Existing compose files**: list every `compose*.yml`. Identify which define the app vs
   dependencies, and which are test-only (candidates for deletion).
4. **Test setup**: read `vitest.config.js`/`jest.config.js`. Note `globalSetup`,
   `setupFiles`, and any env injected by compose today (it must move into test config).
5. **npm scripts**: catalogue `docker:*`, `test*`, `dev*`, `start` scripts.
6. **CI workflows**: find where `docker:test` (or similar) runs. Note whether the workflow
   sets up Node (`actions/setup-node`) — it will need to for host-native tests.
7. **`.npmrc`**: check for `ignore-scripts=true` — this **disables npm lifecycle hooks**
   (`pretest`, `postversion`, etc.). Any build step relied on via `pretest` will silently
   not run. See Part 6.
8. **VS Code**: read `.vscode/launch.json` for attach-to-container configs to replace.

## Part 4 — Implementation steps (per service repo)

Order matters; later steps depend on earlier ones.

### Step 1 — Environment loading (no new deps)

- Use `node --env-file-if-exists=.env` in dev/start scripts and the VS Code launch config.
  Use the **`-if-exists` variant** (not `--env-file`): a missing file is silently skipped so
  the app boots fine in deployed environments where no `.env` is present. Real platform env
  vars always win over file values.
- Commit a `.env.example`; add `.env` to `.gitignore` and `.dockerignore`.
- Never rely on `.env` in tests — inject test env via test config (Step 3).
- Remove any `postversion` script: `.npmrc` `ignore-scripts=true` means it never runs, and
  versioning in CDP is done via git tags (`anothrNick/github-tag-action`), not `npm version`.

### Step 2 — npm scripts (final surface)

Target this script set (backend has no `build:frontend`):

```jsonc
"dev": "…host watch with --env-file-if-exists=.env",
"dev:debug": "…same + --inspect (binds 127.0.0.1)",
"local": "npm run services:up && npm run dev",
"services:up": "docker compose up -d",              // deps only (app is profiled)
"services:down": "docker compose down",
"start": "NODE_ENV=production node .",
"test": "cross-env TZ=UTC vitest run --coverage",
"test:unit": "cross-env TZ=UTC vitest run --coverage --project unit",
"test:integration": "cross-env TZ=UTC vitest run --coverage --project integration",
"test:watch": "cross-env TZ=UTC vitest",
"test:debug": "cross-env TZ=UTC vitest --inspect --no-file-parallelism",
"docker:build": "docker compose --profile app build",   // keep for together/journey
"docker:dev": "docker compose --profile app up"         // keep for together/journey
```

- **DROP** `docker:test`, `docker:test:watch`, `docker:test:debug`.
- Add `cross-env` as a devDependency (cross-platform `TZ=UTC`).
- **Frontend/SSR apps with a Vite/asset build**: because `.npmrc` has `ignore-scripts=true`,
  `pretest` hooks DO NOT run. Inline the build in the test scripts instead:
  `"test": "npm run build:frontend && cross-env TZ=UTC vitest run --coverage"` (and the same
  prefix on `test:unit`/`test:integration`). Do NOT use a `pretest` hook.

### Step 3 — Split Vitest into unit + integration projects

- Define a `sharedEnv` object with all non-secret dummy env values the app needs to boot
  under Convict validation (e.g. `NODE_ENV: 'test'`, backend URL, OIDC dummies, cookie
  password ≥ required length). This replaces env previously provided by `compose.test.yml`.
- Use two `projects`:
  - `unit`: `include: ['test/unit/**/*.test.js']`, `env: sharedEnv` (plus any pinned values
    to prevent leakage — see Part 6), no `globalSetup`.
  - `integration`: `include: ['test/integration/**/*.test.js']`, `env: sharedEnv`,
    `globalSetup: ['./test/setup/global-<dep>.js']`.
- Set `clearMocks: true` at BOTH the top level and inside each project.
- Coverage: `include: ['src/**/*.js']`, `reportsDirectory: './coverage'`,
  `reporter: ['text', 'lcov']`, `clean: false`.

### Step 4 — Testcontainers globalSetup (only if a real datastore exists)

- Add devDeps: `testcontainers` (+ `@testcontainers/postgresql` for Postgres).
- **Redis pattern** (`test/setup/global-redis.js`): start `GenericContainer('redis')`,
  `withExposedPorts(6379)`, `Wait.forLogMessage('Ready to accept connections')`; set
  `process.env.REDIS_HOST`/`REDIS_PORT` from the mapped port; also set
  `process.env.USE_SINGLE_INSTANCE_CACHE = 'true'` — this is required to tell
  `@hapi/catbox-redis` it is talking to a plain single Redis node rather than a cluster or
  sentinel setup. Without it the client attempts cluster handshake and the connection fails.
  Return a teardown that stops the container.

  ```js
  // test/setup/global-redis.js
  import { GenericContainer, Wait } from 'testcontainers'

  export async function setup () {
    const redis = await new GenericContainer('redis')
      .withExposedPorts(6379)
      .withWaitStrategy(Wait.forLogMessage('Ready to accept connections'))
      .start()

    process.env.REDIS_HOST = redis.getHost()
    process.env.REDIS_PORT = String(redis.getMappedPort(6379))
    process.env.USE_SINGLE_INSTANCE_CACHE = 'true'
    process.env.NODE_ENV = 'test'

    return async function teardown () {
      await redis.stop()
    }
  }
  ```

- **Postgres + Liquibase pattern** (`test/setup/global-db.js`): create a `Network`, start
  `PostgreSqlContainer` with a network alias `postgres`, then run a one-shot
  `GenericContainer('liquibase/liquibase:4')` on the same network with the changelog dir
  bind-mounted and `Wait.forOneShotStartup()` (the Liquibase container exits after `update`).
  Set `POSTGRES_HOST`/`PORT`/`USER`/`PASSWORD`/`DB` and `POSTGRES_GET_TOKEN_FROM_RDS=false`
  from the mapped values; teardown stops the container and network.

  ```js
  // test/setup/global-db.js
  import { resolve } from 'node:path'
  import { PostgreSqlContainer } from '@testcontainers/postgresql'
  import { GenericContainer, Network, Wait } from 'testcontainers'

  const DB_NAME = 'my_db'
  const DB_USER = 'postgres'
  const DB_PASSWORD = 'postgres'

  export async function setup () {
    const network = await new Network().start()

    const postgres = await new PostgreSqlContainer('postgres:16.6')
      .withNetwork(network)
      .withNetworkAliases('postgres')
      .withDatabase(DB_NAME)
      .withUsername(DB_USER)
      .withPassword(DB_PASSWORD)
      .start()

    const changelogPath = resolve(process.cwd(), 'changelog')

    await new GenericContainer('liquibase/liquibase:4')
      .withNetwork(network)
      .withBindMounts([{ source: changelogPath, target: '/liquibase/changelog' }])
      .withCommand([
        `--url=jdbc:postgresql://postgres:5432/${DB_NAME}`,
        `--username=${DB_USER}`,
        `--password=${DB_PASSWORD}`,
        '--changelog-file=changelog/db.changelog.xml',
        'update'
      ])
      .withWaitStrategy(Wait.forOneShotStartup())
      .start()

    process.env.POSTGRES_HOST = postgres.getHost()
    process.env.POSTGRES_HOST_READ = postgres.getHost()
    process.env.POSTGRES_PORT = String(postgres.getMappedPort(5432))
    process.env.POSTGRES_USER = DB_USER
    process.env.POSTGRES_PASSWORD = DB_PASSWORD
    process.env.POSTGRES_DB = DB_NAME
    process.env.POSTGRES_GET_TOKEN_FROM_RDS = 'false'
    process.env.NODE_ENV = 'test'

    return async function teardown () {
      await postgres.stop()
      await network.stop()
    }
  }
  ```

- Tests need Docker running but NO `services:up`.

### Step 5 — Consolidate compose.yml (profiles + env_file)

**Merge and delete `compose.override.yml`.**
Docker auto-loads `compose.override.yml` whenever it is present — it is not opt-in. Before
this refactor, override files were used to add ports and networks on top of a minimal
`compose.yml`. Now that everything lives in one file, the override file must be deleted, not
just emptied. If you only merge the content and leave the file in place (even blank) it will
still be silently picked up and can cause surprising behaviour.

Also delete all test-only compose variants (`compose.test.yml`, `compose.test.watch.yml`,
`compose.test.debug.yml`). They are replaced by Testcontainers (Step 4).

**Profile the app service.** Put `profiles: ["app"]` on the app service only; leave
dependency services at the default profile:

```
docker compose up -d               # starts deps only — use for npm run services:up
docker compose --profile app up -d # starts the full stack — used by the orchestration repo
```

**Two-layer env pattern for the Docker app service.** Use `env_file` for developer-supplied
credentials and `environment` to override Docker-internal hostnames:

```yaml
services:
  my-app:
    profiles: ["app"]
    env_file:
      - .env                         # picks up REDIS_HOST=localhost, API keys, etc. from dev
    environment:
      REDIS_HOST: redis              # override: inside Docker the dep is on its service name
      MY_BACKEND_ENDPOINT: http://my-backend:3001
```

The `environment` block takes precedence over `env_file`, so `.env` values flow in for
everything except the values that must be Docker-internal hostnames. This removes the old
pattern of duplicating every variable in both `compose.yml` and `compose.override.yml`.

The `.env` file (gitignored) sets hostnames for host-native dev (e.g. `REDIS_HOST=localhost`,
`MY_BACKEND_ENDPOINT=http://localhost:3001`). The `environment` block overrides those
values when running inside Docker so inter-container traffic routes correctly.

**Dependency healthchecks.** Give each dependency service a `healthcheck` and make the app
`depends_on` it with `condition: service_healthy`. Without this, the app can start before
Postgres/Redis is ready and fail with a connection error:

```yaml
  redis:
    image: redis
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 10s
      timeout: 3s
      retries: 5
```

**Shared bridge network.** Define a named bridge network so all services can reach each other
when started together by the orchestration repo:

```yaml
networks:
  fcp-mpdp:
    driver: bridge
    name: fcp-mpdp
```

### Step 6 — VS Code (`.vscode/`) — launch, tasks, settings

Commit all three files. `.gitignore` should ignore `.vscode/*` EXCEPT `launch.json` and
`tasks.json` (see [`templates/.gitignore`](./templates/.gitignore)). Copy from
[`templates/vscode/`](./templates/vscode/).

- **`launch.json`** ([template](./templates/vscode/launch.json)):
  - **Dev: run server** — `type: node`, `request: launch`, `runtimeArgs` include
    `--env-file-if-exists=.env`, `--watch`, `--watch-path=./src`, `--inspect`;
    `program: ${workspaceFolder}/src/index.js`. For SSR repos add a second
    `--watch-path=./.public/assets-manifest.json` so the server restarts when Vite rebuilds.
  - **Debug current test** — launch `node_modules/.bin/vitest` with
    `["run", "--inspect", "--no-file-parallelism", "${relativeFile}"]`,
    `env: { TZ: "UTC", NODE_ENV: "test" }`.
  - Keep ONE **Docker: Attach to App (together)** attach config for debugging inside the
    orchestrated stack. Use a UNIQUE debug port per service so several can be attached at
    once (MPDP uses 9000 frontend / 9001 backend / 9002 admin, mapped to the container's
    9229 in `compose.yml`).
- **`tasks.json`** ([template](./templates/vscode/tasks.json)): npm tasks for `dev`, `test`,
  `test:watch`, `docker:dev`, and — for repos with dependency containers — `services:up` /
  `services:down`. OMIT the Services tasks for no-dependency repos. Every repo MUST have a
  `tasks.json` (a common omission — the Defra ID stub was missing one).
- **`settings.json`** ([template](./templates/vscode/settings.json)): sets the SonarLint
  connected-mode `projectKey`. It MUST match the repo's own SonarCloud key
  (`DEFRA_<repo-name>`) — the Defra ID stub had it wrongly pointing at
  `DEFRA_fcp-mpdp-frontend`. (This replaces the old `.sonarlint/connectedMode.json` file;
  see Step 11.)

### Step 7 — CI workflows

- In `check-pull-request.yml` and `publish.yml`, replace `npm run docker:test` with host-native
  `npm ci` + `npm run lint` + `npm test`.
- Add `actions/setup-node` pinned to a full commit SHA (supply-chain hygiene), e.g.
  `actions/setup-node@<40-char-sha> # v4`, with the Node version from `.nvmrc`.
- GitHub-hosted `ubuntu-latest` runners have a Docker daemon, so Testcontainers works in CI.
- Keep the Docker image build/publish steps for the deploy artifact.

### Step 8 — Docs

- README: newcomer path = `nvm use && npm install` → `cp .env.example .env` →
  `npm run local` (dev) and `npm test` (tests; only Docker running required). State clearly
  which dependencies (if any) run in containers.
- `.github/copilot-instructions.md`: correct the bundler name (e.g. Vite, not Webpack), the
  CI command (`npm test`, not `docker:test`), and cache/session notes (e.g. Redis is used in
  local dev via `services:up`; in-memory cache is a TEST-only mock).

### Step 9 — Dockerfile modernisation

Bring the Dockerfile in line with the current Defra pattern. Copy
[`templates/Dockerfile.api`](./templates/Dockerfile.api) (API-only, 2-stage) or
[`templates/Dockerfile.ssr`](./templates/Dockerfile.ssr) (SSR/frontend with a Vite build,
3-stage). Apply ALL of the following:

- **Bump the Defra base image** to the current version:
  `ARG PARENT_VERSION=3.1.1-node24.18.0` (used for both `defradigital/node-development` and
  `defradigital/node`). Pin the version — never `latest`.
- **Remove `LABEL` lines** (e.g. `LABEL uk.gov.defra.ffc.parent-image=...`) — and the
  `ARG PARENT_VERSION` re-declarations inside stages that only existed to feed them.
- **Use `npm ci`**, not `npm install`, in every stage (`npm ci --omit=dev` in production).
- **Dev stage**: keep `COPY --chown=node:node package*.json ./` and
  `COPY --chown=node:node . .`, but **drop the `--chmod=755`** flag that old Dockerfiles added.
- **Production stage**: copy artefacts with `--chown=root:root`, then
  `RUN chmod -R a-w /home/node` to remove write permissions, then `USER node`.
- **Structure**: API-only = 2 stages (`development` → `production`); SSR = 3 stages
  (`development` → `production_build` (runs `npm run build:frontend`) → `production`, which
  also copies `.public/`).
- **CDP health check**: keep `USER root` + `RUN apk add --no-cache curl` in production.
- Set `ENV TZ="Europe/London"`, the `PORT`/`PORT_DEBUG` args, and `EXPOSE`.

### Step 10 — Vite (and Webpack → Vite migration)

For any SSR service that bundles client assets. If the repo still uses Webpack, migrate it;
if it has no bundler, add Vite. Copy [`templates/vite.config.js`](./templates/vite.config.js).

- **Add** `vite`, `sass`, and (if used) `npm-run-all2` as devDeps; **remove** all Webpack
  devDeps (`webpack`, `webpack-cli`, loaders, plugins) and delete `webpack.config.js`.
- **`vite.config.js`**: `root: 'src/client'`, build `outDir: '.public'`, `manifest:
  'assets-manifest.json'`, entry `src/client/javascripts/application.js`. Use the canonical
  `javascripts/` (plural) folder naming (some old repos used `javascript/` singular —
  standardise to plural). A `copy-static-assets` plugin copies govuk-frontend fonts/images
  and your own images into `.public/assets`.
- **SCSS**: import your main SCSS from `application.js` so Vite bundles the CSS. Use sass's
  `NodePackageImporter` so `@use "govuk-frontend"` resolves from node_modules (no more
  Webpack `sass-loader`/`resolve-url-loader` config).
- **Nunjucks manifest reader**: update the code that maps logical asset names to hashed
  filenames to read the **Vite** manifest format (an entry chunk marked `isEntry: true`
  with a `css` array), NOT the old flat Webpack manifest. This is the step most likely to
  cause 404s if missed.
- **npm scripts**: use the SSR script set from
  [`templates/package-scripts.md`](./templates/package-scripts.md) — `build:frontend`,
  `frontend:watch`, and a `dev` that runs `vite build --mode development` once (so the
  manifest exists on a fresh clone) then `npm-run-all2 --parallel frontend:watch server:watch`.
- **Remove PostCSS**: delete `postcss.config.js` and any `postcss*` devDeps — Vite/Lightning
  CSS handles this. (Leave the `postcss.config.js` entry in the vitest coverage `exclude`
  list only if the file still exists; otherwise drop it.)

### Step 11 — Tooling hygiene & baseline files

- **`.nvmrc`** = `24` (copy [`templates/.nvmrc`](./templates/.nvmrc)); set
  `"engines": { "node": ">=24.0.0" }` in `package.json` to match. Standardise a stray higher
  floor (e.g. `>=24.12.0`) down to `>=24.0.0`.
- **`.npmrc`** ([template](./templates/.npmrc)) with exactly:
  `save-exact=true`, `ignore-scripts=true`, `min-release-age=7`. Remember `ignore-scripts=true`
  disables all lifecycle hooks (`pretest`/`postversion`/`prepare`) — see Step 2 and Part 6.
- **Remove Husky**: delete the `.husky/` directory, the `husky` devDep, the `prepare`
  (or `postinstall`) script that installs it, and any `git:pre-commit-hook` script. Husky's
  install hook can't run under `ignore-scripts=true` anyway.
- **Remove `postversion`** (and any `prepare`) script — dead code under `ignore-scripts=true`;
  CDP versioning uses git tags via `anothrNick/github-tag-action`.
- **Remove `.sonarlint/`**: delete the `.sonarlint/connectedMode.json` file, add `.sonarlint/`
  to `.gitignore`, and move the project key into `.vscode/settings.json` (Step 6).
- **`.gitignore`** ([template](./templates/.gitignore)) and **`.dockerignore`**
  ([template](./templates/.dockerignore)): ensure `.env` is ignored in both; `.public` is
  ignored for SSR repos (omit for API-only); `.dockerignore` also excludes `node_modules`,
  `Dockerfile`, `coverage`, and `**/*.test.js`.
- **Replace nodemon with native watch**: remove the `nodemon` devDep and any `nodemon.json`;
  use `node --watch --watch-path=./src` in the dev scripts (already in Step 2).

### Step 12 — ESLint (neostandard + `curly`)

Copy [`templates/eslint.config.js`](./templates/eslint.config.js). Use `neostandard` as the
base and add `curly: ['error', 'all']` so every `if`/`else`/`for`/`while` body uses braces,
even single-line — this is NOT neostandard's default and is the house style. SSR repos add
`ignores: ['.public/**']` so lint skips bundled output. Run `npm run lint:fix` after
converting. (Remove any legacy `.eslintrc*` / StandardJS / Prettier configs being replaced.)

### Step 13 — Health check (hapi-pulse) dev timeout

Set the graceful-shutdown timeout to **1s in dev / 10s in production** so `node --watch`
restarts are snappy locally while production still drains in-flight requests. See
[`templates/pulse.js`](./templates/pulse.js): `timeout: config.get('isDevelopment') ? 1000 : 10000`.

## Part 5 — Orchestration (core) repo changes

If several services are launched together by a "core"/orchestration repo (create one modelled
on MPDP core if you don't have it). Copy the templates from [`templates/core/`](./templates/core/)
and rename `my-*` to your services.

**Purpose.** The core repo is NOT deployable — it is local-dev tooling only. It clones the
sibling services, builds images, runs dependency containers (and optionally the full app
stack), seeds the database, opens the VS Code workspace, and launches journey/performance
suites.

**Multi-root VS Code workspace** ([template](./templates/core/my.code-workspace)). Commit a
`*.code-workspace` that lists each service + the core repo as folders, and defines tasks:

- One `Local: <Service>` task per app running `npm run local` in that folder
  (`isBackground: true`, dedicated panel).
- A compound `Local: Start all` task with
  `"dependsOn": [...], "dependsOrder": "parallel"` that runs every app host-native at once.
- A `Local: Seed` task that runs `./seed` in the core repo.

Newcomer path: `code my.code-workspace` → `Ctrl+Shift+P` → Tasks: Run Task →
**Local: Start all**. Each app brings up its own dependency containers via `npm run local`.

**Shell scripts** (default = host-native; `--docker` = full Docker stack):

- [`clone`](./templates/core/clone) — clone each sibling repo (skip if present).
- [`build`](./templates/core/build) — `docker compose --profile app build` per service.
- [`start`](./templates/core/start) — host-native default (ensures deps + prints the workspace
  task instruction); `--docker` starts the FULL stack per service via
  `docker compose --profile app up -d`; `-s`/`--seed` seeds. The app profile is required
  because each app service is gated behind `profiles: ["app"]`.
- [`stop`](./templates/core/stop) — default stops dependency containers only;
  `--docker` runs `docker compose --profile app down` per service (pass `-v` to drop volumes).
- [`seed`](./templates/core/seed) — host-native by default; `--docker` resolves the running
  container via a compose lookup `docker compose ps -q <svc>` (NEVER hardcode a container
  name) and execs the seed inside it.

- Update the core README: list every orchestrated repo; add a note that each repo now
  supports STANDALONE host-native dev via `npm run local`, and clarify that the core repo is
  for full-system orchestration, database seeding, and journey/performance test suites.
- Keep `.nvmrc` / nvm as the Node version manager story; no corepack/mise required.

## Part 6 — Gotchas we hit (and the fixes)

1. **`ignore-scripts=true` disables lifecycle hooks.** `pretest` never runs, so a Vite build
   relied upon by static-file tests is skipped → 404s in CI. FIX: inline the build in the
   test script (`npm run build:frontend && vitest ...`). Do NOT use a `pretest` hook.
2. **`postversion` is dead code.** Same root cause: `ignore-scripts=true` blocks
   `postversion` from ever running. Additionally, CDP versioning uses git tags via
   `anothrNick/github-tag-action`, not `npm version`. Remove the script entirely.
3. **Testcontainers ports leaking between projects.** The integration `globalSetup` sets
   `REDIS_HOST`/`REDIS_PORT` in `process.env`; unit tests running in the same invocation can
   inherit them if Vitest reuses the process. FIX: pin `REDIS_HOST: 'redis', REDIS_PORT: '6379'`
   explicitly in the unit project's `env` block so unit assertions are always deterministic
   regardless of invocation order.
4. **`USE_SINGLE_INSTANCE_CACHE` missing in tests.** `@hapi/catbox-redis` tries cluster
   handshake by default. FIX: set `USE_SINGLE_INSTANCE_CACHE: 'true'` in both `sharedEnv`
   (vitest config) and inside the `globalSetup` `process.env` assignment.
5. **Convict validates at import.** A required var with `default: null` and `nullable: true`
   passes validation but crashes at runtime when used. Ensure every var the app touches on
   boot is in `sharedEnv` (tests) and `.env.example` (dev).
6. **OIDC/bell redirect assertions.** Auth integration tests asserting the `redirect_uri`
   need the exact `ENTRA_REDIRECT_URL` in `sharedEnv`, or bell computes a different location
   and your assertions fail on the redirect URL mismatch.
7. **Missing `clearMocks` per project.** Setting it only at the top level isn't enough with
   `projects`; set `clearMocks: true` inside each project block too.
8. **`compose.override.yml` must be deleted, not just emptied.** Docker auto-loads it if the
   file exists. Merge its content into `compose.yml`, then `git rm` the file. If you only
   empty it, it will still be present on disk and will be silently applied by Docker on the
   next `docker compose up`.
9. **Webpack → Vite manifest format.** Vite's `assets-manifest.json` is NOT the old flat
   Webpack manifest. The Nunjucks asset-path helper must read the Vite format (entry chunk
   with `isEntry: true` and a `css` array) or every hashed asset 404s. Update that helper as
   part of the migration.
10. **Base image drift.** Old Dockerfiles pin an older `PARENT_VERSION` and carry `LABEL`
    lines + `ARG PARENT_VERSION` re-declarations per stage. Bump to `3.1.1-node24.18.0`,
    delete the labels, and don't `npm install` (use `npm ci`).
11. **`--chmod=755` in the dev COPY.** Old Dockerfiles used
    `COPY --chown=node:node --chmod=755 ...`. Keep the `--chown=node:node` but drop
    `--chmod=755`; production copies with `--chown=root:root` then `chmod -R a-w /home/node`.
12. **SonarLint project key copy-paste.** When adding `.vscode/settings.json`, set the
    `projectKey` to THIS repo's key (`DEFRA_<repo-name>`). A copied file pointing at another
    repo's key silently binds SonarLint to the wrong project.

## Part 8 — Conversion checklist (per-item)

Tick each item as you convert a repo. Skip rows that don't apply (e.g. Vite/Postgres).

- [ ] **npm scripts** standardised to the target surface (Step 2 / [`package-scripts.md`](./templates/package-scripts.md)); `docker:test*` dropped.
- [ ] **Env loading** via `node --env-file-if-exists=.env`; `.env.example` committed; `.env` gitignored + dockerignored (Step 1 / [`.env.example`](./templates/.env.example)).
- [ ] **Single `compose.yml`**; `compose.override.yml` + `compose.test*.yml` deleted; app behind `profiles: ["app"]`; env_file + environment override pattern; healthchecks; named network (Step 5).
- [ ] **Docker `--profile app`** still works for together/journey mode.
- [ ] **Vite** in place / migrated from Webpack; PostCSS removed (Step 10 / [`vite.config.js`](./templates/vite.config.js)).
- [ ] **Testcontainers** for integration (no compose test files) (Step 4 / [`test-setup/`](./templates/test-setup/)).
- [ ] **Node 24**: `.nvmrc` = `24`, `engines >=24.0.0` (Step 11 / [`.nvmrc`](./templates/.nvmrc)).
- [ ] **`.npmrc`** = save-exact/ignore-scripts/min-release-age ([`.npmrc`](./templates/.npmrc)).
- [ ] **Husky removed** (`.husky/` + devDep + prepare/postinstall + `git:pre-commit-hook`).
- [ ] **`postversion` removed**.
- [ ] **`.sonarlint/` removed** + gitignored; key moved to `.vscode/settings.json` (Step 6/11).
- [ ] **`.vscode/`** has launch.json + tasks.json + settings.json (Step 6 / [`vscode/`](./templates/vscode/)).
- [ ] **nodemon replaced** by `node --watch`.
- [ ] **ESLint** = neostandard + `curly: ['error','all']` (Step 12 / [`eslint.config.js`](./templates/eslint.config.js)).
- [ ] **`.gitignore` / `.dockerignore`** correct (Step 11).
- [ ] **Dockerfile** modernised: base `3.1.1-node24.18.0`, no LABELs, `npm ci`, dev keeps `--chown` (no `--chmod`), prod `--chown=root:root` + `chmod -R a-w` + `USER node` (Step 9 / [`Dockerfile.api`](./templates/Dockerfile.api) / [`Dockerfile.ssr`](./templates/Dockerfile.ssr)).
- [ ] **hapi-pulse** dev timeout 1s / prod 10s (Step 13 / [`pulse.js`](./templates/pulse.js)).
- [ ] **Dependencies**: added (`cross-env`, `vite`, `sass`, `npm-run-all2`, `testcontainers`, `@testcontainers/postgresql` as needed); removed (`nodemon`, `husky`, `webpack*`, `postcss*`).
- [ ] **CI** runs host-native `npm ci && npm run lint && npm test` (Step 7).
- [ ] **README + copilot-instructions** updated (Step 8).
- [ ] **Orchestration (core)** repo updated / created if applicable (Part 5 / [`core/`](./templates/core/)).

## Part 9 — Verification checklist

- [ ] `npm ci && npm run lint && npm test` is green on the host (Docker running); coverage in
      `./coverage/lcov.info`.
- [ ] `npm run test:unit` passes with NO containers started.
- [ ] `npm run test:integration` starts Testcontainers, runs migrations (if any), passes.
- [ ] `npm run local` starts deps + app; app reachable on its port; sessions/data persist
      across a `--watch` restart (save a file).
- [ ] `docker compose up -d` starts DEPENDENCIES ONLY; `docker compose --profile app up -d`
      starts the full stack.
- [ ] VS Code "Debug current test" hits a breakpoint.
- [ ] Orchestration repo `./start -s` brings up all services (via `--profile app`) + seeds;
      cross-service calls work.
- [ ] CI runs host-native tests + Testcontainers and Sonar reads coverage.
- [ ] `node --env-file-if-exists=.env` with NO `.env` present boots fine (simulates deploy).
