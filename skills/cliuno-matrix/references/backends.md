# Per-backend operations reference

How each backend template boots, stores data, and verifies. The matrix registry in
`core/scripts/test-matrix.mjs` encodes the same facts as code — keep them in sync.

|               | boot (matrix)                                                                                             | database                                                                        | verify locally                                                             |
| ------------- | --------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Express**   | `node_modules/.bin/tsx src/app.ts` (`PORT`, `API_VERSION=v1`, `JWT_SECRET_KEY`, `REFRESH_JWT_SECRET_KEY`) | sqlite `db.sqlite`, TypeORM `synchronize: true`, table `users`                  | `tsc --noEmit --skipLibCheck` · `oxlint .` · `oxfmt --check src/` · `tsup` |
| **Nest**      | `nest build` then `node dist/main.js` (`PORT`, `JWT_SECRET_KEY`)                                          | sqlite `database.sqlite`, TypeORM synchronize, table `Users`                    | `oxlint .` · `nest build` · `jest`                                         |
| **Django**    | `manage.py migrate` then `runserver --noreload`                                                           | sqlite `db.sqlite3`, real migrations (`makemigrations src`)                     | `manage.py check` · `manage.py test` (73)                                  |
| **FastAPI**   | `uv run uvicorn src.app:app` with `DATABASE_URL=sqlite:///./matrix-test.db` (deleted each run)            | SQLAlchemy `create_all` on startup — model changes need a fresh db file         | `uv run ruff check .` · `uv run pytest` (94)                               |
| **Laravel**   | `php artisan migrate --force` then `artisan serve`                                                        | sqlite `database/database.sqlite`, migrations                                   | `./vendor/bin/pint --test` · `php artisan test` (10)                       |
| **Rails**     | `bin/rails db:prepare` (runs seeds) then `bin/rails server`                                               | sqlite dev db, migrations + `db/seeds.rb` (roles + admin)                       | `bundle exec rubocop` · `bin/rails test` (83)                              |
| **Fastify**   | `node_modules/.bin/tsx src/app.ts` (`PORT`, `JWT_SECRET_KEY`, `REFRESH_JWT_SECRET_KEY`)                   | sqlite `db.sqlite`, TypeORM `synchronize: true`, table `Users`                  | `tsc --noEmit` · `oxlint .` · `oxfmt --check src/`                         |
| **Adonis**    | `node ace migration:run --force` then `node ace serve` (`APP_KEY` ≥32 chars, `HOST`, `LOG_LEVEL`, `TZ`)   | sqlite `tmp/db.sqlite3`, Lucid migrations                                       | `pnpm typecheck` · `oxlint .`                                              |
| **Spring**    | `./mvnw -q -DskipTests package` then `java -jar target/cliuno-spring-template-*.jar`                      | sqlite `db.sqlite`, Hibernate `ddl-auto=update`                                 | `./mvnw test` (context loads)                                              |
| **ASP.NET**   | `~/.dotnet/dotnet run --project BackendASP.NET` (`PORT`)                                                  | sqlite `BackendASP.NET/db.sqlite`, EF Core `EnsureCreated` (PascalCase columns) | `dotnet build` (0 warnings)                                                |
| **TallStack** | `php artisan migrate --force` then `artisan serve` (same as Laravel)                                      | sqlite `database/database.sqlite`, migrations                                   | `php artisan test` (43) · `./vendor/bin/pint --test`                       |
| **Drogon**    | builds + runs inside `drogonframework/drogon:latest` via `docker run` (host needs docker + the image)     | sqlite `cliuno.db`, volume-mounted from the repo dir, created on boot           | build in the image (`cmake --build`); CI also smoke-tests register/login   |

## Matrix hooks

- **activateUser** (Express, Nest, Django): these three gate login on `is_verified`, so the
  matrix flips the flag directly after register — better-sqlite3 one-liners for the Node
  pair, `manage.py shell -c` for Django. FastAPI/Rails/Laravel don't gate login.
