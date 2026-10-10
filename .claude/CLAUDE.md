# CLIuno core (the `cliuno` CLI)

TypeScript CLI that scaffolds full-stack apps by cloning the CLIuno templates and running
each stack's install (npm/pnpm/…, composer, uv, bundler), generates resources inside a
scaffolded project (`cliuno make:*`), and ships the Claude skills (`cliuno skills`).
Published to npm as `cliuno`; the repo is also a Claude Code plugin marketplace.

## Commands

```bash
pnpm dev             # run the CLI from source (tsx) — e.g. pnpm dev make:resource Post --dry-run
pnpm build           # tsup → dist/app.js (ESM-only; prebuild stamps versions into skills/ + plugin.json)
pnpm test            # node:test unit tests (src/**/*.test.ts)
pnpm lint / lintfix  # oxlint
pnpm fmt / fmt:check # oxfmt
pnpm test:matrix     # frontend×backend compatibility matrix (see below)
node scripts/test-generators.mjs [--only express,react]   # generate a resource in every local template + run its gates
pnpm release         # build + changeset publish
```

## Layout

- `src/app.ts` — entry: `parseArgv` → `help|version|doctor|make|skills|scaffold`.
- `src/cli/argv.ts` — tiny argv parser (`make:<kind> <Name> --fields … --dry-run --force`).
- `src/commands/scaffold.ts` — the interactive menus (unchanged behaviour); `make.ts`,
  `skills.ts` — the new commands.
- `src/generators/` — `names.ts` (casing + plural), `fields.ts` (`a:string,b:int?` DSL),
  `detect.ts` (manifest probes → `StackId`), `types.ts` (`Generator`/`Command`/`Patch`),
  `engine.ts` (native-vs-stub decision, write/patch with `--force`/`--dry-run`,
  idempotent patches, optional post-write formatter), `stacks/<id>.ts` one module per
  stack (stubs mirror that template's `todo` resource), `stacks/index.ts` registry.
- `src/utils/questions.ts` + `src/utils/links.ts` — menu choices ↔ template repo URLs.
  **These two must stay in sync**: every menu value needs a links entry.
- `src/utils/GitHandler.ts` — clone + per-stack install commands; `src/utils/doctor.ts`.
- `skills/` — the packaged Claude skills (`cliuno-scaffold`, `cliuno-make`, `cliuno-matrix`);
  `.claude/skills/*` are symlinks to them so they load while working in this workspace.
  `.claude-plugin/{marketplace,plugin}.json` — Claude Code plugin manifests
  (`claude plugin validate . --strict` must pass).
- `scripts/test-matrix.mjs` — the compatibility matrix (zero-dep Node ≥18). Full guide:
  `skills/cliuno-matrix/SKILL.md`.
- `scripts/test-generators.mjs` — generates a resource in a throw-away git worktree of
  every local template and runs that stack's typecheck/lint/tests.

## Adding or changing a generator

1. Read the template's `todo` files (router/controller/entity or api/view) — stubs must
   mirror their imports, helpers, envelope and formatting exactly.
2. Edit `src/generators/stacks/<id>.ts`; keep `resource` as the full vertical slice and
   make single-file kinds delegate to the framework CLI via `native` when one exists.
3. `pnpm test` (the render test covers every registered stack), then
   `node scripts/test-generators.mjs --only <id>`.
4. Update `skills/cliuno-make/references/stacks.md`.

## Conventions

- oxc-only tooling (oxlint + oxfmt, 4-space, double quotes here — this repo's own style).
  Generated template code uses the template's style (4-space, `semi: false`, single quotes).
- Conventional commits (commitlint via husky); no co-author trailers.
- husky pre-commit runs lint-staged; if `pnpm` suddenly fails with IGNORED_BUILDS, fix
  `pnpm-workspace.yaml` `allowBuilds` — don't bypass hooks.
- The matrix must exit 0 before releasing template-facing changes.
