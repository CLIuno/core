import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";

// Stubs mirror ../CLIuno-Solid-template (src/apis/todo-api.ts, src/pages/app/Todos*Page.tsx):
// signals + onMount, @solidjs/router, Kobalte-based shadcn-style UI, lucide-solid icons.

const TS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "number",
    number: "number",
    boolean: "boolean",
    date: "string",
    json: "Record<string, unknown>",
};

const INIT: Record<FieldType, string> = {
    string: "''",
    text: "''",
    int: "0",
    number: "0",
    boolean: "false",
    date: "''",
    json: "{}",
};

function tsType(f: Field): string {
    return `${TS[f.type]}${f.nullable ? " | null" : ""}`;
}

function iface(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `interface ${names.pascal} {
  id: string
${fields.map((f) => `  ${f.camel}: ${tsType(f)}`).join("\n")}
  createdAt: string
  user: { id: string; username: string; first_name: string; last_name: string }
}`;
}

function inputType(fields: Field[], partial: boolean): string {
    return `{ ${fields.map((f) => `${f.camel}${partial || f.nullable ? "?" : ""}: ${TS[f.type]}${f.nullable ? " | null" : ""}`).join("; ")} }`;
}

function api(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const path = names.plural.kebab;
    return {
        path: `src/apis/${names.kebab}-api.ts`,
        content: `import http from './http'

const ${names.camel}Api = {
  getAll${names.plural.pascal}: () => http.get('/${path}'),
  get${P}ById: (id: string) => http.get(\`/${path}/\${id}\`),
  create${P}: (data: ${inputType(fields, false)}) => http.post('/${path}', data),
  update${P}: (id: string, data: ${inputType(fields, true)}) =>
    http.patch(\`/${path}/\${id}\`, data),
  delete${P}: (id: string) => http.delete(\`/${path}/\${id}\`),
}

export default ${names.camel}Api
`,
    };
}

function signals(fields: Field[]): string {
    return fields
        .map(
            (f) =>
                `  const [${f.camel}, set${f.pascal}] = createSignal<${TS[f.type]}>(${INIT[f.type]})`,
        )
        .join("\n");
}

/** Empty strings become null for nullable string-ish fields so the backend gets a real null. */
function payload(fields: Field[]): string {
    return fields
        .map((f) => {
            const stringish = f.type === "string" || f.type === "text" || f.type === "date";
            return f.nullable && stringish
                ? `${f.camel}: ${f.camel}() || null`
                : `${f.camel}: ${f.camel}()`;
        })
        .join(", ");
}

function formInput(f: Field): string {
    const id = `${f.snake}-input`;
    const optional = f.nullable ? " (optional)" : "";
    if (f.type === "boolean") {
        return `            <Label class="cursor-pointer">
              <Checkbox checked={${f.camel}()} onChange={set${f.pascal}} />
              ${f.pascal}
            </Label>`;
    }
    if (f.type === "text") {
        return `            <div class="space-y-2">
              <Label for="${id}">${f.pascal}${optional}</Label>
              <Textarea
                id="${id}"
                value={${f.camel}()}
                onInput={(e) => set${f.pascal}(e.currentTarget.value)}
                rows="3"
              />
            </div>`;
    }
    if (f.type === "json") {
        return `            <div class="space-y-2">
              <Label for="${id}">${f.pascal} (JSON)</Label>
              <Textarea
                id="${id}"
                value={JSON.stringify(${f.camel}())}
                onInput={(e) => {
                  try {
                    set${f.pascal}(JSON.parse(e.currentTarget.value))
                  } catch {
                    // keep typing
                  }
                }}
                rows="3"
              />
            </div>`;
    }
    const numeric = f.type === "int" || f.type === "number";
    const type = numeric ? "number" : f.type === "date" ? "datetime-local" : "text";
    const setter = numeric
        ? `set${f.pascal}(Number(e.currentTarget.value))`
        : `set${f.pascal}(e.currentTarget.value)`;
    return `            <div class="space-y-2">
              <Label for="${id}">${f.pascal}${optional}</Label>
              <Input
                id="${id}"
                type="${type}"
                value={${f.camel}()}
                onInput={(e) => ${setter}}${f.nullable ? "" : "\n                required"}
              />
            </div>`;
}

