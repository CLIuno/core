import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";

const TS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "number",
    number: "number",
    boolean: "boolean",
    date: "string",
    json: "Record<string, unknown>",
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

function formState(fields: Field[]): string {
    return fields
        .map((f) => {
            const init: Record<FieldType, string> = {
                string: "''",
                text: "''",
                int: "0",
                number: "0",
                boolean: "false",
                date: "''",
                json: "'{}'",
            };
            // JSON is edited as raw text and parsed on submit
            const stateType = f.type === "json" ? "string" : TS[f.type];
            return `  const [${f.camel}, set${f.pascal}] = useState<${stateType}>(${init[f.type]})`;
        })
        .join("\n");
}

function formInput(f: Field): string {
    const id = `${f.snake}-input`;
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
              <Label htmlFor="${id}">${f.pascal}${f.nullable ? " (optional)" : ""}</Label>
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
    const inputType = numeric ? "number" : f.type === "date" ? "datetime-local" : "text";
    const setter = numeric
        ? `set${f.pascal}(Number(e.target.value))`
        : `set${f.pascal}(e.target.value)`;
    return `            <div className="space-y-2">
              <Label htmlFor="${id}">${f.pascal}${f.nullable ? " (optional)" : ""}</Label>
              <Input
                id="${id}"
                type="${inputType}"
                value={${f.camel}}
                onChange={(e) => ${setter}}${f.nullable ? "" : "\n                required"}
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

function listView(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    const payload = fields
        .map((f) => {
            if (f.type !== "json") return f.camel;
            return f.nullable
                ? `${f.camel}: ${f.camel}.trim() ? JSON.parse(${f.camel}) : null`
                : `${f.camel}: JSON.parse(${f.camel} || '{}')`;
        })
        .join(", ");
    const reset = fields
        .map((f) => {
            const init: Record<FieldType, string> = {
                string: "''",
                text: "''",
                int: "0",
                number: "0",
                boolean: "false",
                date: "''",
                json: "'{}'",
            };
            return `      set${f.pascal}(${init[f.type]})`;
        })
        .join("\n");
    const usesCheckbox = fields.some((f) => f.type === "boolean");
    const usesTextarea = fields.some((f) => f.type === "text" || f.type === "json");
    const usesInput = fields.some((f) => !["boolean", "text", "json"].includes(f.type));
    const usesTimeAgo = true;
    return {
        path: `src/views/app/${names.plural.pascal}View.tsx`,
        content: `import { Loader2Icon, PackageIcon, PlusIcon, Trash2Icon, UserIcon } from 'lucide-react'
import api from '@/apis'
import { useAuthStore } from '@/stores/auth'
${usesTimeAgo ? "import { timeAgo } from '@/utils/timeAgo'\n" : ""}import { Button } from '@/components/ui/button'
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
${usesTextarea ? "import { Textarea } from '@/components/ui/textarea'\n" : ""}
${iface(ctx)}

export default function ${names.plural.pascal}View() {
  const { user } = useAuthStore()
  const [${names.plural.camel}, set${names.plural.pascal}] = useState<${P}[]>([])
  const [loading, setLoading] = useState(true)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
${formState(fields)}

  const fetch${names.plural.pascal} = useCallback(async () => {
    setLoading(true)
    try {
      const res = await api.${names.camel}.getAll${names.plural.pascal}()
      set${names.plural.pascal}(res.data.data.${names.plural.camel})
    } catch {
      // handle
    } finally {
      setLoading(false)
    }
  }, [])

  async function create${P}(e: React.SyntheticEvent) {
    e.preventDefault()
    setCreating(true)
    try {
      await api.${names.camel}.create${P}({ ${payload} })
${reset}
      setShowCreateModal(false)
      await fetch${names.plural.pascal}()
    } catch {
      // handle
    } finally {
      setCreating(false)
    }
  }

  async function delete${P}(id: string) {
    try {
      await api.${names.camel}.delete${P}(id)
      set${names.plural.pascal}((prev) => prev.filter((item) => item.id !== id))
    } catch {
      // handle
    }
  }

  useEffect(() => {
    fetch${names.plural.pascal}()
  }, [fetch${names.plural.pascal}])

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="mb-8 flex items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">${names.plural.title}</h1>
          <p className="text-muted-foreground">Manage your ${names.plural.title.toLowerCase()}</p>
        </div>
        <Button onClick={() => setShowCreateModal(true)}>
          <PlusIcon />
          New ${names.title}
        </Button>
      </div>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && ${names.plural.camel}.length === 0 && (
        <div className="py-20 text-center">
          <PackageIcon className="mx-auto size-14 text-muted-foreground/40" />
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
                  <Link to={\`/${names.plural.kebab}/\${item.id}\`}>
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
                    <Link
                      to={\`/users/\${item.user.id}\`}
                      className="flex items-center gap-1 transition-colors hover:text-foreground"
                    >
                      <UserIcon className="size-3.5" />
                      {item.user.username}
                    </Link>
                    <span>{timeAgo(item.createdAt)}</span>
                  </div>
                </div>
                {item.user.id === user?.id && (
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    onClick={() => delete${P}(item.id)}
                    className="text-destructive hover:text-destructive"
                    aria-label="Delete ${names.title.toLowerCase()}"
                  >
                    <Trash2Icon />
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
                {creating && <Loader2Icon className="animate-spin" />}
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

function detailView(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    return {
        path: `src/views/app/${P}DetailView.tsx`,
        content: `import { ArrowLeftIcon, Loader2Icon, Trash2Icon, UserIcon } from 'lucide-react'
import api from '@/apis'
import { useAuthStore } from '@/stores/auth'
import { timeAgo } from '@/utils/timeAgo'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'

${iface(ctx)}

export default function ${P}DetailView() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const [${names.camel}, set${P}] = useState<${P} | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch${P} = useCallback(async () => {
    if (!id) return
    setLoading(true)
    try {
      const res = await api.${names.camel}.get${P}ById(id)
      set${P}(res.data.data.${names.camel})
    } catch {
      // handle
    } finally {
      setLoading(false)
    }
  }, [id])

  async function remove() {
    if (!id) return
    try {
      await api.${names.camel}.delete${P}(id)
      navigate('/${names.plural.kebab}')
    } catch {
      // handle
    }
  }

  useEffect(() => {
    fetch${P}()
  }, [fetch${P}])

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <Button variant="ghost" size="sm" className="mb-6" render={<Link to="/${names.plural.kebab}" />}>
        <ArrowLeftIcon />
        Back to ${names.plural.title}
      </Button>

      {loading && (
        <div className="flex justify-center py-20">
          <Loader2Icon className="size-8 animate-spin text-muted-foreground" />
        </div>
      )}

      {!loading && ${names.camel} && (
        <Card>
          <CardContent className="space-y-4">
            <div className="flex items-start justify-between gap-4">
              <h1 className="text-2xl font-bold tracking-tight">${display(label, names.camel)}</h1>
              {${names.camel}.user.id === user?.id && (
                <Button variant="outline" size="sm" onClick={remove} className="text-destructive">
                  <Trash2Icon />
                  Delete
                </Button>
              )}
            </div>
${others
    .map(
        (f) => `            <p className="text-muted-foreground">
              <span className="font-medium text-foreground">${f.pascal}:</span> ${display(f, names.camel)}
            </p>`,
    )
    .join("\n")}
            <Separator />
            <div className="flex items-center gap-4 text-sm text-muted-foreground">
              <Link
                to={\`/users/\${${names.camel}.user.id}\`}
                className="flex items-center gap-1 transition-colors hover:text-foreground"
              >
                <UserIcon className="size-3.5" />
                {${names.camel}.user.first_name} {${names.camel}.user.last_name} (@{${names.camel}.user.username})
              </Link>
              <span>{timeAgo(${names.camel}.createdAt)}</span>
            </div>
          </CardContent>
        </Card>
      )}
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
        content: `import api from '@/apis'

${iface(ctx)}

interface ${P}State {
  items: ${P}[]
  loading: boolean
  fetchAll: () => Promise<void>
  remove: (id: string) => Promise<void>
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

  remove: async (id: string) => {
    await api.${names.camel}.delete${P}(id)
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

function routerPatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const list = `${names.plural.pascal}View`;
    const detail = `${names.pascal}DetailView`;
    return [
        {
            path: "src/router/index.tsx",
            anchor: /^const \w+ = lazy\(\(\) => import\('@\/views\/[\w/-]+'\)\)$/m,
            where: "after",
            insert: `\nconst ${list} = lazy(() => import('@/views/app/${list}'))\nconst ${detail} = lazy(() => import('@/views/app/${detail}'))`,
            skipIf: `@/views/app/${list}`,
            describe: `lazy-import ${list}`,
        },
        {
            path: "src/router/index.tsx",
            anchor: '<Route path="/profile"',
            where: "before",
            insert: `<Route path="/${names.plural.kebab}" element={<${list} />} />\n            <Route path="/${names.plural.kebab}/:id" element={<${detail} />} />\n            `,
            skipIf: `path="/${names.plural.kebab}"`,
            describe: `add /${names.plural.kebab} routes`,
        },
    ];
}

export const react: Generator = {
    id: "react",
    format: oxfmt,
    label: "React",
    kind: "frontend",
    commands: {
        resource: {
            describe:
                "api client + list view + detail view, registered in src/apis/index.ts and the router",
            files: (ctx) => [api(ctx), listView(ctx), detailView(ctx)],
            patches: (ctx) => [...apiPatches(ctx), ...routerPatches(ctx)],
            notes: (ctx) => [
                `Add a nav link to /${ctx.names.plural.kebab} in src/layouts/DefaultLayout.tsx if you want it in the menu.`,
            ],
        },
        api: {
            describe: "axios API module in src/apis/ (+ registered in src/apis/index.ts)",
            files: (ctx) => [api(ctx)],
            patches: apiPatches,
        },
        page: {
            describe: "list + detail views in src/views/app/ (+ routes)",
            files: (ctx) => [listView(ctx), detailView(ctx)],
            patches: routerPatches,
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
