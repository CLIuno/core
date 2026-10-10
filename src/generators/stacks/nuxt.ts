import fs from "node:fs";
import path from "node:path";
import type { Ctx, FileSpec, Generator } from "../types";
import type { Field } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";
import {
    displayExpr,
    fieldKebab,
    fieldTitle,
    formRefs,
    formReset,
    iface,
    inputIface,
    payload,
} from "./vue";

// Nuxt auto-imports composables, stores and components/ui and uses file routing, so a
// resource is just three files — nothing to register.

/** Nuxt 4 keeps the app in `app/`; older Nuxt 3-style checkouts keep pages/ at the root. */
function srcDir(ctx: Ctx): string {
    const has = (p: string) => fs.existsSync(path.join(ctx.cwd, p));
    if (has("app/pages") || has("app/app.vue")) return "app/";
    if (has("pages") || has("app.vue")) return "";
    return "app/";
}

function composable(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    const path = names.plural.kebab;
    return {
        path: `${srcDir(ctx)}composables/use${P}Api.ts`,
        content: `${inputIface(ctx)}

export function use${P}Api() {
  const http = useHttp()
  return {
    getAll${names.plural.pascal}: () => http.get('/${path}'),
    get${P}ById: (id: string) => http.get(\`/${path}/\${id}\`),
    create${P}: (data: ${P}Input) => http.post('/${path}', data),
    update${P}: (id: string, data: Partial<${P}Input>) => http.patch(\`/${path}/\${id}\`, data),
    delete${P}: (id: string) => http.delete(\`/${path}/\${id}\`),
  }
}
`,
    };
}