function display(f: Field, varName: string): string {
    const v = `${varName}.${f.camel}`;
    if (f.type === "boolean") return `{${v} ? 'Yes' : 'No'}`;
    if (f.type === "json") return `{JSON.stringify(${v})}`;
    if (f.type === "date") return `{${v} ? timeAgo(${v}) : '—'}`;
    return `{String(${v} ?? '')}`;
}

function listPage(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const PP = names.plural.pascal;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    const reset = fields.map((f) => `      set${f.pascal}(${INIT[f.type]})`).join("\n");
    const usesCheckbox = fields.some((f) => f.type === "boolean");
    const usesTextarea = fields.some((f) => f.type === "text" || f.type === "json");
    const usesInput = fields.some((f) => !["boolean", "text", "json"].includes(f.type));
    return {
        path: `src/pages/app/${PP}Page.tsx`,
        content: `import { createSignal, onMount, For, Show } from 'solid-js'
import { A } from '@solidjs/router'
import { LoaderCircle, Package, Plus, Trash2, User } from 'lucide-solid'

import api from '@/apis'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
${usesCheckbox ? "import { Checkbox } from '@/components/ui/checkbox'\n" : ""}import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
${usesInput ? "import { Input } from '@/components/ui/input'\n" : ""}import { Label } from '@/components/ui/label'
${usesTextarea ? "import { Textarea } from '@/components/ui/textarea'\n" : ""}import { useAuth } from '@/stores/auth'
import { timeAgo } from '@/utils/helpers'

${iface(ctx)}

const ${PP}Page = () => {
  const auth = useAuth()
  const [${names.plural.camel}, set${PP}] = createSignal<${P}[]>([])
  const [loading, setLoading] = createSignal(true)
  const [showCreateModal, setShowCreateModal] = createSignal(false)
  const [creating, setCreating] = createSignal(false)
${signals(fields)}

  async function fetch${PP}() {
    setLoading(true)
    try {
      const res = await api.${names.camel}.getAll${PP}()
      set${PP}(res.data.data.${names.plural.camel})
    } catch {
      // handle
    } finally {
      setLoading(false)
    }
  }

  async function create${P}(e: Event) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.${names.camel}.create${P}({ ${payload(fields)} })
${reset}
      setShowCreateModal(false)
      await fetch${PP}()
    } catch {
      // handle
    } finally {
      setCreating(false)
    }
  }

  async function delete${P}(id: string) {
    try {
      await api.${names.camel}.delete${P}(id)
      set${PP}((prev) => prev.filter((item) => item.id !== id))
    } catch {
      // handle
    }
  }

  onMount(fetch${PP})

  return (
    <div class="mx-auto max-w-4xl px-4 py-8">
      {/* Header */}
      <div class="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 class="text-3xl font-bold tracking-tight">${names.plural.title}</h1>
          <p class="text-muted-foreground">Manage your ${names.plural.title.toLowerCase()}</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus class="size-4" />
          New ${names.title}
        </Button>
      </div>

      {/* Loading */}
      <Show when={loading()}>
        <div class="flex justify-center py-20">
          <LoaderCircle class="size-8 animate-spin text-muted-foreground" />
        </div>
      </Show>

      {/* Empty State */}
      <Show when={!loading() && ${names.plural.camel}().length === 0}>
        <div class="py-20 text-center">
          <Package class="mx-auto size-14 text-muted-foreground/40" />
          <h3 class="mt-4 text-xl font-semibold">No ${names.plural.title.toLowerCase()} yet</h3>
          <p class="mt-2 text-muted-foreground">Create your first ${names.title.toLowerCase()} to get started!</p>
        </div>
      </Show>

      {/* List */}
      <Show when={!loading() && ${names.plural.camel}().length > 0}>
        <div class="space-y-3">
          <For each={${names.plural.camel}()}>
            {(item) => (
              <Card class="transition-shadow hover:shadow-md">
                <CardContent class="flex items-start gap-3">
                  <div class="min-w-0 flex-1">
                    <A href={\`/${names.plural.kebab}/\${item.id}\`}>
                      <h3 class="text-lg font-semibold transition-colors hover:text-primary">
                        ${display(label, "item")}
                      </h3>
                    </A>
${others
    .map(
        (f) => `                    <p class="mt-1 text-sm text-muted-foreground">
                      ${f.pascal}: ${display(f, "item")}
                    </p>`,
    )
    .join("\n")}
                    <div class="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                      <A
                        href={\`/users/\${item.user.id}\`}
                        class="flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        <User class="size-3.5" />
                        {item.user.username}
                      </A>
                      <span>{timeAgo(item.createdAt)}</span>
                    </div>
                  </div>

                  {/* Actions */}
                  <Show when={item.user.id === auth.user()?.id}>
                    <Button
                      variant="ghost"
                      size="icon-sm"
                      onClick={() => delete${P}(item.id)}
                      class="text-muted-foreground hover:text-destructive"
                      aria-label="Delete ${names.title.toLowerCase()}"
                    >
                      <Trash2 class="size-4" />
                    </Button>
                  </Show>
                </CardContent>
              </Card>
            )}
          </For>
        </div>
      </Show>

      {/* Create Dialog */}
      <Dialog open={showCreateModal()} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New ${names.title}</DialogTitle>
            <DialogDescription>Fill in the details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create${P}} class="space-y-4">
${fields.map(formInput).join("\n")}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating()}>
                <Show when={creating()}>
                  <LoaderCircle class="size-4 animate-spin" />
                </Show>
                {creating() ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}

export default ${PP}Page
`,
    };
}

