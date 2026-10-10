# CLIuno: `make:*` generators, Claude skills plugin, and workspace dependency refresh

Date: 2026-10-10 · Status: approved-by-assumption (autonomous session; see "Decisions taken")

## Intent (what the user asked for, in their words, condensed)

1. Go through every CLIuno repo, update its packages, open a PR — no Claude author.
2. Update the Claude skills and put the `core` repo on the Claude skills marketplace.
3. When someone installs the `cliuno` package, Claude should check whether the CLIuno
   skills are installed, and use the CLI to produce files instead of writing whole files
   by hand (save tokens).
4. Laravel-style `make:*` commands (controller, model, …): delegate to the framework's
   own CLI when it has one; otherwise CLIuno provides a simple generator Claude can call.

Success = an AI agent working in any CLIuno template can run one command to add a working
resource (route + controller + model + validation + tests, or api + store + page) and only
has to edit fields/business logic; every repo's dependencies are current with CI green;
`core` installs as a Claude Code plugin and as a skills.sh skill set.

## Workstreams

| #   | Workstream                                  | Repos                           |
| --- | ------------------------------------------- | ------------------------------- |
| 1   | `cliuno make:*` + `cliuno skills` + plugin  | `core`                          |
| 2   | Dependency refresh + "AI agents" CLAUDE.md  | 21 templates                    |
| 3   | Dependency refresh (+ docs page for `make`) | `cliuno.github.io`, VS Code ext |

## 1. CLI surface (core)

```
cliuno                         interactive scaffold (unchanged)
cliuno --doctor | --help | --version
cliuno make                    list the generators available for the detected stack
cliuno make:<kind> <Name> [--fields name:string,price:number?] [--force] [--dry-run]
cliuno skills status           which CLIuno skills are installed (project / user), version
cliuno skills install [--global] [--force]
```

`<kind>` is the union: `resource controller model migration service validator request dto
test api store page component`. Each stack implements the subset that exists in that
stack; `cliuno make` prints the subset and marks which ones delegate to a native CLI.

The welcome banner moves into the interactive path so `make`/`skills` output stays
machine-readable.

## 2. Stack detection

Probe `process.cwd()` in this order and stop at the first match:

| stack       | probe                                                   |
| ----------- | ------------------------------------------------------- |
| tallstack   | `composer.json` requires `livewire/livewire`            |
| laravel     | `composer.json` requires `laravel/framework`            |
| django      | `pyproject.toml` lists `django`                         |
| fastapi     | `pyproject.toml` lists `fastapi`                        |
| rails       | `Gemfile` has `gem "rails"`                             |
| spring      | `pom.xml` contains `spring-boot`                        |
| aspnet      | any `*.csproj` with `Microsoft.NET.Sdk.Web` (depth ≤ 2) |
| drogon      | `CMakeLists.txt` contains `Drogon`                      |
| flutter     | `pubspec.yaml` with `flutter:` dependency               |
| nest        | package.json dep `@nestjs/core`                         |
| adonis      | package.json dep `@adonisjs/core`                       |
| fastify     | package.json dep `fastify`                              |
| express     | package.json dep `express` (and not nest/adonis)        |
| next        | package.json dep `next`                                 |
| nuxt        | package.json dep `nuxt`                                 |
| reactnative | package.json dep `expo`                                 |
| react       | package.json dep `react` + `react-router-dom`           |
| vue         | package.json dep `vue` + `vue-router` (not nuxt)        |
| svelte      | package.json dep `@sveltejs/kit`                        |
| solid       | package.json dep `solid-js`                             |
| angular     | package.json dep `@angular/core`                        |

No match → exit 1 with the probe table. No marker file is written at scaffold time
(templates cloned by hand must work too).

## 3. Generator model

