import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";

// Stubs mirror ../CLIuno-Next-template (src/apis/todo-api.ts, src/app/todos/page.tsx,
// src/app/todos/[id]/page.tsx): App Router client pages ('use client'), explicit React
// imports (no auto-imports), next/link + next/navigation, Base UI shadcn components,
// zustand auth store. File routing → only src/apis/index.ts needs a patch.

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
    json: "'{}'",
};

function tsType(f: Field): string {
    return `${TS[f.type]}${f.nullable ? " | null" : ""}`;
}

function iface(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `interface ${names.pascal} {
  id: string | number
${fields.map((f) => `  ${f.camel}: ${tsType(f)}`).join("\n")}
  createdAt?: string
  user?: { id: string | number; username: string }
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

function formState(fields: Field[]): string {
    return fields
        .map(
            (f) =>
                `  const [${f.camel}, set${f.pascal}] = useState<${f.type === "json" ? "string" : TS[f.type]}>(${INIT[f.type]})`,
        )
        .join("\n");
}

/** Empty strings become null for nullable string-ish fields so the backend gets a real null. */
function payload(fields: Field[]): string {
    return fields
        .map((f) => {
            if (f.type === "json") {
                // edited as raw text; parsed on submit
                return f.nullable
                    ? `${f.camel}: ${f.camel}.trim() ? JSON.parse(${f.camel}) : null`
                    : `${f.camel}: JSON.parse(${f.camel} || '{}')`;
            }
            const stringish = f.type === "string" || f.type === "text" || f.type === "date";
            return f.nullable && stringish ? `${f.camel}: ${f.camel} || null` : f.camel;
        })
        .join(", ");
}

function formInput(f: Field): string {
    const id = `${f.snake}-input`;
    const optional = f.nullable ? " (optional)" : "";
    if (f.type === "boolean") {
        return `            <div className="flex items-center gap-2">
              <Checkbox
                id="${id}"
                checked={${f.camel}}
                onCheckedChange={(v) => set${f.pascal}(v === true)}
              />
              <Label htmlFor="${id}">${f.pascal}</Label>
            </div>`;
    }
    if (f.type === "text") {
        return `            <div className="space-y-2">
              <Label htmlFor="${id}">${f.pascal}${optional}</Label>
              <Textarea
                id="${id}"
                value={${f.camel}}
                onChange={(e) => set${f.pascal}(e.target.value)}
                rows={3}
              />
            </div>`;
    }
    if (f.type === "json") {
        return `            <div className="space-y-2">
              <Label htmlFor="${id}">${f.pascal} (JSON)</Label>
              <Textarea
                id="${id}"
                value={${f.camel}}
                onChange={(e) => set${f.pascal}(e.target.value)}
                placeholder='{"key": "value"}'
                rows={3}
              />
            </div>`;
    }
    const numeric = f.type === "int" || f.type === "number";
    const type = numeric ? "number" : f.type === "date" ? "datetime-local" : "text";
    const setter = numeric
        ? `set${f.pascal}(Number(e.target.value))`
        : `set${f.pascal}(e.target.value)`;
    return `            <div className="space-y-2">
              <Label htmlFor="${id}">${f.pascal}${optional}</Label>
              <Input
                id="${id}"
                type="${type}"
                value={${f.camel}}
                onChange={(e) => ${setter}}${f.nullable ? "" : "\n                required"}
              />
            </div>`;
}

function display(f: Field, varName: string): string {
    const v = `${varName}.${f.camel}`;
    if (f.type === "boolean") return `{${v} ? 'Yes' : 'No'}`;
    if (f.type === "json") return `{JSON.stringify(${v})}`;
    if (f.type === "date") return `{${v} ? new Date(${v}).toLocaleString() : '—'}`;
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
        path: `src/app/${names.plural.kebab}/page.tsx`,
        content: `'use client'

import { Loader2, Package, Plus, Trash2, User } from 'lucide-react'
import Link from 'next/link'
import { useCallback, useEffect, useState } from 'react'

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
${usesTextarea ? "import { Textarea } from '@/components/ui/textarea'\n" : ""}import api from '@/apis'
import { useAuthStore } from '@/stores/auth'

${iface(ctx)}

export default function ${PP}Page() {
  const { user } = useAuthStore()
  const [${names.plural.camel}, set${PP}] = useState<${P}[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
${formState(fields)}

  const fetch${PP} = useCallback(async () => {
    try {
      const res = await api.${names.camel}.getAll${PP}()
      set${PP}(res.data.data.${names.plural.camel})
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    void fetch${PP}()
  }, [fetch${PP}])

  async function create${P}(e: React.FormEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.${names.camel}.create${P}({ ${payload(fields)} })
${reset}
      setShowCreateModal(false)
      await fetch${PP}()
    } finally {
      setCreating(false)
    }
  }

  async function remove(id: ${P}['id']) {
    await api.${names.camel}.delete${P}(String(id))
    set${PP}((prev) => prev.filter((item) => item.id !== id))
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">${names.plural.title}</h1>
          <p className="text-muted-foreground">Manage your ${names.plural.title.toLowerCase()}</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <Plus />
          New ${names.title}
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2 className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && ${names.plural.camel}.length === 0 && (
        <div className="py-20 text-center">
          <Package className="mx-auto size-14 text-muted-foreground/40" />
          <h3 className="mt-4 text-xl font-semibold">No ${names.plural.title.toLowerCase()} yet</h3>
          <p className="mt-2 text-muted-foreground">Create your first ${names.title.toLowerCase()} to get started!</p>
        </div>
      )}

      {!loading && ${names.plural.camel}.length > 0 && (
        <div className="space-y-3">
          {${names.plural.camel}.map((item) => (
            <Card key={item.id} className="transition-shadow hover:shadow-md">
              <CardContent className="flex items-start gap-3">
                <div className="min-w-0 flex-1">
                  <Link href={\`/${names.plural.kebab}/\${item.id}\`}>
                    <h3 className="text-lg font-semibold transition-colors hover:text-primary">
                      ${display(label, "item")}
                    </h3>
                  </Link>
${others
    .map(
        (f) => `                  <p className="mt-1 text-sm text-muted-foreground">
                    ${f.pascal}: ${display(f, "item")}
                  </p>`,
    )
    .join("\n")}
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    {item.user && (
                      <Link
                        href={\`/users/\${item.user.id}\`}
                        className="flex items-center gap-1 transition-colors hover:text-foreground"
                      >
                        <User className="size-3.5" />
                        {item.user.username}
                      </Link>
                    )}
                    {item.createdAt && <span>{new Date(item.createdAt).toLocaleDateString()}</span>}
                  </div>
                </div>
                {user && item.user?.id === user.id && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => remove(item.id)}
                    aria-label="Delete ${names.title.toLowerCase()}"
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 />
                  </Button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New ${names.title}</DialogTitle>
            <DialogDescription>Fill in the details below.</DialogDescription>
          </DialogHeader>
          <form onSubmit={create${P}} className="space-y-4">
${fields.map(formInput).join("\n")}
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating && <Loader2 className="animate-spin" />}
                {creating ? 'Creating...' : 'Create'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
`,
    };
}

function detailPage(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    return {
        path: `src/app/${names.plural.kebab}/[id]/page.tsx`,
        content: `'use client'

import { ArrowLeft, Loader2, Trash2, User } from 'lucide-react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { useCallback, useEffect, useState } from 'react'

import { Button, buttonVariants } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import api from '@/apis'
import { useAuthStore } from '@/stores/auth'

${iface(ctx)}

export default function ${P}DetailPage() {
  const params = useParams<{ id: string }>()
  const router = useRouter()
  const { user } = useAuthStore()
  const [${names.camel}, set${P}] = useState<${P} | null>(null)

  const fetch${P} = useCallback(async () => {
    const res = await api.${names.camel}.get${P}ById(params.id)
    set${P}(res.data.data.${names.camel})
  }, [params.id])

  useEffect(() => {
    void fetch${P}()
  }, [fetch${P}])

  async function remove() {
    await api.${names.camel}.delete${P}(params.id)
    router.push('/${names.plural.kebab}')
  }

  if (!${names.camel}) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="size-8 animate-spin text-muted-foreground" />
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-2xl space-y-4 px-4 py-8">
      <Link href="/${names.plural.kebab}" className={buttonVariants({ variant: 'ghost', size: 'sm' })}>
        <ArrowLeft />
        Back to ${names.plural.title.toLowerCase()}
      </Link>
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">${display(label, names.camel)}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
${others
    .map(
        (f) => `          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">${f.pascal}:</span> ${display(f, names.camel)}
          </p>`,
    )
    .join("\n")}
          <Separator className="my-4" />
          <div className="flex items-center justify-between gap-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-4">
              {${names.camel}.user && (
                <Link
                  href={\`/users/\${${names.camel}.user.id}\`}
                  className="flex items-center gap-1 transition-colors hover:text-foreground"
                >
                  <User className="size-3.5" />
                  {${names.camel}.user.username}
                </Link>
              )}
              {${names.camel}.createdAt && <span>{new Date(${names.camel}.createdAt).toLocaleDateString()}</span>}
            </div>
            {user && ${names.camel}.user?.id === user.id && (
              <Button variant="outline" size="sm" onClick={remove} className="text-destructive">
                <Trash2 />
                Delete
              </Button>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
`,
    };
}

function store(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `src/stores/${names.kebab}.ts`,
        content: `'use client'

import { create } from 'zustand'

import api from '@/apis'

export ${iface(ctx)}

interface ${P}State {
  items: ${P}[]
  loading: boolean
  fetchAll: () => Promise<void>
  remove: (id: ${P}['id']) => Promise<void>
}

export const use${P}Store = create<${P}State>((set) => ({
  items: [],
  loading: false,

  fetchAll: async () => {
    set({ loading: true })
    try {
      const res = await api.${names.camel}.getAll${names.plural.pascal}()
      set({ items: res.data.data.${names.plural.camel} })
    } finally {
      set({ loading: false })
    }
  },

  remove: async (id) => {
    await api.${names.camel}.delete${P}(String(id))
    set((state) => ({ items: state.items.filter((item) => item.id !== id) }))
  },
}))
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

export const next: Generator = {
    id: "next",
    format: oxfmt,
    label: "Next.js",
    kind: "frontend",
    commands: {
        resource: {
            describe:
                "api client + list page + detail page under src/app/<plural>/ (file routing), registered in src/apis/index.ts",
            files: (ctx) => [api(ctx), listPage(ctx), detailPage(ctx)],
            patches: apiPatches,
            notes: (ctx) => [
                `Add a nav link to /${ctx.names.plural.kebab} in src/components/Navbar.tsx if you want it in the menu.`,
            ],
        },
        api: {
            describe: "axios API module in src/apis/ (+ registered in src/apis/index.ts)",
            files: (ctx) => [api(ctx)],
            patches: apiPatches,
        },
        page: {
            describe: "list + detail client pages under src/app/<plural>/ (file routing, no patch)",
            files: (ctx) => [listPage(ctx), detailPage(ctx)],
        },
        store: { describe: "zustand store in src/stores/", files: (ctx) => [store(ctx)] },
        component: {
            describe: "shadcn/ui component via npx shadcn add",
            native: (ctx) => [
                { bin: "npx", args: ["shadcn@latest", "add", ctx.names.kebab, "-y"] },
            ],
        },
    },
};