function detailPage(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    return {
        path: `src/pages/app/${P}DetailPage.tsx`,
        content: `import { createSignal, onMount, Show } from 'solid-js'
import { A, useNavigate, useParams } from '@solidjs/router'
import { ArrowLeft, LoaderCircle, Trash2, User } from 'lucide-solid'

import api from '@/apis'
import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { cn } from '@/lib/utils'
import { useAuth } from '@/stores/auth'
import { timeAgo } from '@/utils/helpers'

${iface(ctx)}

const ${P}DetailPage = () => {
  const params = useParams()
  const navigate = useNavigate()
  const auth = useAuth()

  const [${names.camel}, set${P}] = createSignal<${P} | null>(null)
  const [loading, setLoading] = createSignal(true)

  const id = () => params.id as string

  async function fetch${P}() {
    setLoading(true)
    try {
      const res = await api.${names.camel}.get${P}ById(id())
      set${P}(res.data.data.${names.camel})
    } catch {
      // handle
    } finally {
      setLoading(false)
    }
  }

  async function remove() {
    try {
      await api.${names.camel}.delete${P}(id())
      navigate('/${names.plural.kebab}')
    } catch {
      // handle
    }
  }

  onMount(fetch${P})

  return (
    <div class="mx-auto max-w-3xl px-4 py-8">
      {/* Back */}
      <A href="/${names.plural.kebab}" class={cn(buttonVariants({ variant: 'ghost', size: 'sm' }), 'mb-6')}>
        <ArrowLeft class="size-4" />
        Back to ${names.plural.title}
      </A>

      {/* Loading */}
      <Show when={loading()}>
        <div class="flex justify-center py-20">
          <LoaderCircle class="size-8 animate-spin text-muted-foreground" />
        </div>
      </Show>

      <Show when={!loading() && ${names.camel}()}>
        {(accessor) => {
          const t = accessor()
          return (
            <Card>
              <CardContent class="space-y-4">
                <div class="flex items-start justify-between gap-4">
                  <h1 class="text-2xl font-bold tracking-tight">${display(label, "t")}</h1>
                  <Show when={t.user.id === auth.user()?.id}>
                    <Button variant="outline" size="sm" onClick={remove} class="text-destructive">
                      <Trash2 class="size-4" />
                      Delete
                    </Button>
                  </Show>
                </div>
${others
    .map(
        (f) => `                <p class="text-muted-foreground">
                  <span class="font-medium text-foreground">${f.pascal}:</span> ${display(f, "t")}
                </p>`,
    )
    .join("\n")}

                {/* Meta */}
                <Separator />
                <div class="flex items-center gap-4 text-sm text-muted-foreground">
                  <A
                    href={\`/users/\${t.user.id}\`}
                    class="flex items-center gap-1 transition-colors hover:text-foreground"
                  >
                    <User class="size-3.5" />
                    {t.user.first_name} {t.user.last_name} (@{t.user.username})
                  </A>
                  <span>{timeAgo(t.createdAt)}</span>
                </div>
              </CardContent>
            </Card>
          )
        }}
      </Show>
    </div>
  )
}

export default ${P}DetailPage
`,
    };
}