```ts
type Kind =
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

interface Field {
    name: string;
    type: FieldType;
    nullable: boolean;
} // FieldType: string|text|int|number|boolean|date|json
interface Names {
    raw;
    pascal;
    camel;
    kebab;
    snake;
    plural: { pascal; camel; kebab; snake };
}
interface Ctx {
    cwd: string;
    names: Names;
    fields: Field[];
    force: boolean;
    dryRun: boolean;
}

interface Command {
    describe: string;
    native?: (ctx: Ctx) => string[]; // argv to delegate to (framework CLI) — used when its binary exists
    files?: (ctx: Ctx) => FileSpec[]; // { path, content }
    patches?: (ctx: Ctx) => Patch[]; // { path, anchor: string | RegExp, insert, where: 'before' | 'after', skipIf?: string }
    notes?: (ctx: Ctx) => string[]; // follow-up instructions printed at the end
}

interface Generator {
    id: StackId;
    label: string;
    commands: Partial<Record<Kind, Command>>;
}
```

Rules:

- `native` wins when defined **and** its binary resolves (`php`, `node`, `bin/rails`,
  `ng`); otherwise fall back to `files` when present, else error "needs <tool>".
- `make:resource` always renders CLIuno stubs (the framework CLIs don't know CLIuno's
  envelope `{status, message, data}`, Bearer guard, owner relation, timestamps). It also
  applies route-registration patches where the stack needs them.
- Never overwrite an existing file unless `--force`. Patches are idempotent (`skipIf`
  text already present → skip). Missing anchor → the patch becomes a note, never a crash.
- `--dry-run` prints every file path + content and every patch, writes nothing.
- Stubs are TypeScript template strings in `src/generators/stacks/<stack>.ts` (bundled by
  tsup, so `files: ["dist", "skills"]` stays simple).
- Default fields when `--fields` is omitted: `title:string,description:text?`.

## 4. Fields DSL

`--fields name:string,price:number,qty:int,done:boolean,body:text?,due:date?,meta:json?`

`?` = nullable. Type map is owned per stack, e.g. TypeORM `text/real/integer/boolean/
datetime/simple-json`, Django `CharField/TextField/IntegerField/FloatField/BooleanField/
DateTimeField/JSONField`, Eloquent migration `string/text/integer/float/boolean/dateTime/
json`, Rails `string/text/integer/float/boolean/datetime/json`, JPA `String/String/Integer/
Double/Boolean/Instant/String`, EF Core `string/string/int/double/bool/DateTime/string`,
SQLAlchemy `String/Text/Integer/Float/Boolean/DateTime/JSON`, TS `string/string/number/
number/boolean/string/Record<string, unknown>`, Dart `String/String/int/double/bool/
String/Map<String, dynamic>`.

## 5. What `make:resource <Name>` produces per stack

Backends (route prefix `/<kebab-plural>`, all guarded by the template's auth middleware,
owner = authenticated user, list/get/create/update/delete):

