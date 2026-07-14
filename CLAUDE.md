# CLIuno core (the `cliuno` CLI)

TypeScript CLI that scaffolds full-stack apps by cloning the CLIuno templates and running
each stack's install (npm/pnpm/…, composer, uv, bundler). Published to npm as `cliuno`.

## Commands

```bash
pnpm dev             # run the CLI from source (tsx)
pnpm build           # tsup → dist/app.js (ESM-only; CJS is gone because of top-level await)
pnpm lint / lintfix  # oxlint
pnpm fmt / fmt:check # oxfmt
pnpm test:matrix     # frontend×backend compatibility matrix (see below)
pnpm release         # build + changeset publish
```

## Layout

- `src/app.ts` — entry: flags (`--help`, `--version`, `--doctor`) + interactive menus.
- `src/utils/questions.ts` — menu choices; `src/utils/links.ts` — choice → template repo
  URL. **These two must stay in sync**: every menu value needs a links entry.
- `src/utils/GitHandler.ts` — clone + per-stack install commands (Django/FastAPI use
  `uv sync`, Rails `bundle install`, Laravel `composer install`).
- `src/utils/doctor.ts` — checks required tools per framework.
- `scripts/test-matrix.mjs` — the compatibility matrix (zero-dep Node ≥18). Boots every
  backend template, drives the shared contract flow with real frontend payloads (including
  a live TOTP), extracts each frontend's API calls, grades all pairs into
  `matrix-report.json` (gitignored). Full guide: `.claude/skills/cliuno-matrix/SKILL.md`.
- `.claude/skills/cliuno-scaffold/` — the "build on templates, not from scratch" skill:
  stack chooser, clone/install per stack, shadcn UI conventions, quality gates.

## Conventions

- oxc-only tooling (oxlint + oxfmt, 4-space, double quotes here — this repo's own style).
- Conventional commits (commitlint via husky); no co-author trailers.
- husky pre-commit runs lint-staged; if `pnpm` suddenly fails with IGNORED_BUILDS, fix
  `pnpm-workspace.yaml` `allowBuilds` — don't bypass hooks.
- The matrix must exit 0 before releasing template-facing changes.
