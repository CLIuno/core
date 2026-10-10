# CLIUNO

The Ultimate Tool for all your needs in web development.

## Description

This Tool has all the commands you need to do everything from installing packages to creating a new project.
boosting your productivity, and making your life easier. I tried to make it as easy to use as possible, and I hope you enjoy it.

## Prerequisites

I wish if you don't have to install these Prerequisites, but you should get them.

- Node.js 16x and above
- Docker 19x and above
- Git 2x and above

if you are going to work with Laravel, you should have composer installed.
if you are going to work with Django, you should have python installed.
if you are going to work with Spring Boot, you should have java and mvn installed.
if you are going to work with Dotnet Core, you should have dotnet installed.
if you are going to work with Flutter, you should have flutter installed.
All of these are optional, but you should have them if you want to work with the frameworks.

## Installation

```bash
npm install -g cliuno
```

or by Using Yarn

```bash
yarn global add cliuno
```

or by Using PNPM

```bash
pnpm add -g cliuno
```

## Running the app

```bash
# interactive scaffolder: pick a backend, a frontend / mobile app, a package manager
$ cliuno

# health check for every supported stack
$ cliuno --doctor
```

## Generating code inside a scaffolded project (`cliuno make:*`)

Every template implements the same demo app on one REST contract. `cliuno make:*` clones
that pattern for your own resources, in the template's conventions, so you (or an AI
agent) edit fields and business logic instead of writing boilerplate:

```bash
cd my-api                                   # any CLIuno template, any sub-folder
cliuno make                                 # what this stack can generate
cliuno make:resource Product --fields name:string,price:number,inStock:boolean,notes:text?
cliuno make:controller Invoice --dry-run    # preview without writing
cliuno make:model Tag --force               # overwrite an existing file
```

- `make:resource` generates the whole vertical slice — entity/model + controller/route +
  validation + test on backends, API client + list/detail pages on frontends — and
  registers it (router, module, `apis/index`, …). Re-running never duplicates registrations.
- Single-file kinds (`make:controller`, `make:model`, `make:migration`, `make:service`,
  `make:validator|request|dto`, `make:test`, `make:api`, `make:store`, `make:page`,
  `make:component`) delegate to the framework's own CLI when it has one
  (`php artisan`, `node ace`, `bin/rails g`, `ng g`, `shadcn add`), otherwise render a
  CLIuno stub.
- Field types: `string text int number boolean date json`, add `?` for nullable.

## Claude Code / AI agents

The repo ships three skills (`cliuno-scaffold`, `cliuno-make`, `cliuno-matrix`) that
teach an agent to scaffold from the templates and to run the generators instead of
hand-writing files. Install them in any of these ways:

```bash
# 1. as a Claude Code plugin (one step on Claude Code ≥ 2.1.275)
/plugin install cliuno --marketplace CLIuno/core
#    or in two steps:
claude plugin marketplace add CLIuno/core
claude plugin install cliuno@cliuno

# 2. copied into the current project's .claude/skills/ (works offline, no plugin system needed)
npx cliuno@latest skills install            # --global → ~/.claude/skills

# 3. with the skills.sh CLI
npx skills add CLIuno/core
```

`cliuno skills status` tells you whether the skills are installed, outdated, or locally
modified. Every template's `CLAUDE.md` asks the agent to run it first.

### Project status

✅ Production ready and maintained.

## Contributors

Thanks goes to these wonderful people (Me) ✨
