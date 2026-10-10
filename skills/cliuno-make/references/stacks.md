# What `make:resource <Name>` produces, per stack

Names: `<P>` PascalCase singular, `<Pp>` PascalCase plural, `<k>` kebab singular,
`<kp>` kebab plural, `<s>` snake singular, `<sp>` snake plural, `<c>` camel singular.
Every backend resource is auth-guarded, owned by the authenticated user, exposes
list / get / create / update / delete under `/api/v1/<kp>`, and returns
`{status, message, data: { <c> | <cp> }}`.

## Backends

| stack     | files                                                                                                                                                             | auto-registered in                | follow-ups printed                                       | native primitives                                    |
| --------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------- | -------------------------------------------------------- | ---------------------------------------------------- |
| express   | `src/entities/<k>.entity.ts`, `src/controllers/<k>.controller.ts`, `src/routers/v1/<k>.router.ts`, `src/validators/<k>.validator.ts`, `src/__tests__/<k>.spec.ts` | `src/routers/index.ts`            | restart dev server (TypeORM synchronize); wire validator | none (stubs)                                         |
| fastify   | see `cliuno make` in the template                                                                                                                                 | `src/app.ts`                      |                                                          | none (stubs)                                         |
| nest      | controller, service, dto, entity, module under `src/`                                                                                                             | `src/app.module.ts`               |                                                          | none (template layout differs from `nest g`)         |
| adonis    | controller, model, migration, validator                                                                                                                           | `start/routes.ts`                 | `node ace migration:run`                                 | `node ace make:controller/model/migration/validator` |
| django    | views, serializers, urls, model, test                                                                                                                             | `src/urls/`                       | `manage.py makemigrations && migrate`                    | `manage.py makemigrations` (migration)               |
| fastapi   | router, model, schema, test                                                                                                                                       | `src/app.py`                      |                                                          | none (stubs)                                         |
| laravel   | model, migration, controller, form request, feature test                                                                                                          | `routes/api.php`                  | `php artisan migrate`                                    | `php artisan make:*`                                 |
| tallstack | same as laravel                                                                                                                                                   | `routes/api.php`                  | `php artisan migrate`; optional Volt page                | `php artisan make:*`                                 |
| rails     | model, migration, `api/v1` controller, tests                                                                                                                      | `config/routes.rb`                | `bin/rails db:migrate`                                   | `bin/rails g model/controller/migration`             |
| spring    | entity, repository, controller                                                                                                                                    | component scan (nothing to patch) |                                                          | none (stubs)                                         |
| aspnet    | model, controller, DbSet                                                                                                                                          | DbContext                         |                                                          | none (stubs)                                         |
| drogon    | controller (+ schema statement)                                                                                                                                   | bootstrap schema                  |                                                          | none (stubs)                                         |

## Frontends

| stack       | files                                                                                                   | auto-registered in                          | follow-ups printed        | `component` delegates to            |
| ----------- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------- | ------------------------- | ----------------------------------- |
| react       | `src/apis/<k>-api.ts`, `src/views/app/<Pp>View.tsx`, `src/views/app/<P>DetailView.tsx`                  | `src/apis/index.ts`, `src/router/index.tsx` | nav link in DefaultLayout | `npx shadcn@latest add <k> -y`      |
| next        | `src/apis/<k>-api.ts`, `src/app/<kp>/page.tsx`, `src/app/<kp>/[id]/page.tsx`                            | `src/apis/index.ts`                         | nav link                  | `npx shadcn@latest add <k> -y`      |
| vue         | `src/apis/<k>-api.ts`, `src/views/app/<Pp>View.vue`, `<P>DetailView.vue`                                | `src/apis/index.ts`, `src/router/index.ts`  | nav link                  | `npx shadcn-vue@latest add <k>`     |
| nuxt        | `composables/use<P>Api.ts`, `pages/<kp>/index.vue`, `pages/<kp>/[id].vue`                               | auto-imports + file routing                 | nav link                  | `npx shadcn-vue@latest add <k>`     |
| svelte      | `src/lib/apis/<k>-api.ts`, `src/routes/<kp>/+page.svelte`, `src/routes/<kp>/[id]/+page.svelte`          | `src/lib/apis/index.ts`                     | nav link                  | `npx shadcn-svelte@latest add <k>`  |
| solid       | `src/apis/<k>-api.ts`, `src/pages/app/<Pp>Page.tsx`, `<P>DetailPage.tsx`                                | `src/apis/index.ts`, routes                 | nav link                  | stub (Kobalte-based component file) |
| angular     | `src/app/services/<k>-api.service.ts`, `src/app/views/app/<kp>.component.ts`, `<k>-detail.component.ts` | `src/app/app.routes.ts`                     | nav link                  | `ng g @spartan-ng/cli:ui <k>`       |
| flutter     | `lib/apis/<s>_api.dart`, `lib/screens/<sp>_screen.dart`, `lib/screens/<s>_detail_screen.dart`           | note: add to the routes map                 | nav entry                 | stub widget                         |
| reactnative | `src/apis/<k>-api.ts`, `src/app/<kp>/index.tsx`, `src/app/<kp>/[id].tsx`                                | `src/apis/index.ts`                         | tab/nav entry             | stub component                      |

A stack listed here but reported by `cliuno make` as "no generators yet" has not shipped
its module in the installed version — run `npx cliuno@latest make` to use the newest.
