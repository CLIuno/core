---
name: cliuno-make
description: Generate code inside a CLIuno-scaffolded project with `cliuno make:*` instead of hand-writing it. Use this whenever the user, working in any CLIuno template (Express, Fastify, NestJS, AdonisJS, Django, FastAPI, Laravel, TallStack, Rails, Spring Boot, ASP.NET, Drogon, Axum, React, Next, Vue, Nuxt, Svelte, Solid, Angular, Flutter, React Native), asks to add a resource, model, entity, table, endpoint, CRUD, controller, service, migration, validator/DTO, API client, store, page/screen, or UI component — phrases like "add a Product resource", "create an Orders endpoint", "I need a Comments model with …", "add a page for invoices", "make:controller". One command produces a working vertical slice that follows the template's conventions and the shared REST contract; you then only edit fields and business logic.
metadata:
    version: 2.2.0
---

# cliuno make — generate, don't hand-write

Every CLIuno template ships the same demo app (auth, users, todos, posts, …) on one REST
contract. `cliuno make:*` clones that pattern for a new resource: the generated files use
the template's own imports, helpers, auth guard, `{status, message, data}` envelope,
owner relation, timestamps, lint rules and formatting. Hand-writing the same files costs
thousands of tokens and drifts from the conventions — **run the generator, then edit.**

## Workflow

1. **Make sure the skills are present** (once per project):
   `npx cliuno@^2.2 skills status` → if anything is `missing`/`outdated`,
   `npx cliuno@^2.2 skills install` (adds `.claude/skills/cliuno-*`; `--global` for `~/.claude/skills`).
2. **See what this stack supports**: `npx cliuno@^2.2 make` (run anywhere inside the
   project — detection walks up to the manifest). It lists the kinds and marks which ones
   delegate to the framework's own CLI (`[native: php]`, `node ace`, `bin/rails`, `ng`).
3. **Generate the resource**:

    ```bash
    npx cliuno@^2.2 make:resource Product --fields name:string,price:number,inStock:boolean,notes:text?
    ```

    Unsure? Add `--dry-run` to print every file and patch without writing. Re-running is
    safe: existing files are skipped (use `--force` to overwrite) and registrations are
    never duplicated.

4. **Read the printed notes** (`!` lines) — they are the manual follow-ups: run a
   migration, add a nav link, wire a validator, register a route when the anchor wasn't
   found.
5. **Edit, don't rewrite**: adjust field types/validation, add business rules, rename
   labels. Keep the envelope and the auth guard.
6. **Run the template's gates** (its `CLAUDE.md` lists them: typecheck, lint, build, tests).
7. **Frontend + backend pair?** Generate on both sides with the **same name and fields**;
   the frontend client calls `/<kebab-plural>` with camelCase JSON keys, which the backend
   stub accepts.

## Fields DSL

`--fields a:type,b:type?` — `?` marks nullable. Default when omitted: `title:string,description:text?`.

| type      | meaning            | backend column (typical)  | TS / Dart type      |
| --------- | ------------------ | ------------------------- | ------------------- |
| `string`  | short text (label) | text / string / varchar   | `string`            |
| `text`    | long text          | text                      | `string`            |
| `int`     | integer            | integer                   | `number` / `int`    |
| `number`  | float              | real / float / double     | `number` / `double` |
| `boolean` | flag (default off) | boolean                   | `boolean` / `bool`  |
| `date`    | timestamp          | datetime                  | `string` / `Date`   |
| `json`    | arbitrary object   | json / simple-json / text | `Record<string, …>` |

The first `string` field is the display field used by list pages. Aliases accepted:
`integer`, `float`, `double`, `bool`, `datetime`, `timestamp`, `object`.

## Kinds

| kind                                                                          | what it generates                                                                                                                       |
| ----------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- |
| `resource`                                                                    | the full vertical slice (always CLIuno stubs, never bare framework stubs)                                                               |
| `controller` `model` `migration` `service` `validator` `request` `dto` `test` | one backend piece; delegates to `php artisan` / `node ace` / `bin/rails g` / `manage.py` where that CLI exists, otherwise a CLIuno stub |
| `api` `store` `page` `component`                                              | one frontend piece; `component` delegates to the template's shadcn-style `add` command                                                  |

Per-stack file lists, registration patches and follow-ups: [references/stacks.md](references/stacks.md).

## When not to use it

- Changing an **existing** endpoint or page → edit it directly (and, in the CLIuno
  workspace, follow the `cliuno-matrix` contract).
- The project is not a CLIuno template (detection fails) → `--dry-run` still shows a
  reasonable pattern to adapt, but don't apply blindly.
- A stack whose `cliuno make` lists no generators yet → fall back to copying that
  template's `todo` files as the pattern.