- **readToken(dir, email, 'reset'|'verify')**: reads the stored one-time token, standing in
  for the email. Columns: `reset_token`/`verify_token` everywhere except Rails and Laravel
  (`reset_password_token`/`verify_token`) and ASP.NET (PascalCase `ResetToken`/`VerifyToken`).
  Reader per stack: better-sqlite3 (Express, Nest, Fastify, Adonis), `manage.py shell`
  (Django — **take the last stdout line**, the shell prints an import banner),
  `python -c sqlite3` (FastAPI, Spring, ASP.NET), `bin/rails runner` (Rails),
  `php artisan tinker --execute` (Laravel).

## Quirks worth remembering

- **Express**: `_moduleAliases`/tsconfig paths mean run via `tsx`, not the tsup bundle, in dev.
  RoleMiddleware compares `user.role.name === 'admin'`.
- **Nest**: `commitlint.config.ts` must stay excluded in `tsconfig.build.json` or `dist/main.js`
  moves to `dist/src/` and `start:prod` breaks.
- **Django**: URL dialect is method-dispatched via `src/urls/dispatch.py`; collections are
  no-trailing-slash (`path('posts', ...)` + inner `'/<uuid:pk>'` string-concat style).
- **FastAPI**: pydantic `AliasChoices` gives camelCase+snake_case request compatibility;
  keep both keys in token responses (`token` and `access_token`).
- **Laravel**: token auth lives in `app/Http/Controllers/Api/AuthController.php` with Sanctum
  personal-access tokens (`refresh` ability for refresh tokens); `apiPrefix: 'api/v1'` in
  `bootstrap/app.php`; TOTP is the dependency-free `app/Services/TotpService.php`. Breeze
  session auth still exists for web routes — don't remove it.
- **Rails**: accepts camelCase and snake_case params in auth; `User.active` scope only checks
  `is_deleted`. rotp powers OTP.
- **Fastify**: bodyless POST/DELETE with a JSON content-type 400s by default — the custom
  `addContentTypeParser` in `src/app.ts` treats an empty body as `{}`. Don't remove it.
- **Adonis**: Lucid models use snake_case property names, so every `hasMany`/`belongsTo`
  declares an explicit `foreignKey`; `otp_base32` needs explicit `columnName` (naming
  strategy would mangle it to `otp_base_32`); `hi-base32` is CJS — default-import it.
  Refresh tokens are access tokens with the `refresh` ability.
- **Spring**: repositories must be **top-level** interfaces (nested ones aren't
  component-scanned); `open-in-view=false` means lazy collections 500 after the session
  closes — `Post.comments` is `FetchType.EAGER`; Jackson is globally SNAKE_CASE and
  map-literal envelope keys (`isFollowing`) are exempt from renaming.
- **ASP.NET**: System.Text.Json `SnakeCaseLower` naming with `DictionaryKeyPolicy = null`
  (dictionary envelope keys pass through verbatim) + `IgnoreCycles`; EF `EnsureCreated`
  yields PascalCase columns; `dotnet run` cwd puts the db at `BackendASP.NET/db.sqlite`.
- **JS templates generally**: oxc-only linting (`oxlint`)+`oxfmt` (style `semi:false, singleQuote`),
  prettier kept for css/md/html, TypeScript 6.0 except Angular (pinned <5.7 by Angular 19).
- **TallStack**: a fullstack TALL app (Livewire/Volt UI) whose API layer is a port of the
  Laravel template — the two must stay contract-identical; readToken/columns are the same
  as Laravel (`reset_password_token`/`verify_token` via `artisan tinker`). Its User model
  has no `name` column (username + first/last name) — Breeze-style additions must respect
  that.
- **Flutter frontend**: `lib/apis/*.dart` uses `'${id}'` brace interpolation on purpose —
  extraction maps `${...}` to `:p` exactly like the JS template literals.
- **Drogon**: C++17; the matrix `prepare` builds inside the drogon image as the host user
  (`--user $(id -u):$(id -g)` so `build/` + `cliuno.db` stay host-readable), cleaning any
  root-owned `build/` first (the README build runs as root). `start` does `docker run
--init -p 127.0.0.1:PORT:PORT` so SIGTERM tears the container down with `--rm`. `readToken`
  reads the volume-mounted `cliuno.db` with host `python3`. Requires the image pulled; on
  WSL where the docker credential helper is broken, `docker run` of a local image still works.
- **React Native frontend**: Expo SDK 57; `src/apis/` mirrors the React template
  one-to-one (same 29 endpoints). AsyncStorage v3 renamed `multiRemove` → `removeMany`.
