# `cliuno make:*` generators, skills plugin, dependency refresh — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give every CLIuno template a one-command resource generator an AI agent can call, ship the skills as a Claude Code plugin / skills.sh set, and refresh every repo's dependencies with one PR per repo.

**Architecture:** `core/src/app.ts` becomes a tiny argv router over three commands (interactive scaffold, `make`, `skills`). Generators are data: one module per stack exporting `Generator` (a map of `Kind → Command`), where a `Command` is either a native-CLI delegation or a list of rendered files + idempotent patches + notes. A stack-agnostic engine detects the stack, builds a `Ctx` (names, fields), renders, and writes with `--force`/`--dry-run` semantics. Skills live in `core/skills/` and are installed by copying into `.claude/skills/`.

**Tech Stack:** TypeScript 6, tsup (ESM), `node:test` via tsx, oxlint/oxfmt, Claude Code plugin manifests.

**Spec:** `docs/superpowers/specs/2026-10-10-make-generators-and-plugin-design.md`

## Global Constraints

- core style: 4-space, double quotes, oxlint + oxfmt clean (`pnpm lint`, `pnpm fmt:check`).
- Generated JS/TS for templates: 4-space, `semi: false`, single quotes (matches every template's oxfmt).
- Never overwrite an existing file without `--force`; patches idempotent; missing anchor → note.
- No `Co-Authored-By` / AI attribution in any commit or PR. Conventional commit messages.
- `make:resource` = CLIuno stubs on every stack; primitives delegate to native CLIs (`php artisan`, `node ace`, `bin/rails g`, `ng g`) when the binary exists.
- Dependencies: attempt latest; pin back only when a major needs more than an obvious fix, and say so in the PR body.
- Each template's own gates must stay green: `tsc`/`vue-tsc`/`svelte-check`/`ng build`, `oxlint .`, build, test suites, `ruff`, `pint`, `rubocop`, `mvnw test`.

## Review Focus

1. Resource names given in any case/plural form (`post`, `Posts`, `blog-post`, `BlogPost`) must normalise to one consistent set (`BlogPost`, `blogPost`, `blog-post`, `blog_post`, plural `BlogPosts`/`blog-posts`/`blog_posts`) — Task 2 tests pin this.
2. A field list with a trailing comma, spaces, or an unknown type (`price:money`) must fail with a message that lists valid types, not generate broken code — Task 2 tests.
3. Running `make:resource` twice must not duplicate route registrations or imports — Task 4 patch tests.
4. Running from a sub-directory of a template (e.g. `src/`) must still detect the stack by walking up to the manifest — Task 3 tests.
5. `cliuno skills install` run twice must not clobber a user-modified skill without `--force`, and `status` must report "outdated" when the installed `metadata.version` is lower — Task 6 tests.

---

### Task 1: argv router + command modules

**Files:**

- Modify: `src/app.ts` (becomes router)
- Create: `src/commands/scaffold.ts` (existing interactive flow moved verbatim), `src/commands/make.ts`, `src/commands/skills.ts` (stubs that print "not implemented" until Tasks 5/6)
- Modify: `package.json` scripts: `"test": "tsx --test src/**/*.test.ts"`, `files: ["dist", "skills"]`

**Interfaces:**

- Produces: `runMake(argv: string[]): Promise<number>` and `runSkills(argv: string[]): Promise<number>` returning the exit code. `src/app.ts` dispatches `make`, `make:<kind>`, `skills`, `--doctor`, `--help`, `--version`; anything else → interactive scaffold (banner printed only there).

Steps: write `src/app.test.ts` asserting `parseArgv(["make:resource","Post","--fields","a:string","--dry-run"])` → `{command:"make", kind:"resource", name:"Post", flags:{fields:"a:string", dryRun:true}}`; run (fail); implement `parseArgv` in `src/cli/argv.ts`; run (pass); commit `refactor(cli): route argv to scaffold/make/skills commands`.

### Task 2: names + fields

**Files:**

- Create: `src/generators/names.ts`, `src/generators/fields.ts`, tests beside them.

**Interfaces (produces):**

```ts
export interface CaseSet {
    pascal: string;
    camel: string;
    kebab: string;
    snake: string;
    title: string;
}
export interface Names extends CaseSet {
    raw: string;
    plural: CaseSet;
}
export function buildNames(raw: string): Names; // "blog-post" | "BlogPosts" | "blog_post" → singular base "BlogPost"
export function pluralize(word: string): string; // post→posts, category→categories, box→boxes, person→people, status→statuses
export type FieldType = "string" | "text" | "int" | "number" | "boolean" | "date" | "json";
export interface Field {
    name: string;
    camel: string;
    snake: string;
    type: FieldType;
    nullable: boolean;
}
export function parseFields(spec?: string): Field[]; // undefined/"" → DEFAULT_FIELDS (title:string, description:text?)
export const FIELD_TYPES: readonly FieldType[];
export function mapType<T>(field: Field, map: Record<FieldType, T>): T;
```

Tests: casing table (Review Focus 1), plural rules, `parseFields("price:money")` throws with message containing `string, text, int, number, boolean, date, json`, trailing comma/spaces tolerated, `?` sets nullable, duplicate field name throws. Commit `feat(make): name casing and field parsing`.

### Task 3: stack detection

**Files:** `src/generators/detect.ts` + test using `fs.mkdtemp` fixtures.

**Interfaces:**

```ts
export type StackId =
    | "express"
    | "fastify"
    | "nest"
    | "adonis"
    | "django"
    | "fastapi"
    | "laravel"
    | "tallstack"
    | "rails"
    | "spring"
    | "aspnet"
    | "drogon"
    | "react"
    | "next"
    | "vue"
    | "nuxt"
    | "svelte"
    | "solid"
    | "angular"
    | "flutter"
    | "reactnative";
export interface Detection {
    stack: StackId;
    root: string;
}
export function detectStack(cwd: string): Detection | null; // walks up ≤ 6 parents until a manifest is found; order per spec §2
export const PROBES: ReadonlyArray<{ stack: StackId; describe: string }>;
```

Tests: one fixture per stack (minimal manifest), sub-directory walk-up (Review Focus 4), express-vs-nest precedence, null for empty dir. Commit `feat(make): detect the CLIuno stack from manifests`.

### Task 4: engine (render + apply)

**Files:** `src/generators/types.ts`, `src/generators/engine.ts`, tests.

**Interfaces:**

```ts
export type Kind =
    | "resource"
    | "controller"
    | "model"
    | "migration"
    | "service"
    | "validator"
    | "request"
    | "dto"
    | "test"
    | "api"
    | "store"
    | "page"
    | "component";
export interface Ctx {
    cwd: string;
    names: Names;
    fields: Field[];
    force: boolean;
    dryRun: boolean;
}
export interface FileSpec {
    path: string;
    content: string;
} // path relative to ctx.cwd (the stack root)
export interface Patch {
    path: string;
    anchor: string | RegExp;
    insert: string;
    where: "before" | "after";
    skipIf: string;
    describe: string;
}
export interface Command {
    describe: string;
    native?: (ctx: Ctx) => { bin: string; args: string[] }[]; // delegated when `bin` resolves on PATH or as a relative file
    files?: (ctx: Ctx) => FileSpec[];
    patches?: (ctx: Ctx) => Patch[];
    notes?: (ctx: Ctx) => string[];
}
export interface Generator {
    id: StackId;
    label: string;
    kind: "backend" | "frontend" | "mobile";
    commands: Partial<Record<Kind, Command>>;
}
export interface Plan {
    native: { bin: string; args: string[] }[];
    files: FileSpec[];
    patches: Patch[];
    notes: string[];
}
export function plan(gen: Generator, kind: Kind, ctx: Ctx): Plan; // throws if kind unsupported
export function apply(
    p: Plan,
    ctx: Ctx,
    io?: Io,
): Promise<{ written: string[]; skipped: string[]; patched: string[]; notes: string[] }>;
export function applyPatch(
    source: string,
    patch: Patch,
): { text: string; status: "applied" | "skipped" | "anchor-missing" };
```

Tests: `applyPatch` after/before, skipIf (Review Focus 3), anchor-missing → note; `apply` refuses overwrite without force, writes with force, dry-run writes nothing; native resolution uses an injected `which`. Commit `feat(make): generator engine with dry-run, force and idempotent patches`.

### Task 5: `make` command + registry + reference stacks (express, react)

**Files:** `src/generators/stacks/index.ts` (registry: `export const generators: Record<StackId, Generator>`; every stack module pre-created as `{ id, label, kind, commands: {} }` so parallel workers only touch their own file), `src/generators/stacks/express.ts`, `src/generators/stacks/react.ts`, `src/generators/stacks/stacks.test.ts` (for every registered generator with ≥1 command: `plan(gen,"resource",ctx)` renders with default and custom fields; no file content contains `undefined`, `[object Object]`, or `{{`; every file path is relative and unique), `src/commands/make.ts` (real implementation: detect → ctx → plan → print/apply; `cliuno make` lists kinds with `(native: …)` markers).

Express `resource` → `src/routers/v1/<kebab>.router.ts`, `src/controllers/<kebab>.controller.ts`, `src/entities/<kebab>.entity.ts`, patch `src/routers/index.ts` (import after the last `import … from './v1/…'` line; `router.use('/<kebab-plural>', <camel>Router)` before `// Export the main router`), patch `src/entities/user.entity.ts` is NOT touched (owner relation is one-way `@ManyToOne(() => User)` without inverse). Primitives: `controller`, `model` (entity), `validator` (express-validator chain file in `src/validators/<kebab>.validator.ts`), `test` (`src/__tests__/<kebab>.spec.ts` jest). TS type map: string→`text`, text→`text`, int→`integer`, number→`real`, boolean→`boolean`, date→`datetime`, json→`simple-json`.

React `resource` → `src/apis/<kebab>-api.ts`, `src/views/app/<PascalPlural>View.tsx` (list + create dialog + delete), `src/views/app/<Pascal>DetailView.tsx`; patches `src/apis/index.ts` (import + key) and `src/router/index.tsx` (lazy import + two `<Route>` lines inside the protected group, anchored on `<Route path="/profile"`). Primitives: `api`, `page`, `component` (native: `npx shadcn@latest add <kebab> -y`), `store` (zustand `src/stores/<kebab>.ts`).

Commit `feat(make): make command with express and react generators`.

### Task 6: `skills` command + skills relocation

**Files:** `git mv .claude/skills/cliuno-scaffold skills/cliuno-scaffold`, same for `cliuno-matrix`; symlinks `.claude/skills/cliuno-scaffold -> ../../skills/cliuno-scaffold` (and matrix); `src/commands/skills.ts`; `src/skills/locate.ts` (`packagedSkillsDir()` resolves `../skills` relative to `import.meta.url` of the built file, falling back to `../../skills` when running from `src/` via tsx); tests with tmp dirs.

**Interfaces:**

```ts
export interface SkillStatus {
    name: string;
    packaged: string;
    project?: string;
    user?: string;
    state: "missing" | "installed" | "outdated" | "modified";
}
export function skillsStatus(opts: { cwd: string; home: string; packaged: string }): SkillStatus[];
export function installSkills(opts: {
    cwd: string;
    home: string;
    packaged: string;
    global: boolean;
    force: boolean;
}): { installed: string[]; skipped: string[] };
```

`metadata.version` in each packaged SKILL.md frontmatter is the package version (a `scripts/stamp-skills.mjs` run in `prebuild` rewrites it); installed copies with a lower version → `outdated`; same version but different content → `modified` (skipped unless `--force`). Commit `feat(skills): cliuno skills status/install and package the skills`.

### Task 7: plugin manifests, CI, README, changeset, CLAUDE.md

**Files:** `.claude-plugin/marketplace.json`, `.claude-plugin/plugin.json`, `.github/workflows/main.yml` (+ job: `npm i -g @anthropic-ai/claude-code && claude plugin validate . --strict`, plus `pnpm test`), `README.md` (sections: AI agents / Claude Code plugin / make commands), `.changeset/make-generators.md` (`cliuno: minor`), `CLAUDE.md` (core) and workspace `../CLAUDE.md` (skill paths now `core/skills/…`).

Validate locally: `claude plugin validate . --strict` exits 0. Commit `feat(plugin): publish core as a Claude Code plugin marketplace`.

### Task 8: skills content

**Files:** `skills/cliuno-make/SKILL.md` (+ `references/stacks.md` table of outputs per stack), update `skills/cliuno-scaffold/SKILL.md` (after scaffold → `npx cliuno@latest make:resource`, `skills status`), `skills/cliuno-matrix/SKILL.md` (paths). Keep frontmatter to `name`, `description`, `metadata` only (portable). Commit `docs(skills): add cliuno-make skill and point scaffold at the generators`.

### Task 9: remaining stack generators (parallel, one worker per group)

Each worker: read the template's `todo` files listed in the spec §5 table (plus the file that registers routes/apis), write `src/generators/stacks/<id>.ts` mirroring imports/helpers/envelope/formatting exactly, run `pnpm test -- src/generators/stacks/stacks.test.ts` and `pnpm lint`, then `node scripts/test-generators.mjs --only <id>` (Task 10) where the toolchain exists locally (JS, PHP, Python, Ruby, Java); for aspnet/drogon/flutter use `--dry-run` review only. Commit `feat(make): <id> generator`.

Groups: (a) fastify, nest, adonis · (b) django, fastapi · (c) laravel, tallstack, rails · (d) spring, aspnet, drogon · (e) vue, nuxt, svelte · (f) solid, next, angular · (g) flutter, reactnative.

### Task 10: integration script

**Files:** `scripts/test-generators.mjs` — for each template dir in `..` (or `--only id`): `git worktree add <scratch>/<id> HEAD`, install (per stack table in `skills/cliuno-scaffold/references/stacks.md`), run `node <core>/dist/app.js make:resource Widget --fields name:string,price:number,done:boolean,due:date?`, run gates, `git worktree remove --force`. Exit non-zero on any failure, print a table. Commit `test(make): integration script that generates a resource in every template`.

### Task 11: dependency refresh per repo (parallel batches)

Per repo on branch `chore/deps-2026-10`: update per spec §7, run gates, fix, commit `build(deps): update dependencies to latest (2026-10)`; worker reports majors kept/pinned. Then the orchestrator adds the CLAUDE.md "AI agents" section (`docs: point AI agents at cliuno make and skills`), pushes, opens the PR with `gh pr create` (body: summary table of bumps, gates run, pinned majors; no attribution). Run `pnpm test:matrix` in core after all backends are bumped.

### Task 12: docs site + VS Code extension

Docs: dependency bump + a page documenting `make:*`, `skills`, plugin install. Extension: dependency bump only (its eslint setup is out of scope). Same branch/PR flow.
