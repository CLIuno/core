---
name: cliuno-matrix
description: Run, debug, and extend the CLIuno frontend×backend compatibility matrix, and consult the shared API contract every template implements. Use this whenever working in the CLIuno workspace on anything API-shaped — adding or changing an endpoint in any backend template (Express, Nest, Fastify, Adonis, Django, FastAPI, Laravel, TallStack, Rails, Spring, ASP.NET, Drogon), changing a frontend's API layer (Vue, React, Solid, Next, Svelte, Nuxt, Angular, Flutter, React Native), adding a new template, investigating why a frontend and backend disagree, or when asked to "run the matrix", "check compatibility", "test the templates against each other", or verify the demo-app contract (auth/users/todos/posts/comments/follows/OTP).
---

# CLIuno compatibility matrix

The CLIuno workspace is one CLI (`core/`) plus framework templates that all implement the
same demo app against one shared REST contract. The matrix proves every frontend works with
every backend by booting each backend for real and driving the full contract flow with the
exact payloads the frontends send.

**The frontends are the source of truth for the contract.** When a backend and a
frontend disagree, fix the backend (or fix all frontends together — never one).
The full contract is in [references/contract.md](references/contract.md); read it before
adding or changing any endpoint. Per-backend boot/DB/test details are in
[references/backends.md](references/backends.md).

## Running the matrix

```bash
cd core
pnpm test:matrix                      # full board: 9 frontends × 12 backends
node scripts/test-matrix.mjs --backends express            # one backend
node scripts/test-matrix.mjs --backends rails --frontends vue --verbose
```

- Backends boot one at a time on port 4310 (`MATRIX_PORT` to override); a built-in SMTP
  sink on 4325 absorbs verification emails so nothing hangs.
- Exit code 0 = every cell passes. The JSON report lands at `core/matrix-report.json`
  (gitignored) with per-step and per-cell detail.
- A healthy run ends with every backend at `flow: N/N steps passed` and a table of `PASS`
  cells. `WARN(n)` means n endpoints exist (probed) but weren't flow-driven; `FAIL(n)`
  means missing endpoints or failed steps — always list them from the report.

## How it works (so you can debug it)

1. **Extraction** — regexes over each frontend's API layer (`src/apis/`, `src/lib/apis/`,
   `composables/`, `src/app/services/`, Flutter's `lib/apis/*.dart`) collect every
   `method + path` it calls. If you add a frontend API file, extraction picks it up
   automatically; template-literal (and Dart `${...}`) params become `:p`.
2. **Flow** — one canonical run per backend: register two users → login → token
   management (check/refresh) → users/todos/posts/comments/follows CRUD → forgot/reset
   password (token read from the DB, then re-login) → email verification → the full OTP
   lifecycle (a real TOTP is computed in-script) → change-password → admin-gated delete →
   cleanup → logout. Response **shapes** are asserted, not just status codes, because the
   frontends destructure exact keys.
3. **Probes** — endpoints a frontend uses that the flow doesn't drive get an unauthenticated
   existence probe (404/405 ⇒ missing, anything else ⇒ exists).
4. **Grading** — a cell fails if any endpoint that frontend uses is missing or its flow
   step failed.

## Debugging a failure

- Re-run just that column: `node scripts/test-matrix.mjs --backends <id> --frontends react --verbose`
  (react has the smallest endpoint set; `--verbose` streams the backend's own stdout).
- Read the report: `node -e "const r=require('./matrix-report.json'); for(const [k,v] of Object.entries(r.backends.<id>.flow)) if(!v.ok) console.log(k, v.status, v.note)"`.
- `no token in response` / `no id` means the status was fine but the **envelope shape**
  is wrong — check the contract's response-shape table.
- Stale local DBs cause unique-constraint noise; each run uses unique users, but deleting
  the backend's sqlite file (see backends reference) gives a clean slate.

## Extending the contract

Adding an endpoint end-to-end:

1. Add it to the contract table in `references/contract.md` — payload and response shape
   modeled on what the frontends will destructure.
2. Add the call to **every** frontend API layer (they must stay identical in surface).
3. Implement it in **every** backend, matching each one's existing envelope helpers.
4. Add a flow step in `runFlow()` in `core/scripts/test-matrix.mjs` — record with
   `okShape("data.<key>")` when frontends read a key, plain `ok2xx` otherwise. Steps that
   need a server-side secret (emailed tokens) read it via the backend's `readToken` hook.
5. Update each backend's own test suite, run it, then run the full matrix to exit 0.

Adding a new backend template: add a registry entry in `BACKENDS` (dir, prepare, start,
env, and `activateUser`/`readToken` hooks if it gates email verification or stores
one-time tokens), implement the whole contract, and run its column until `flow` is full.

## Gotchas that have burned this workspace before

- **pnpm ≥10 build approvals** live in `pnpm-workspace.yaml` (`allowBuilds: pkg: true`) —
  a stub file with placeholder text silently breaks every `pnpm run` and husky hook.
- `unset VIRTUAL_ENV` before `uv run` in Django/FastAPI dirs, or uv warns about a foreign venv.
- Django's `manage.py shell -c` prints an auto-import banner before your output — take the
  last line.
- Express/Nest use TypeORM `synchronize: true` (new entity columns auto-apply); Django needs
  `makemigrations`, Rails a migration, Laravel a migration, FastAPI recreates its isolated
  `matrix-test.db` per run.
- Each template folder is its own git repo; the workspace root is not. Commits use
  conventional messages and no co-author trailers.
