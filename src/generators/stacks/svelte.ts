import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";

// The Svelte template is formatted by prettier (tabs, semicolons, single quotes, no
// trailing commas, printWidth 100) — there is no oxfmt there, so the stubs are written
// prettier-clean by hand and no post-write formatter is wired.

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

function fieldTitle(f: Field): string {
    return f.pascal.replace(/([a-z0-9])([A-Z])/g, "$1 $2");
}

function fieldKebab(f: Field): string {
    return f.snake.replace(/_/g, "-");
}

function iface(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `	interface ${names.pascal} {
		id: string;
${fields.map((f) => `		${f.camel}: ${tsType(f)};`).join("\n")}
		createdAt: string;
		user: { id: string; username: string; first_name: string; last_name: string };
	}`;
}

function stateInit(f: Field): string {
    switch (f.type) {
        case "boolean":
            return "$state(false)";
        case "int":
        case "number":
            return "$state<string | number>('')";
        case "json":
            return "$state('{}')";
        default:
            return "$state('')";
    }
}

function resetValue(f: Field): string {
    if (f.type === "boolean") return "false";
    if (f.type === "json") return "'{}'";
    return "''";
}

function payloadValue(f: Field): string {
    const v = `new${f.pascal}`;
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

function displayExpr(f: Field, v: string): string {
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

/** prettier (printWidth 100, tab = 2 columns): keep `head tail` on one line only when it fits. */
function fit(tabs: number, head: string, tail: string, continuation = "\t"): string {
    const oneLine = `${head} ${tail}`;
    if (tabs * 2 + oneLine.length <= 100) return oneLine;
    return `${head}\n${"\t".repeat(tabs)}${continuation}${tail}`;
}

function api(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const path = names.plural.kebab;
    return {
        path: `src/lib/apis/${names.kebab}-api.ts`,
        content: `import http from '$lib/apis/http';

export interface ${P}Input {
${fields.map((f) => `	${f.camel}${f.nullable ? "?" : ""}: ${tsType(f)};`).join("\n")}
}

const ${names.camel}Api = {
	getAll${names.plural.pascal}: () => http.get('/${path}'),
	get${P}ById: (id: string) => http.get(\`/${path}/\${id}\`),
	create${P}: (data: ${P}Input) => http.post('/${path}', data),
	${fit(1, `update${P}: (id: string, data: Partial<${P}Input>) =>`, `http.patch(\`/${path}/\${id}\`, data),`)}
	delete${P}: (id: string) => http.delete(\`/${path}/\${id}\`)
};

export default ${names.camel}Api;
`,
    };
}

/** One form control inside the create dialog (4-tab indent). */
function formInput(f: Field, kebab: string): string {
    const id = `${kebab}-${fieldKebab(f)}`;
    const model = `new${f.pascal}`;
    const title = fieldTitle(f);
    const optional = f.nullable ? " (optional)" : "";
    if (f.type === "boolean") {
        return `				<div class="flex items-center gap-2">
					<Checkbox id="${id}" bind:checked={${model}} />
					<Label for="${id}">${title}</Label>
				</div>`;
    }
    if (f.type === "text" || f.type === "json") {
        const suffix = f.type === "json" ? " (JSON)" : optional;
        return `				<div class="space-y-2">
					<Label for="${id}">${title}${suffix}</Label>
					<Textarea id="${id}" bind:value={${model}} rows={3} />
				</div>`;
    }
    const attrs: string[] = [`id="${id}"`];
    if (f.type === "int" || f.type === "number") attrs.push('type="number"');
    if (f.type === "number") attrs.push('step="any"');
    if (f.type === "date") attrs.push('type="datetime-local"');
    attrs.push(`bind:value={${model}}`);
    if (!f.nullable) attrs.push("required");
    return `				<div class="space-y-2">
					<Label for="${id}">${title}${optional}</Label>
					<Input ${attrs.join(" ")} />
				</div>`;
}

function listPage(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const PP = names.plural.pascal;
    const items = names.plural.camel;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    const lower = names.title.toLowerCase();
    const lowerPlural = names.plural.title.toLowerCase();
    const hasCheckbox = fields.some((f) => f.type === "boolean");
    const hasTextarea = fields.some((f) => f.type === "text" || f.type === "json");
    const hasInput = fields.some((f) => !["boolean", "text", "json"].includes(f.type));
    return {
        path: `src/routes/${names.plural.kebab}/+page.svelte`,
        content: `<script lang="ts">
	import { onMount } from 'svelte';
	import api from '$lib/apis';
	import { user } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';
	import { Card } from '$lib/components/ui/card';
${hasCheckbox ? "\timport { Checkbox } from '$lib/components/ui/checkbox';\n" : ""}	import {
		Dialog,
		DialogContent,
		DialogDescription,
		DialogFooter,
		DialogHeader,
		DialogTitle
	} from '$lib/components/ui/dialog';
${hasInput ? "\timport { Input } from '$lib/components/ui/input';\n" : ""}	import { Label } from '$lib/components/ui/label';
${hasTextarea ? "\timport { Textarea } from '$lib/components/ui/textarea';\n" : ""}	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Plus from '@lucide/svelte/icons/plus';
	import Trash2 from '@lucide/svelte/icons/trash-2';

${iface(ctx)}

	let ${items} = $state<${P}[]>([]);
	let loading = $state(true);
	let showCreate = $state(false);
	let creating = $state(false);
${fields.map((f) => `	let new${f.pascal} = ${stateInit(f)};`).join("\n")}

	async function fetch${PP}() {
		try {
			const res = await api.${names.camel}.getAll${PP}();
			${items} = res.data.data.${items};
		} finally {
			loading = false;
		}
	}

	onMount(fetch${PP});

	async function create${P}(e: SubmitEvent) {
		e.preventDefault();
		creating = true;
		try {
			await api.${names.camel}.create${P}({
${fields.map((f) => `				${f.camel}: ${payloadValue(f)}`).join(",\n")}
			});
${fields.map((f) => `			new${f.pascal} = ${resetValue(f)};`).join("\n")}
			showCreate = false;
			await fetch${PP}();
		} finally {
			creating = false;
		}
	}

	async function remove(id: string) {
		await api.${names.camel}.delete${P}(id);
		${items} = ${items}.filter((item) => item.id !== id);
	}
</script>

<div class="mx-auto max-w-3xl space-y-6 px-4 py-8">
	<div class="flex items-center justify-between gap-4">
		<div>
			<h1 class="text-3xl font-bold tracking-tight">${names.plural.title}</h1>
			<p class="text-muted-foreground">Manage your ${lowerPlural}</p>
		</div>
		<Button onclick={() => (showCreate = true)}>
			<Plus />
			New ${names.title}
		</Button>
	</div>

	{#if loading}
		<div class="text-muted-foreground flex items-center gap-2 text-sm">
			<Loader2 class="animate-spin" />
			Loading…
		</div>
	{/if}
	{#if !loading && ${items}.length === 0}
		<p class="text-muted-foreground text-sm">No ${lowerPlural} yet — create your first one.</p>
	{/if}

	<div class="space-y-2">
		{#each ${items} as item (item.id)}
			<Card class="flex items-start gap-3 p-4">
				<div class="min-w-0 flex-1">
					<a href={\`/${names.plural.kebab}/\${item.id}\`} class="font-medium hover:underline">
						{${displayExpr(label, `item.${label.camel}`)}}
					</a>
${others
    .map(
        (f) => `					<p class="text-muted-foreground text-sm">
						${fieldTitle(f)}: {${displayExpr(f, `item.${f.camel}`)}}
					</p>`,
    )
    .join("\n")}
					<p class="text-muted-foreground text-xs">by {item.user.username}</p>
				</div>
				{#if item.user.id === $user?.id}
					<Button
						variant="ghost"
						size="icon"
						aria-label="Delete ${lower}"
						onclick={() => remove(item.id)}
					>
						<Trash2 />
					</Button>
				{/if}
			</Card>
		{/each}
	</div>

	<Dialog bind:open={showCreate}>
		<DialogContent>
			<DialogHeader>
				<DialogTitle>Create New ${names.title}</DialogTitle>
				<DialogDescription>Fill in the details below.</DialogDescription>
			</DialogHeader>
			<form onsubmit={create${P}} class="space-y-4">
${fields.map((f) => formInput(f, names.kebab)).join("\n")}
				<DialogFooter>
					<Button type="button" variant="outline" onclick={() => (showCreate = false)}>
						Cancel
					</Button>
					<Button type="submit" disabled={creating}>
						{#if creating}
							<Loader2 class="animate-spin" />
						{/if}
						{creating ? 'Creating…' : 'Create'}
					</Button>
				</DialogFooter>
			</form>
		</DialogContent>
	</Dialog>
</div>
`,
    };
}

function detailPage(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const item = names.camel;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    return {
        path: `src/routes/${names.plural.kebab}/[id]/+page.svelte`,
        content: `<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/stores';
	import api from '$lib/apis';
	import { user } from '$lib/stores/auth';
	import { Button } from '$lib/components/ui/button';
	import { Card, CardContent, CardHeader, CardTitle } from '$lib/components/ui/card';
	import Loader2 from '@lucide/svelte/icons/loader-2';
	import Trash2 from '@lucide/svelte/icons/trash-2';

${iface(ctx)}

	let ${item} = $state<${P} | null>(null);

	onMount(async () => {
		const res = await api.${item}.get${P}ById($page.params.id!);
		${item} = res.data.data.${item};
	});

	async function remove() {
		await api.${item}.delete${P}($page.params.id!);
		await goto('/${names.plural.kebab}');
	}
</script>

<div class="mx-auto max-w-2xl space-y-4 px-4 py-8">
	<a
		href="/${names.plural.kebab}"
		class="text-muted-foreground hover:text-foreground text-sm underline underline-offset-4"
	>
		← Back to ${names.plural.title.toLowerCase()}
	</a>
	{#if ${item}}
		<Card>
			<CardHeader>
				<CardTitle class="text-2xl">{${displayExpr(label, `${item}.${label.camel}`)}}</CardTitle>
			</CardHeader>
			<CardContent class="space-y-3">
${others
    .map(
        (f) => `				<p class="text-muted-foreground text-sm">
					<span class="text-foreground font-medium">${fieldTitle(f)}:</span>
					{${displayExpr(f, `${item}.${f.camel}`)}}
				</p>`,
    )
    .join("\n")}
				<p class="text-muted-foreground text-sm">
					Owner: {${item}.user.first_name} {${item}.user.last_name} (@{${item}.user.username})
				</p>
				{#if ${item}.user.id === $user?.id}
					<Button variant="outline" size="sm" onclick={remove}>
						<Trash2 />
						Delete
					</Button>
				{/if}
			</CardContent>
		</Card>
	{:else}
		<div class="text-muted-foreground flex items-center gap-2 text-sm">
			<Loader2 class="animate-spin" />
			Loading…
		</div>
	{/if}
</div>
`,
    };
}

function store(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const items = names.plural.camel;
    return {
        path: `src/lib/stores/${names.kebab}.ts`,
        content: `import { writable } from 'svelte/store';

import api from '$lib/apis';

export interface ${P} {
	id: string;
${fields.map((f) => `	${f.camel}: ${tsType(f)};`).join("\n")}
	createdAt: string;
	user: { id: string; username: string; first_name: string; last_name: string };
}

export const ${items} = writable<${P}[]>([]);
export const ${items}Loading = writable(false);

export async function fetch${names.plural.pascal}() {
	${items}Loading.set(true);
	try {
		const res = await api.${names.camel}.getAll${names.plural.pascal}();
		${items}.set(res.data.data.${items});
	} finally {
		${items}Loading.set(false);
	}
}

export async function remove${P}(id: string) {
	await api.${names.camel}.delete${P}(id);
	${items}.update((list) => list.filter((item) => item.id !== id));
}
`,
    };
}

function apiPatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    return [
        {
            path: "src/lib/apis/index.ts",
            anchor: /^import \w+ from '\.\/[\w-]+-api';$/m,
            where: "after",
            insert: `\nimport ${names.camel}Api from './${names.kebab}-api';`,
            skipIf: `./${names.kebab}-api`,
            describe: `import ${names.kebab}-api`,
        },
        {
            // the last key has no trailing comma (prettier trailingComma: none), so anchor on
            // the last `key: xApi,` line — the new entry lands before the final one
            path: "src/lib/apis/index.ts",
            anchor: /^\t\w+: \w+Api,$/m,
            where: "after",
            insert: `\n\t${names.camel}: ${names.camel}Api,`,
            skipIf: `${names.camel}: ${names.camel}Api`,
            describe: `expose api.${names.camel}`,
        },
    ];
}

export const svelte: Generator = {
    id: "svelte",
    label: "SvelteKit",
    kind: "frontend",
    commands: {
        resource: {
            describe:
                "api client + list page + detail page, registered in src/lib/apis/index.ts (routes are file-based)",
            files: (ctx) => [api(ctx), listPage(ctx), detailPage(ctx)],
            patches: apiPatches,
            notes: (ctx) => [
                `Add a nav link to /${ctx.names.plural.kebab} in src/routes/+layout.svelte if you want it in the menu.`,
            ],
        },
        api: {
            describe: "axios API module in src/lib/apis/ (+ registered in src/lib/apis/index.ts)",
            files: (ctx) => [api(ctx)],
            patches: apiPatches,
        },
        page: {
            describe: "list + detail pages in src/routes/<kebab-plural>/ (file-routed)",
            files: (ctx) => [listPage(ctx), detailPage(ctx)],
        },
        store: {
            describe: "svelte/store writables + fetch/remove helpers in src/lib/stores/",
            files: (ctx) => [store(ctx)],
        },
        component: {
            describe: "shadcn-svelte component via npx shadcn-svelte add",
            native: (ctx) => [
                { bin: "npx", args: ["shadcn-svelte@latest", "add", ctx.names.kebab, "-y"] },
            ],
        },
    },
};
