# Per-backend operations reference

How each backend template boots, stores data, and verifies. The matrix registry in
`core/scripts/test-matrix.mjs` encodes the same facts as code — keep them in sync.

|             | boot (matrix)                                                                                             | database                                                                | verify locally                                                             |
| ----------- | --------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------- |
| **Express** | `node_modules/.bin/tsx src/app.ts` (`PORT`, `API_VERSION=v1`, `JWT_SECRET_KEY`, `REFRESH_JWT_SECRET_KEY`) | sqlite `db.sqlite`, TypeORM `synchronize: true`, table `users`          | `tsc --noEmit --skipLibCheck` · `oxlint .` · `oxfmt --check src/` · `tsup` |
| **Nest**    | `nest build` then `node dist/main.js` (`PORT`, `JWT_SECRET_KEY`)                                          | sqlite `database.sqlite`, TypeORM synchronize, table `Users`            | `oxlint .` · `nest build` · `jest`                                         |
| **Django**  | `manage.py migrate` then `runserver --noreload`                                                           | sqlite `db.sqlite3`, real migrations (`makemigrations src`)             | `manage.py check` · `manage.py test` (73)                                  |
| **FastAPI** | `uv run uvicorn src.app:app` with `DATABASE_URL=sqlite:///./matrix-test.db` (deleted each run)            | SQLAlchemy `create_all` on startup — model changes need a fresh db file | `uv run ruff check .` · `uv run pytest` (94)                               |
| **Laravel** | `php artisan migrate --force` then `artisan serve`                                                        | sqlite `database/database.sqlite`, migrations                           | `./vendor/bin/pint --test` · `php artisan test` (10)                       |
| **Rails**   | `bin/rails db:prepare` (runs seeds) then `bin/rails server`                                               | sqlite dev db, migrations + `db/seeds.rb` (roles + admin)               | `bundle exec rubocop` · `bin/rails test` (83)                              |

## Matrix hooks

- **activateUser** (Express, Nest, Django): these three gate login on `is_verified`, so the
  matrix flips the flag directly after register — better-sqlite3 one-liners for the Node
  pair, `manage.py shell -c` for Django. FastAPI/Rails/Laravel don't gate login.
- **readToken(dir, email, 'reset'|'verify')**: reads the stored one-time token, standing in
  for the email. Columns: `reset_token`/`verify_token` everywhere except Rails and Laravel,
  which use `reset_password_token`/`verify_token`. Reader per stack: better-sqlite3 (Express,
  Nest), `manage.py shell` (Django — **take the last stdout line**, the shell prints an
  import banner), `python -c sqlite3` (FastAPI), `bin/rails runner` (Rails),
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
- **JS templates generally**: oxc-only linting (`oxlint`)+`oxfmt` (style `semi:false, singleQuote`),
  prettier kept for css/md/html, TypeScript 6.0 except Angular (pinned <5.7 by Angular 19).