/** One form control inside the create dialog (10-space indent, mirrors pages/todos/index.vue). */
function formInput(f: Field, kebab: string): string {
    const id = `${kebab}-${fieldKebab(f)}`;
    const model = `new${f.pascal}`;
    const title = fieldTitle(f);
    const optional = f.nullable ? " (optional)" : "";
    if (f.type === "boolean") {
        return `          <div class="flex items-center gap-2">
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
        return `          <div class="space-y-2">
            <Label for="${id}">${title}${suffix}</Label>
            <Textarea id="${id}" v-model="${model}" :rows="3" />
          </div>`;
    }
    const attrs: string[] = [`id="${id}"`, `v-model="${model}"`];
    if (f.type === "int" || f.type === "number") attrs.push('type="number"');
    else if (f.type === "date") attrs.push('type="datetime-local"');
    else attrs.push('type="text"');
    if (f.type === "number") attrs.push('step="any"');
    if (!f.nullable) attrs.push("required");
    return `          <div class="space-y-2">
            <Label for="${id}">${title}${optional}</Label>
            <Input ${attrs.join(" ")} />
          </div>`;
}

function listPage(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const PP = names.plural.pascal;
    const items = names.plural.camel;
    const apiVar = `${names.camel}Api`;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    const lower = names.title.toLowerCase();
    const lowerPlural = names.plural.title.toLowerCase();
    return {
        path: `${srcDir(ctx)}pages/${names.plural.kebab}/index.vue`,
        content: `<script setup lang="ts">
import { Loader2Icon, PackageIcon, PlusIcon, Trash2Icon, UserIcon } from '@lucide/vue'

definePageMeta({ middleware: 'auth' })

const authStore = useAuthStore()
const ${apiVar} = use${P}Api()
const timeAgo = useTimeAgo()

${iface(ctx)}

const ${items} = ref<${P}[]>([])
const loading = ref(true)
const showCreateModal = ref(false)
const creating = ref(false)
${formRefs(fields)}

async function fetch${PP}() {
  loading.value = true
  try {
    const res = await ${apiVar}.getAll${PP}()
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
    await ${apiVar}.create${P}({
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
    await ${apiVar}.delete${P}(id)
    ${items}.value = ${items}.value.filter((item) => item.id !== id)
  } catch {
    // handle
  }
}

onMounted(fetch${PP})
</script>

<template>
  <div class="mx-auto max-w-4xl px-4 py-8">
    <!-- Header -->
    <div class="mb-8 flex items-center justify-between gap-4">
      <div>
        <h1 class="text-3xl font-bold">${names.plural.title}</h1>
        <p class="text-muted-foreground">Manage your ${lowerPlural}</p>
      </div>
      <Button @click="showCreateModal = true">
        <PlusIcon class="size-4" />
        New ${names.title}
      </Button>
    </div>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <Loader2Icon class="size-8 animate-spin text-muted-foreground" />
    </div>

    <!-- Empty State -->
    <div v-else-if="${items}.length === 0" class="py-20 text-center">
      <PackageIcon class="mx-auto size-16 text-muted-foreground/40" />
      <h3 class="mt-4 text-xl font-semibold">No ${lowerPlural} yet</h3>
      <p class="mt-2 text-muted-foreground">Create your first ${lower} to get started!</p>
    </div>

    <!-- List -->
    <div v-else class="space-y-3">
      <Card v-for="item in ${items}" :key="item.id" class="py-4">
        <CardContent class="flex items-start gap-3 px-4">
          <!-- Content -->
          <div class="min-w-0 flex-1">
            <NuxtLink :to="\`/${names.plural.kebab}/\${item.id}\`">
              <h3 class="font-semibold transition-colors hover:text-muted-foreground">
                {{ ${displayExpr(label, `item.${label.camel}`)} }}
              </h3>
            </NuxtLink>
${others
    .map(
        (f) => `            <p class="mt-1 text-sm text-muted-foreground">
              ${fieldTitle(f)}: {{ ${displayExpr(f, `item.${f.camel}`)} }}
            </p>`,
    )
    .join("\n")}
            <div class="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
              <NuxtLink
                :to="\`/users/\${item.user.id}\`"
                class="flex items-center gap-1 hover:text-foreground"
              >
                <UserIcon class="size-4" />
                @{{ item.user.username }}
              </NuxtLink>
              <span>{{ timeAgo(item.createdAt) }}</span>
            </div>
          </div>

          <!-- Actions -->
          <Button
            v-if="item.user.id === authStore.user?.id"
            variant="ghost"
            size="icon-sm"
            class="text-muted-foreground hover:text-destructive"
            aria-label="Delete ${lower}"
            @click="delete${P}(item.id)"
          >
            <Trash2Icon class="size-4" />
          </Button>
        </CardContent>
      </Card>
    </div>

    <!-- Create Dialog -->
    <Dialog v-model:open="showCreateModal">
      <DialogContent class="sm:max-w-md">
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
              <Loader2Icon v-if="creating" class="size-4 animate-spin" />
              {{ creating ? 'Creating...' : 'Create' }}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  </div>
</template>
`,
    };
}

function detailPage(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const item = names.camel;
    const apiVar = `${item}Api`;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    return {
        path: `${srcDir(ctx)}pages/${names.plural.kebab}/[id].vue`,
        content: `<script setup lang="ts">
import { ArrowLeftIcon, Loader2Icon, Trash2Icon, UserIcon } from '@lucide/vue'

definePageMeta({ middleware: 'auth' })

const route = useRoute()
const authStore = useAuthStore()
const ${apiVar} = use${P}Api()
const timeAgo = useTimeAgo()
const ${item}Id = route.params.id as string

${iface(ctx)}

const ${item} = ref<${P} | null>(null)
const loading = ref(true)

async function fetch${P}() {
  loading.value = true
  try {
    const res = await ${apiVar}.get${P}ById(${item}Id)
    ${item}.value = res.data.data.${item}
  } catch {
    // handle
  } finally {
    loading.value = false
  }
}

async function delete${P}() {
  try {
    await ${apiVar}.delete${P}(${item}Id)
    await navigateTo('/${names.plural.kebab}')
  } catch {
    // handle
  }
}

onMounted(fetch${P})
</script>

<template>
  <div class="mx-auto max-w-3xl px-4 py-8">
    <!-- Back -->
    <Button variant="ghost" size="sm" class="mb-6" as-child>
      <NuxtLink to="/${names.plural.kebab}">
        <ArrowLeftIcon class="size-4" />
        Back to ${names.plural.title}
      </NuxtLink>
    </Button>

    <!-- Loading -->
    <div v-if="loading" class="flex justify-center py-20">
      <Loader2Icon class="size-8 animate-spin text-muted-foreground" />
    </div>

    <Card v-else-if="${item}">
      <CardContent>
        <div class="flex items-start justify-between gap-4">
          <h1 class="text-2xl font-bold">{{ ${displayExpr(label, `${item}.${label.camel}`)} }}</h1>
          <Button
            v-if="${item}.user.id === authStore.user?.id"
            variant="outline"
            size="sm"
            class="text-destructive"
            @click="delete${P}"
          >
            <Trash2Icon class="size-4" />
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
        <div class="mt-4 flex items-center gap-4 border-t pt-4 text-sm text-muted-foreground">
          <NuxtLink
            :to="\`/users/\${${item}.user.id}\`"
            class="flex items-center gap-1 hover:text-foreground"
          >
            <UserIcon class="size-4" />
            {{ ${item}.user.first_name }} {{ ${item}.user.last_name }} (@{{ ${item}.user.username }})
          </NuxtLink>
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
    const apiVar = `${names.camel}Api`;
    return {
        path: `${srcDir(ctx)}stores/${names.kebab}.ts`,
        content: `${iface(ctx)}

export const use${P}Store = defineStore('${names.camel}', () => {
  const ${apiVar} = use${P}Api()
  const items = ref<${P}[]>([])
  const loading = ref(false)

  async function fetchAll() {
    loading.value = true
    try {
      const res = await ${apiVar}.getAll${names.plural.pascal}()
      items.value = res.data.data.${names.plural.camel}
    } finally {
      loading.value = false
    }
  }

  async function remove(id: string) {
    await ${apiVar}.delete${P}(id)
    items.value = items.value.filter((item) => item.id !== id)
  }

  return { items, loading, fetchAll, remove }
})
`,
    };
}

const lintHint = (ctx: Ctx) =>
    `Optional: add "use${ctx.names.pascal}Api": "readonly" to the globals in .oxlintrc.json (keeps the auto-import list in sync).`;

export const nuxt: Generator = {
    id: "nuxt",
    format: oxfmt,
    label: "Nuxt",
    kind: "frontend",
    commands: {
        resource: {
            describe:
                "use<Name>Api composable + list page + detail page (auto-imported, file-routed — nothing to register)",
            files: (ctx) => [composable(ctx), listPage(ctx), detailPage(ctx)],
            notes: (ctx) => [
                `Add a NuxtLink to /${ctx.names.plural.kebab} in components/NavbarComp.vue if you want it in the menu.`,
                lintHint(ctx),
            ],
        },
        api: {
            describe: "use<Name>Api composable in app/composables/ (auto-imported)",
            files: (ctx) => [composable(ctx)],
            notes: (ctx) => [lintHint(ctx)],
        },
        page: {
            describe: "list + detail pages in app/pages/<kebab-plural>/ (file-routed)",
            files: (ctx) => [listPage(ctx), detailPage(ctx)],
        },
        store: {
            describe: "Pinia setup store in stores/ (auto-imported)",
            files: (ctx) => [store(ctx)],
        },
        component: {
            describe: "shadcn-vue component via npx shadcn-vue add",
            native: (ctx) => [
                { bin: "npx", args: ["shadcn-vue@latest", "add", ctx.names.kebab, "-y"] },
            ],
        },
    },
};