function store(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `src/stores/${names.kebab}.ts`,
        content: `import { createSignal } from 'solid-js'
import api from '@/apis'

export ${iface(ctx)}

const [items, setItems] = createSignal<${P}[]>([])
const [loading, setLoading] = createSignal(false)

export function use${P}Store() {
  async function fetchAll() {
    setLoading(true)
    try {
      const res = await api.${names.camel}.getAll${names.plural.pascal}()
      setItems(res.data.data.${names.plural.camel})
    } finally {
      setLoading(false)
    }
  }

  async function remove(id: string) {
    await api.${names.camel}.delete${P}(id)
    setItems((prev) => prev.filter((item) => item.id !== id))
  }

  return { items, loading, fetchAll, remove }
}
`,
    };
}

function component(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `src/components/ui/${names.kebab}.tsx`,
        content: `import type { JSX } from 'solid-js'
import { splitProps } from 'solid-js'

import { cn } from '@/lib/utils'

// shadcn-style stub: wrap a @kobalte/core primitive here (see checkbox.tsx / dialog.tsx for the pattern).
const ${P} = (props: JSX.HTMLAttributes<HTMLDivElement>) => {
  const [local, others] = splitProps(props, ['class'])
  return <div data-slot="${names.kebab}" class={cn('flex flex-col gap-2', local.class)} {...others} />
}

export { ${P} }
`,
    };
}

function apiPatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    return [
        {
            path: "src/apis/index.ts",
            anchor: /^import \w+ from '\.\/[\w-]+-api'$/m,
            where: "after",
            insert: `\nimport ${names.camel}Api from './${names.kebab}-api'`,
            skipIf: `./${names.kebab}-api`,
            describe: `import ${names.kebab}-api`,
        },
        {
            path: "src/apis/index.ts",
            anchor: /^  \w+: \w+Api,$/m,
            where: "after",
            insert: `\n  ${names.camel}: ${names.camel}Api,`,
            skipIf: `${names.camel}: ${names.camel}Api`,
            describe: `expose api.${names.camel}`,
        },
    ];
}

function routePatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const list = `${names.plural.pascal}Page`;
    const detail = `${names.pascal}DetailPage`;
    const kp = names.plural.kebab;
    return [
        {
            path: "src/App.tsx",
            anchor: /^const \w+ = lazy\(\(\) => import\('@\/pages\/[\w/-]+'\)\)$/m,
            where: "after",
            insert: `\nconst ${list} = lazy(() => import('@/pages/app/${list}'))\nconst ${detail} = lazy(() => import('@/pages/app/${detail}'))`,
            skipIf: `@/pages/app/${list}`,
            describe: `lazy-import ${list}`,
        },
        {
            path: "src/App.tsx",
            anchor: '<Route path="/users" component={AppLayout}>',
            where: "before",
            insert: `<Route path="/${kp}" component={AppLayout}>\n        <Route path="/" component={${list}} />\n        <Route path="/:id" component={${detail}} />\n      </Route>\n      `,
            skipIf: `path="/${kp}"`,
            describe: `add /${kp} routes`,
        },
    ];
}

export const solid: Generator = {
    id: "solid",
    format: oxfmt,
    label: "SolidJS",
    kind: "frontend",
    commands: {
        resource: {
            describe:
                "api client + list page + detail page, registered in src/apis/index.ts and src/App.tsx",
            files: (ctx) => [api(ctx), listPage(ctx), detailPage(ctx)],
            patches: (ctx) => [...apiPatches(ctx), ...routePatches(ctx)],
            notes: (ctx) => [
                `Add a nav link to /${ctx.names.plural.kebab} in src/components/NavbarComp.tsx if you want it in the menu.`,
            ],
        },
        api: {
            describe: "axios API module in src/apis/ (+ registered in src/apis/index.ts)",
            files: (ctx) => [api(ctx)],
            patches: apiPatches,
        },
        page: {
            describe: "list + detail pages in src/pages/app/ (+ routes in src/App.tsx)",
            files: (ctx) => [listPage(ctx), detailPage(ctx)],
            patches: routePatches,
        },
        store: {
            describe: "signals-based store in src/stores/ (same shape as stores/auth.ts)",
            files: (ctx) => [store(ctx)],
        },
        component: {
            describe: "shadcn-style component stub in src/components/ui/ (no add CLI for Solid)",
            files: (ctx) => [component(ctx)],
        },
    },
};