| stack     | files                                                                                                                                               | registration patch                     | native primitives (`make:controller` …)                |
| --------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------ |
| express   | `src/routers/v1/<k>.router.ts`, `src/controllers/<k>.controller.ts`, `src/entities/<k>.entity.ts`                                                   | `src/routers/index.ts` import + `use`  | none → stubs                                           |
| fastify   | `src/routes/<kp>.routes.ts`, `src/entities/<k>.entity.ts` (or wherever the template keeps entities)                                                 | `src/app.ts` register                  | none → stubs                                           |
| nest      | `src/controllers/<k>.controller.ts`, `src/services/<k>.service.ts`, `src/dto/<k>.dto.ts`, `src/entities/<k>.entity.ts`, `src/modules/<k>.module.ts` | `src/app.module.ts` import + imports[] | `nest g` layouts differ from the template → stubs      |
| adonis    | controller, model, migration, validator                                                                                                             | `start/routes.ts`                      | `node ace make:controller/model/migration/validator`   |
| django    | `src/views/<s>_views.py`, `src/serializers/<s>_serializers.py`, `src/urls/<s>_urls.py`, model appended to `src/models.py`, `src/tests/test_<sp>.py` | `src/urls/__init__.py` (or root urls)  | `manage.py makemigrations` (migration), rest → stubs   |
| fastapi   | `src/routers/<sp>.py`, `src/models/<s>.py`, `src/schemas/<s>.py`, `tests/test_<sp>.py`                                                              | `src/app.py` include_router            | none → stubs                                           |
| laravel   | `app/Models/<P>.php`, `app/Http/Controllers/<P>Controller.php`, `app/Http/Requests/Store<P>Request.php`, migration, `tests/Feature/<P>Test.php`     | `routes/api.php` apiResource           | `php artisan make:*` for every primitive               |
| tallstack | same as laravel (+ note about Volt page)                                                                                                            | `routes/api.php`                       | `php artisan make:*`                                   |
| rails     | model, migration, `app/controllers/api/v1/<sp>_controller.rb`, tests                                                                                | `config/routes.rb` resources           | `bin/rails g model/controller/migration`               |
| spring    | `entity/<P>.java`, `repo/<P>Repository.java`, `controller/<P>Controller.java`                                                                       | none (component scan)                  | none → stubs                                           |
| aspnet    | `Controllers/<Pp>Controller.cs`, model class, DbSet line in the DbContext                                                                           | DbContext patch                        | none → stubs                                           |
| drogon    | `controllers/<P>Controller.cc` (+ schema statement in the template's bootstrap SQL)                                                                 | schema patch                           | `drogon_ctl` output doesn't match the template → stubs |

Frontends (list page + detail page, api client, store where the template uses one):

| stack       | files                                                                                                   | registration patch                          |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- |
| react       | `src/apis/<k>-api.ts`, `src/views/app/<P>sView.tsx`, `src/views/app/<P>DetailView.tsx`                  | `src/apis/index.ts`, `src/router/index.tsx` |
| vue         | `src/apis/<k>-api.ts`, `src/views/app/<P>sView.vue`, `<P>DetailView.vue`                                | `src/apis/index.ts`, `src/router/index.ts`  |
| solid       | `src/apis/<k>-api.ts`, `src/pages/app/<P>sPage.tsx`, `<P>DetailPage.tsx`                                | `src/apis/index.ts`, routes file            |
| svelte      | `src/lib/apis/<k>-api.ts`, `src/routes/<kp>/+page.svelte`, `src/routes/<kp>/[id]/+page.svelte`          | `src/lib/apis/index.ts`                     |
| next        | `src/apis/<k>-api.ts`, `src/app/<kp>/page.tsx`, `src/app/<kp>/[id]/page.tsx`                            | `src/apis/index.ts`                         |
| nuxt        | `composables/use<P>Api.ts`, `pages/<kp>/index.vue`, `pages/<kp>/[id].vue`                               | none (auto-imports, file routing)           |
| angular     | `src/app/services/<k>-api.service.ts`, `src/app/views/app/<kp>.component.ts`, `<k>-detail.component.ts` | `src/app/app.routes.ts`                     |
| flutter     | `lib/apis/<s>_api.dart`, `lib/screens/<sp>_screen.dart`, `lib/screens/<s>_detail_screen.dart`           | note (routes map)                           |
| reactnative | `src/apis/<k>-api.ts`, `src/app/<kp>/index.tsx`, `src/app/<kp>/[id].tsx`                                | `src/apis/index.ts`                         |

`make:component <Name>` on web frontends delegates to the template's documented
shadcn-style `add` command (`npx shadcn@latest add`, `shadcn-vue`, `shadcn-svelte`,
`ng g @spartan-ng/cli:ui`); Solid/mobile get a stub file.

Stubs are derived from each template's existing `todo` resource so the generated code
matches the template's imports, helpers, envelope, lint rules and formatting (4-space,
`semi: false`, single quotes for the JS templates; the backend's own style elsewhere).

## 6. `cliuno skills` and the plugin

- Skills move from `core/.claude/skills/` to `core/skills/` (the layout both Claude Code
  plugins and `npx skills add` discover). `core/.claude/skills/<name>` become relative
  symlinks so working inside the workspace keeps project-skill discovery.
- Three skills: `cliuno-scaffold` (updated: after scaffolding use `make:resource`; check
  skills), `cliuno-matrix` (path updates), **new `cliuno-make`** (when to generate instead
  of hand-writing, flags, per-stack outputs, what to edit after, dry-run first when
  unsure).
- `.claude-plugin/marketplace.json` → name `cliuno`, owner ru44, one plugin `cliuno`,
  `source: "./"`. `.claude-plugin/plugin.json` → name `cliuno`, `skills: ["./skills/"]`.
  CI job runs `claude plugin validate . --strict`.
- npm package ships `skills/` (`files: ["dist", "skills"]`). `cliuno skills install`
  copies `skills/*` from the installed package into `./.claude/skills/` (project) or
  `~/.claude/skills/` (`--global`); `status` lists installed/missing/outdated using the
  `metadata.version` frontmatter stamped from `package.json`.
- "Claude checks the skills are installed": every template's `CLAUDE.md` gains an **AI
  agents** section telling the agent to run `npx cliuno@latest skills status` first (install
  if missing) and to use `npx cliuno@latest make:resource` instead of hand-writing
  resources. The interactive `cliuno` also prints a one-line hint when the cwd has a
  `CLAUDE.md`/`.claude/` but no CLIuno skills.
- README: install via `claude plugin marketplace add CLIuno/core` + `claude plugin install
  cliuno@cliuno`, or `npx skills add CLIuno/core`, or `cliuno skills install`.

## 7. Dependency refresh policy (workstream 2 and 3)

| ecosystem | update                                                                                       | gates                                     |
| --------- | -------------------------------------------------------------------------------------------- | ----------------------------------------- |
| pnpm      | `pnpm up --latest`; majors that break non-trivially → pin to latest compatible, listed in PR | lint, typecheck, build, unit tests        |
| npm       | `npm update` + manual majors (RN: `npx expo install --fix`)                                  | type-check, lint                          |
| uv        | `uv lock --upgrade`, raise `>=` floors to locked versions                                    | `manage.py test` / `pytest`, `ruff check` |
| composer  | `composer update`                                                                            | `artisan test`, `pint --test`             |
| bundler   | `bundle update`                                                                              | `rails test`, `rubocop`                   |
| maven     | bump `spring-boot-starter-parent` (latest 3.5.x; 4.x only if green)                          | `./mvnw test`                             |
| dotnet    | bump PackageReference versions (no local SDK)                                                | CI (`dotnet build`)                       |
| flutter   | bump pubspec from pub.dev (local flutter shim is broken)                                     | CI (`flutter analyze`, `flutter test`)    |
| drogon    | nothing to bump                                                                              | —                                         |

Branch `chore/deps-2026-10`, commits `build(deps): …` and `docs: …`, one PR per repo,
no AI attribution in commits or PR bodies. After the backend bumps, run the full matrix.

## 8. Testing

- `core`: `node:test` via tsx (`pnpm test`): names/fields parsing, detection table,
  patch idempotency, and a render test that every stack's `resource` renders with default
  and custom fields without throwing and with no leftover `{{` placeholders.
- `core/scripts/test-generators.mjs` (local workspace only): for each template dir run
  `make:resource Widget --fields name:string,price:number,done:boolean`, run that stack's
  typecheck/lint/tests, then `git checkout -- . && git clean -fd` to restore.
- Each template PR: its own CI.

## 9. Out of scope

Axum template (stale 2025, not in the CLI menu), the org `.github` repo, triaging the
existing Dependabot PRs (left open for the user), VS Code extension lint migration.

## Decisions taken without a live user (override by replying)

1. `make:resource` uses CLIuno stubs even where a framework CLI exists; only single-file
   primitives delegate to the native CLI. Reason: native stubs are empty shells that
   don't save an agent tokens; the resource stub is a working vertical slice.
2. No marker file in scaffolded projects — detection is heuristic.
3. Skills are installed by copying into `.claude/skills/` (works offline, no plugin
   system required); the plugin marketplace is the second path, not the only one.
4. Dependabot's open PRs are left as-is.
5. Major-version bumps are attempted everywhere; when a major needs more than a small,
   obvious fix it is pinned back and listed in the PR body.
