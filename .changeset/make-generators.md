---
"cliuno": minor
---

Add `cliuno make:*` generators and ship the Claude skills with the package:

- `cliuno make:resource <Name> --fields a:string,b:int?` generates a working CRUD vertical slice (entity/model + controller/route + validation + test, or API client + list/detail pages) that follows each template's conventions and the shared `{status, message, data}` contract. Single-file generators (`make:controller`, `make:model`, `make:migration`, …) delegate to the framework's own CLI (`php artisan`, `node ace`, `bin/rails g`, `ng g`) when it exists.
- `cliuno make` lists what the detected stack supports; `--dry-run` previews, `--force` overwrites.
- `cliuno skills status|install` installs the `cliuno-scaffold`, `cliuno-make`, and `cliuno-matrix` skills into `.claude/skills/` (or `~/.claude/skills/` with `--global`).
- The repo is now a Claude Code plugin marketplace: `claude plugin marketplace add CLIuno/core` then `claude plugin install cliuno@cliuno`.
