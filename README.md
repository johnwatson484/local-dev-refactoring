# local-dev-refactoring

Reusable playbook and template kit for modernising older Defra Node.js services to a consistent local-development model.

The target model is:

- Host-native dev loop (app runs on host with Node watch mode)
- Docker only for stateful dependencies (Redis/Postgres) in day-to-day local dev
- Testcontainers for integration tests (instead of compose test files)
- Single `compose.yml` with `profiles: ["app"]`
- Consistent Node 24 + npm + lint + VS Code + Dockerfile patterns

This repo is self-contained: copy and adapt from the files here without needing the source repos checked out.

## Contents

- `local-dev-refactoring.md`
	- End-to-end migration playbook (assessment, implementation steps, gotchas, checklists)
- `templates/`
	- Canonical file templates (`Dockerfile`, `compose`, `vitest`, `.vscode`, `.npmrc`, etc.)

## How to run the process

Use this as a Copilot-guided migration workflow.

1. Open the repo you want to modernise in VS Code (or add it to your workspace).
2. Open `local-dev-refactoring.md` from this repo.
3. In Copilot Chat, ask Copilot to apply the playbook to the target repo.
4. Work through the document in order:
	 - Part 1-3: assess current state and choose target shape
	 - Part 4: apply implementation steps
	 - Part 8: complete conversion checklist
	 - Part 9: run verification checklist
5. Copy/adapt files from `templates/` into the target repo as directed.
6. Run target-repo validation commands:
	 - `npm ci`
	 - `npm run lint`
	 - `npm test`

## Suggested Copilot prompt

```text
Use local-dev-refactoring.md as the source of truth. Assess this repo, choose the matching target shape (no-deps / redis / postgres, api / ssr), and implement the migration end-to-end using templates/. Apply all required file updates, dependency changes, and script updates, then run lint/tests and report exactly what changed.
```

## Notes

- Prefer Node native watch (`node --watch`) over nodemon.
- Keep `.env` out of git and images (`.gitignore` and `.dockerignore`).
- Keep Docker support for full-stack orchestration via `--profile app`.
