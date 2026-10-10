# Changelog

## 2.2.0

### Minor Changes

- afcf420: Add `cliuno make:*` generators and ship the Claude skills with the package:

    - `cliuno make:resource <Name> --fields a:string,b:int?` generates a working CRUD vertical slice (entity/model + controller/route + validation + test, or API client + list/detail pages) that follows each template's conventions and the shared `{status, message, data}` contract. Single-file generators (`make:controller`, `make:model`, `make:migration`, …) delegate to the framework's own CLI (`php artisan`, `node ace`, `bin/rails g`, `ng g`) when it exists.
    - `cliuno make` lists what the detected stack supports; `--dry-run` previews, `--force` overwrites.
    - `cliuno skills status|install` installs the `cliuno-scaffold`, `cliuno-make`, and `cliuno-matrix` skills into `.claude/skills/` (or `~/.claude/skills/` with `--global`).
    - The repo is now a Claude Code plugin marketplace: `claude plugin marketplace add CLIuno/core` then `claude plugin install cliuno@cliuno`.

## 2.1.1

### Patch Changes

- 13800ef: Ship only `dist/` in the npm package. Adds a `files` allowlist to package.json so the published tarball no longer includes the matrix harness, the `.claude/` skill workspace, `matrix-report.json`, or repo config — shrinking the package from ~250 kB to ~22 kB.

## 2.1.0

### Minor Changes

- a03bcb8: Expand the scaffolder with new stacks and a health check:
    - Backends: Fastify, AdonisJS, Spring Boot, ASP.NET, and Drogon (C++); TallStack rebuilt on Laravel 13.
    - Web frontends: Next.js and Svelte.
    - Mobile: React Native (Expo) alongside Flutter.
    - `--doctor` command to check required tooling per stack.

    Every frontend×backend pair is verified green by the CLIuno compatibility matrix.

## 2.0.1

### Patch Changes

- d2f218f: fix version bug

## 2.0.0

### Major Changes

- e007a3c: breaking change - change the command from all-in-1-cli to cliuno

All notable changes to this project will be documented in this file.

## [1.4.1] - 2022-10-02

### Added

- add Flutter Support
- add Django Support
- add Laravel Support

## [1.1.1] - 2022-09-19

### frontend

- add Vue.js support
- add Nuxt.js support
- add React.js support
- add Next.js support
- add Angular.js support
- add Sevlet support

### backend

- add Nest.js support
- add Express.js support
- add Fastify.js support
- add Adonis.js support
- add TallStack support for MVC
