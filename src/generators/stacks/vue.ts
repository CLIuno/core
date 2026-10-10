import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";

// Field helpers below are exported because the Nuxt generator renders the same
// shadcn-vue UI (reka-ui primitives) and only differs in routing/auto-imports.

export const TS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "number",
    number: "number",
    boolean: "boolean",
    date: "string",
    json: "Record<string, unknown>",
};

export function tsType(f: Field): string {
    return `${TS[f.type]}${f.nullable ? " | null" : ""}`;
}

/** "firstName" → "First Name" for labels and list rows. */
export function fieldTitle(f: Field): string {
    return f.pascal.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

export function fieldKebab(f: Field): string {
    return f.snake.replace(/_/g, "-");
}

export function iface(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `interface ${names.pascal} {
  id: string
${fields.map((f) => `  ${f.camel}: ${tsType(f)}`).join("\n")}
  createdAt: string
  user: { id: string; username: string; first_name: string; last_name: string }
}`;
}

export function inputIface(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `export interface ${names.pascal}Input {
${fields.map((f) => `  ${f.camel}${f.nullable ? "?" : ""}: ${tsType(f)}`).join("\n")}
}`;
}

function formInit(f: Field): string {
    switch (f.type) {
        case "boolean":
            return "ref(false)";
        case "int":
        case "number":
            return "ref<string | number>('')";
        case "json":
            return "ref('{}')";
        default:
            return "ref('')";
    }
}

function formResetValue(f: Field): string {
    if (f.type === "boolean") return "false";
    if (f.type === "json") return "'{}'";
    return "''";
}

/** `const new<Field> = ref(...)` for every field of the create form. */
export function formRefs(fields: Field[]): string {
    return fields.map((f) => `const new${f.pascal} = ${formInit(f)}`).join("\n");
}

export function formReset(fields: Field[], indent: string): string {
    return fields.map((f) => `${indent}new${f.pascal}.value = ${formResetValue(f)}`).join("\n");
}

function payloadValue(f: Field): string {
    const v = `new${f.pascal}.value`;
    switch (f.type) {
        case "boolean":
            return v;
        case "int":
        case "number":
            return f.nullable ? `${v} === '' ? null : Number(${v})` : `Number(${v})`;
        case "json":
            return f.nullable ? `${v} ? JSON.parse(${v}) : null` : `JSON.parse(${v} || '{}')`;
        default:
            return f.nullable ? `${v} || null` : v;
    }
}

/** Object-literal body sent to `create<Name>` (one `key: value,` line per field). */
export function payload(fields: Field[], indent: string): string {
    return fields.map((f) => `${indent}${f.camel}: ${payloadValue(f)},`).join("\n");
}

/** Mustache expression rendering a field value. */
export function displayExpr(f: Field, v: string): string {
    switch (f.type) {
        case "boolean":
            return `${v} ? 'Yes' : 'No'`;
        case "json":
            return `JSON.stringify(${v})`;
        case "date":
            return `${v} ? new Date(${v}).toLocaleString() : '—'`;
        default:
            return f.nullable ? `${v} ?? '—'` : v;
    }
}

export function usesCheckbox(fields: Field[]): boolean {
    return fields.some((f) => f.type === "boolean");
}
export function usesTextarea(fields: Field[]): boolean {
    return fields.some((f) => f.type === "text" || f.type === "json");
}
export function usesInput(fields: Field[]): boolean {
    return fields.some((f) => !["boolean", "text", "json"].includes(f.type));
}

export const TIME_AGO = `function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 60) return \`\${mins}m ago\`
  const hours = Math.floor(mins / 60)
  if (hours < 24) return \`\${hours}h ago\`
  const days = Math.floor(hours / 24)
  return \`\${days}d ago\`
}`;

function api(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    const path = names.plural.kebab;
    return {
        path: `src/apis/${names.kebab}-api.ts`,
        content: `import http from './http'

${inputIface(ctx)}

const ${names.camel}Api = {
  getAll${names.plural.pascal}: () => http.get('/${path}'),
  get${P}ById: (id: string) => http.get(\`/${path}/\${id}\`),
  create${P}: (data: ${P}Input) => http.post('/${path}', data),
  update${P}: (id: string, data: Partial<${P}Input>) => http.patch(\`/${path}/\${id}\`, data),
  delete${P}: (id: string) => http.delete(\`/${path}/\${id}\`),
}

export default ${names.camel}Api
`,
    };
}

/** One form control inside the create dialog (12-space indent, mirrors TodosView.vue). */
function formInput(f: Field, kebab: string): string {
    const id = `${kebab}-${fieldKebab(f)}`;
    const model = `new${f.pascal}`;
    const title = fieldTitle(f);
    const optional = f.nullable ? " (optional)" : "";
    if (f.type === "boolean") {
        return `            <div class="flex items-center gap-2">
              <Checkbox
                id="${id}"
                :model-value="${model}"
                @update:model-value="(value) => (${model} = value === true)"
              />
              <Label for="${id}">${title}</Label>
            </div>`;
    }
    if (f.type === "text" || f.type === "json") {
        const suffix = f.type === "json" ? " (JSON)" : optional;
        return `            <div class="space-y-2">
              <Label for="${id}">${title}${suffix}</Label>
              <Textarea id="${id}" v-model="${model}" rows="3" />
            </div>`;
    }
    const attrs: string[] = [`id="${id}"`, `v-model="${model}"`];
    if (f.type === "int" || f.type === "number") attrs.push('type="number"');
    if (f.type === "number") attrs.push('step="any"');
    if (f.type === "date") attrs.push('type="datetime-local"');
    if (!f.nullable) attrs.push("required");
    return `            <div class="space-y-2">
              <Label for="${id}">${title}${optional}</Label>
              <Input ${attrs.join(" ")} />
            </div>`;
}

function listView(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const PP = names.plural.pascal;
    const items = names.plural.camel;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    const lower = names.title.toLowerCase();
    const lowerPlural = names.plural.title.toLowerCase();
    return {
        path: `src/views/app/${PP}View.vue`,
        content: `<script setup lang="ts">
import { Loader2, Package, Plus, Trash2 } from '@lucide/vue'
import api from '@/apis'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
${usesCheckbox(fields) ? "import { Checkbox } from '@/components/ui/checkbox'\n" : ""}import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog'
${usesInput(fields) ? "import { Input } from '@/components/ui/input'\n" : ""}import { Label } from '@/components/ui/label'
${usesTextarea(fields) ? "import { Textarea } from '@/components/ui/textarea'\n" : ""}import { useAuthStore } from '@/stores/auth'

const authStore = useAuthStore()

${iface(ctx)}

const ${items} = ref<${P}[]>([])
const loading = ref(true)
const showCreateModal = ref(false)
const creating = ref(false)
${formRefs(fields)}

async function fetch${PP}() {
  loading.value = true
  try {
    const res = await api.${names.camel}.getAll${PP}()
    ${items}.value = res.data.data.${items}
  } catch {
    // handle
  } finally {
    loading.value = false
  }
}

async function create${P}() {
  creating.value = true
  try {
    await api.${names.camel}.create${P}({
${payload(fields, "      ")}
    })
${formReset(fields, "    ")}
    showCreateModal.value = false
    await fetch${PP}()
  } catch {
    // handle
  } finally {
    creating.value = false
  }
}

async function delete${P}(id: string) {
  try {
    await api.${names.camel}.delete${P}(id)
    ${items}.value = ${items}.value.filter((item) => item.id !== id)
  } catch {
    // handle
  }
}

${TIME_AGO}

onMounted(fetch${PP})
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">${names.plural.title}</h1>
        <p class="text-muted-foreground">Manage your ${lowerPlural}</p>
      </div>

      <!-- Create Dialog -->
      <Dialog v-model:open="showCreateModal">
        <DialogTrigger as-child>
          <Button>
            <Plus />
            New ${names.title}
          </Button>
        </DialogTrigger>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create New ${names.title}</DialogTitle>
            <DialogDescription>Fill in the details below.</DialogDescription>
          </DialogHeader>
          <form class="space-y-4" @submit.prevent="create${P}">
${fields.map((f) => formInput(f, names.kebab)).join("\n")}
            <DialogFooter>
              <Button type="button" variant="outline" @click="showCreateModal = false">
                Cancel
              </Button>
              <Button type="submit" :disabled="creating">
                <Loader2 v-if="creating" class="animate-spin" />
                {{ creating ? 'Creating...' : 'Create' }}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty State -->
    <div v-else-if="${items}.length === 0" class="py-20 text-center">
      <Package class="mx-auto size-16 text-muted-foreground/40" />
      <h3 class="mt-4 text-xl font-semibold">No ${lowerPlural} yet</h3>
      <p class="mt-2 text-muted-foreground">Create your first ${lower} to get started!</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-3">
      <Card v-for="item in ${items}" :key="item.id" class="transition-shadow hover:shadow-md">
        <CardContent class="flex items-start gap-3">
          <div class="min-w-0 flex-1">
            <RouterLink :to="{ name: '${names.kebab}-detail', params: { id: item.id } }">
              <h3 class="text-base font-medium underline-offset-4 hover:underline">
                {{ ${displayExpr(label, `item.${label.camel}`)} }}
              </h3>
            </RouterLink>
${others
    .map(
        (f) => `            <p class="mt-1 text-sm text-muted-foreground">
              ${fieldTitle(f)}: {{ ${displayExpr(f, `item.${f.camel}`)} }}
            </p>`,
    )
    .join("\n")}
            <div class="mt-2 flex items-center gap-3 text-xs text-muted-foreground">
              <RouterLink
                :to="{ name: 'user-profile', params: { id: item.user.id } }"
                class="hover:text-foreground"
              >
                @{{ item.user.username }}
              </RouterLink>
              <span>{{ timeAgo(item.createdAt) }}</span>
            </div>
          </div>

          <Button
            v-if="item.user.id === authStore.user?.id"
            variant="ghost"
            size="icon"
            class="text-muted-foreground hover:text-destructive"
            aria-label="Delete ${lower}"
            @click="delete${P}(item.id)"
          >
            <Trash2 />
          </Button>
        </CardContent>
      </Card>
    </div>
  </div>
</template>
`,
    };
}

function detailView(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const item = names.camel;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    return {
        path: `src/views/app/${P}DetailView.vue`,
        content: `<script setup lang="ts">
import { ArrowLeft, Loader2, Trash2 } from '@lucide/vue'
import api from '@/apis'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Separator } from '@/components/ui/separator'
import { useAuthStore } from '@/stores/auth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const ${item}Id = route.params.id as string

${iface(ctx)}

const ${item} = ref<${P} | null>(null)
const loading = ref(true)

async function fetch${P}() {
  loading.value = true
  try {
    const res = await api.${item}.get${P}ById(${item}Id)
    ${item}.value = res.data.data.${item}
  } catch {
    // handle
  } finally {
    loading.value = false
  }
}

async function delete${P}() {
  try {
    await api.${item}.delete${P}(${item}Id)
    router.push({ name: '${names.plural.kebab}' })
  } catch {
    // handle
  }
}

${TIME_AGO}

onMounted(fetch${P})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8">
    <!-- Back -->
    <Button variant="ghost" size="sm" class="mb-6" as-child>
      <RouterLink :to="{ name: '${names.plural.kebab}' }">
        <ArrowLeft />
        Back to ${names.plural.title}
      </RouterLink>
    </Button>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <Loader2 class="size-8 animate-spin text-muted-foreground" />
    </div>

    <Card v-else-if="${item}">
      <CardContent>
        <div class="flex items-start justify-between gap-4">
          <h1 class="text-2xl font-bold tracking-tight">
            {{ ${displayExpr(label, `${item}.${label.camel}`)} }}
          </h1>
          <Button
            v-if="${item}.user.id === authStore.user?.id"
            variant="outline"
            size="sm"
            class="text-destructive"
            @click="delete${P}"
          >
            <Trash2 />
            Delete
          </Button>
        </div>
${others
    .map(
        (f) => `        <p class="mt-3 text-muted-foreground">
          <span class="font-medium text-foreground">${fieldTitle(f)}:</span>
          {{ ${displayExpr(f, `${item}.${f.camel}`)} }}
        </p>`,
    )
    .join("\n")}

        <!-- Meta -->
        <Separator class="my-4" />
        <div class="flex items-center gap-4 text-sm text-muted-foreground">
          <RouterLink
            :to="{ name: 'user-profile', params: { id: ${item}.user.id } }"
            class="hover:text-foreground"
          >
            {{ ${item}.user.first_name }} {{ ${item}.user.last_name }} (@{{ ${item}.user.username }})
          </RouterLink>
          <span>{{ timeAgo(${item}.createdAt) }}</span>
        </div>
      </CardContent>
    </Card>
  </div>
</template>
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

export const use${P}Store = defineStore('${names.camel}', () => {
  const items = ref<${P}[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const res = await api.${names.camel}.getAll${names.plural.pascal}()
      items.value = res.data.data.${names.plural.camel}
    } finally {
      loading.value = false
    }
  }

  async function remove(id: string) {
    await api.${names.camel}.delete${P}(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetchAll, remove }
})
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
    const kp = names.plural.kebab;
    return [
        {
            path: "src/router/index.ts",
            // the `todos/:id` child route object — new routes go right after it, inside the same layout group
            anchor: /^ {8}\{\n {10}path: 'todos\/:id',\n(?: {10}.*\n)* {8}\},\n/m,
            where: "after",
            insert: `        {
          path: '${kp}',
          name: '${kp}',
          component: () => import('@/views/app/${list}.vue'),
        },
        {
          path: '${kp}/:id',
          name: '${names.kebab}-detail',
          component: () => import('@/views/app/${detail}.vue'),
        },
`,
            skipIf: `@/views/app/${list}.vue`,
            describe: `add /${kp} routes`,
        },
    ];
}

export const vue: Generator = {
    id: "vue",
    format: oxfmt,
    label: "Vue",
    kind: "frontend",
    commands: {
        resource: {
            describe:
                "api client + list view + detail view, registered in src/apis/index.ts and src/router/index.ts",
            files: (ctx) => [api(ctx), listView(ctx), detailView(ctx)],
            patches: (ctx) => [...apiPatches(ctx), ...routerPatches(ctx)],
            notes: (ctx) => [
                `Add a nav link to { name: '${ctx.names.plural.kebab}' } in src/components/NavbarComp.vue if you want it in the menu.`,
            ],
        },
        api: {
            describe: "axios API module in src/apis/ (+ registered in src/apis/index.ts)",
            files: (ctx) => [api(ctx)],
            patches: apiPatches,
        },
        page: {
            describe: "list + detail views in src/views/app/ (+ routes in src/router/index.ts)",
            files: (ctx) => [listView(ctx), detailView(ctx)],
            patches: routerPatches,
        },
        store: { describe: "Pinia setup store in src/stores/", files: (ctx) => [store(ctx)] },
        component: {
            describe: "shadcn-vue component via npx shadcn-vue add",
            native: (ctx) => [
                { bin: "npx", args: ["shadcn-vue@latest", "add", ctx.names.kebab, "-y"] },
            ],
        },
    },
};
