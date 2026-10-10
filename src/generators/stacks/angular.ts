import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";

// Stubs mirror ../CLIuno-Angular-template (src/app/services/todo-api.service.ts,
// src/app/views/app/todos.component.ts, todo-detail.component.ts): standalone components
// with inline templates (@if/@for control flow), constructor injection, FormsModule
// ngModel forms, spartan-ng helm UI (`@spartan-ng/helm/*` path aliases), @ng-icons/lucide.
// The template's style is semi: false + single quotes (oxfmt), so stubs follow it.

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
    json: "'{}'", // kept as JSON text in the form, parsed on submit
};

function tsType(f: Field): string {
    return `${TS[f.type]}${f.nullable ? " | null" : ""}`;
}

function iface(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `export interface ${names.pascal} {
  id: string
${fields.map((f) => `  ${f.camel}: ${tsType(f)}`).join("\n")}
  user: User
  createdAt: string
  updatedAt: string
}`;
}

function inputType(fields: Field[], partial: boolean): string {
    return `{ ${fields.map((f) => `${f.camel}${partial || f.nullable ? "?" : ""}: ${TS[f.type]}${f.nullable ? " | null" : ""}`).join("; ")} }`;
}

function service(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const PP = names.plural.pascal;
    const path = names.plural.kebab;
    return {
        path: `src/app/services/${names.kebab}-api.service.ts`,
        content: `import { Injectable } from '@angular/core'
import { HttpService } from './http.service'
import { ApiResponse } from './auth-api.service'
import { User } from '../types/models'

${iface(ctx)}

@Injectable({ providedIn: 'root' })
export class ${P}ApiService {
  constructor(private readonly http: HttpService) {}

  getAll${PP}() {
    return this.http.get<ApiResponse<{ ${names.plural.camel}: ${P}[] }>>('/${path}')
  }
  get${P}ById(id: string) {
    return this.http.get<ApiResponse<{ ${names.camel}: ${P} }>>(\`/${path}/\${id}\`)
  }
  create${P}(data: ${inputType(fields, false)}) {
    return this.http.post<ApiResponse>('/${path}', data)
  }
  update${P}(id: string, data: ${inputType(fields, true)}) {
    return this.http.patch<ApiResponse>(\`/${path}/\${id}\`, data)
  }
  delete${P}(id: string) {
    return this.http.delete<ApiResponse>(\`/${path}/\${id}\`)
  }
}
`,
    };
}

/** Component properties backing the create form (`newName = ''`). */
function formProps(fields: Field[]): string {
    return fields
        .map(
            (f) =>
                `  new${f.pascal}${f.type === "json" ? "" : `: ${TS[f.type]}`} = ${INIT[f.type]}`,
        )
        .join("\n");
}

function formReset(fields: Field[]): string {
    return fields.map((f) => `        this.new${f.pascal} = ${INIT[f.type]}`).join("\n");
}

function payload(fields: Field[]): string {
    return fields
        .map((f) => {
            if (f.type === "json") return `${f.camel}: parseJson(this.new${f.pascal})`;
            const stringish = f.type === "string" || f.type === "text" || f.type === "date";
            return f.nullable && stringish
                ? `${f.camel}: this.new${f.pascal} || null`
                : `${f.camel}: this.new${f.pascal}`;
        })
        .join(", ");
}

function formInput(f: Field, kebab: string): string {
    const id = `new-${kebab}-${f.snake.replace(/_/g, "-")}`;
    const optional = f.nullable ? " (optional)" : "";
    if (f.type === "boolean") {
        return `              <div class="flex items-center gap-2">
                <hlm-checkbox
                  id="${id}"
                  [checked]="new${f.pascal}"
                  (checkedChange)="new${f.pascal} = $event"
                />
                <label hlmLabel for="${id}">${f.pascal}</label>
              </div>`;
    }
    if (f.type === "text" || f.type === "json") {
        return `              <div class="space-y-2">
                <label hlmLabel for="${id}">${f.pascal}${f.type === "json" ? " (JSON)" : optional}</label>
                <textarea
                  hlmTextarea
                  id="${id}"
                  [(ngModel)]="new${f.pascal}"
                  name="${f.camel}"
                  class="w-full"
                  rows="3"
                ></textarea>
              </div>`;
    }
    const numeric = f.type === "int" || f.type === "number";
    const type = numeric ? "number" : f.type === "date" ? "datetime-local" : "text";
    return `              <div class="space-y-2">
                <label hlmLabel for="${id}">${f.pascal}${optional}</label>
                <input
                  hlmInput
                  id="${id}"
                  [(ngModel)]="new${f.pascal}"
                  name="${f.camel}"
                  type="${type}"
                  class="w-full"${f.nullable ? "" : "\n                  required"}
                />
              </div>`;
}

/** Angular interpolation for one field; `??` only on nullable fields (strictTemplates warns otherwise). */
function display(f: Field, varName: string): string {
    const v = `${varName}.${f.camel}`;
    if (f.type === "boolean") return `{{ ${v} ? 'Yes' : 'No' }}`;
    if (f.type === "json") return `{{ ${v} | json }}`;
    if (f.type === "date")
        return f.nullable ? `{{ ${v} ? timeAgo(${v}) : '—' }}` : `{{ timeAgo(${v}) }}`;
    return f.nullable ? `{{ ${v} ?? '—' }}` : `{{ ${v} }}`;
}

const PARSE_JSON = `function parseJson(text: string): Record<string, unknown> {
  try {
    return JSON.parse(text)
  } catch {
    return {}
  }
}
`;

function listComponent(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const PP = names.plural.pascal;
    const kp = names.plural.kebab;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    const usesJson = fields.some((f) => f.type === "json");
    const usesCheckbox = fields.some((f) => f.type === "boolean");
    const usesTextarea = fields.some((f) => f.type === "text" || f.type === "json");
    const usesInput = fields.some((f) => !["boolean", "text", "json"].includes(f.type));
    const imports = [
        usesJson ? "JsonPipe" : "",
        "FormsModule",
        "RouterLink",
        "NgIcon",
        "HlmButton",
        "HlmCard",
        "HlmCardContent",
        usesCheckbox ? "HlmCheckbox" : "",
        usesInput ? "HlmInput" : "",
        "HlmLabel",
        usesTextarea ? "HlmTextarea" : "",
        "HlmSpinner",
        "HlmDialog",
        "HlmDialogContent",
        "HlmDialogHeader",
        "HlmDialogTitle",
        "HlmDialogFooter",
        "BrnDialogTrigger",
        "BrnDialogContent",
        "BrnDialogClose",
    ].filter(Boolean);
    return {
        path: `src/app/views/app/${kp}.component.ts`,
        content: `${usesJson ? "import { JsonPipe } from '@angular/common'\n" : ""}import { Component, OnInit } from '@angular/core'
import { FormsModule } from '@angular/forms'
import { RouterLink } from '@angular/router'
import { NgIcon, provideIcons } from '@ng-icons/core'
import { lucidePlus, lucidePackage, lucideUser, lucideTrash2 } from '@ng-icons/lucide'
import { ${P}, ${P}ApiService } from '../../services/${names.kebab}-api.service'
import { AuthStore } from '../../services/auth.store'
import { timeAgo } from '../../utils/helpers'
import { HlmButton } from '@spartan-ng/helm/button'
import { HlmCard, HlmCardContent } from '@spartan-ng/helm/card'
${usesCheckbox ? "import { HlmCheckbox } from '@spartan-ng/helm/checkbox'\n" : ""}${usesInput ? "import { HlmInput } from '@spartan-ng/helm/input'\n" : ""}import { HlmLabel } from '@spartan-ng/helm/label'
${usesTextarea ? "import { HlmTextarea } from '@spartan-ng/helm/textarea'\n" : ""}import { HlmSpinner } from '@spartan-ng/helm/spinner'
import {
  HlmDialog,
  HlmDialogContent,
  HlmDialogHeader,
  HlmDialogTitle,
  HlmDialogFooter,
} from '@spartan-ng/helm/dialog'
import { BrnDialogTrigger, BrnDialogContent, BrnDialogClose } from '@spartan-ng/brain/dialog'

${usesJson ? `${PARSE_JSON}\n` : ""}@Component({
  selector: 'app-${kp}',
  standalone: true,
  imports: [
${imports.map((i) => `    ${i},`).join("\n")}
  ],
  viewProviders: [provideIcons({ lucidePlus, lucidePackage, lucideUser, lucideTrash2 })],
  template: \`
    <div class="mx-auto max-w-4xl px-4 py-8">
      <!-- Header -->
      <div class="mb-8 flex items-center justify-between">
        <div>
          <h1 class="text-3xl font-bold">${names.plural.title}</h1>
          <p class="text-muted-foreground">Manage your ${names.plural.title.toLowerCase()}</p>
        </div>

        <hlm-dialog #createDialog="hlmDialog">
          <button type="button" hlmBtn brnDialogTrigger>
            <ng-icon name="lucidePlus" size="18px" />
            New ${names.title}
          </button>
          <hlm-dialog-content *brnDialogContent="let ctx">
            <hlm-dialog-header>
              <h3 hlmDialogTitle>Create New ${names.title}</h3>
            </hlm-dialog-header>
            <form (ngSubmit)="create${P}(createDialog)" class="space-y-4">
${fields.map((f) => formInput(f, names.kebab)).join("\n")}
              <hlm-dialog-footer>
                <button type="button" brnDialogClose hlmBtn variant="outline">Cancel</button>
                <button type="submit" hlmBtn [disabled]="creating">
                  @if (creating) {
                    <hlm-spinner class="size-4" />
                  }
                  {{ creating ? 'Creating...' : 'Create' }}
                </button>
              </hlm-dialog-footer>
            </form>
          </hlm-dialog-content>
        </hlm-dialog>
      </div>

      <!-- Loading -->
      @if (loading) {
        <div class="flex justify-center py-20">
          <hlm-spinner class="size-8 text-primary" />
        </div>
      }

      <!-- Empty State -->
      @if (!loading && ${names.plural.camel}.length === 0) {
        <div class="py-20 text-center">
          <ng-icon name="lucidePackage" size="64px" class="mx-auto text-muted-foreground/40" />
          <h3 class="mt-4 text-xl font-semibold">No ${names.plural.title.toLowerCase()} yet</h3>
          <p class="mt-2 text-muted-foreground">Create your first ${names.title.toLowerCase()} to get started!</p>
        </div>
      }

      <!-- List -->
      @if (!loading && ${names.plural.camel}.length > 0) {
        <div class="space-y-3">
          @for (item of ${names.plural.camel}; track item.id) {
            <div hlmCard class="transition-shadow hover:shadow-md">
              <div hlmCardContent class="flex items-start gap-3">
                <div class="min-w-0 flex-1">
                  <a [routerLink]="['/${kp}', item.id]">
                    <h3 class="text-lg font-semibold transition-colors hover:text-primary">
                      ${display(label, "item")}
                    </h3>
                  </a>
${others
    .map(
        (f) => `                  <p class="mt-1 text-sm text-muted-foreground">
                    ${f.pascal}: ${display(f, "item")}
                  </p>`,
    )
    .join("\n")}
                  <div class="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <a
                      [routerLink]="['/users', item.user.id]"
                      class="flex items-center gap-1 hover:text-primary"
                    >
                      <ng-icon name="lucideUser" size="16px" />
                      {{ item.user.username }}
                    </a>
                    <span>{{ timeAgo(item.createdAt) }}</span>
                  </div>
                </div>

                @if (item.user.id === authStore.user()?.id) {
                  <button
                    type="button"
                    hlmBtn
                    variant="ghost"
                    size="icon-sm"
                    (click)="delete${P}(item.id)"
                    aria-label="Delete ${names.title.toLowerCase()}"
                  >
                    <ng-icon name="lucideTrash2" size="16px" />
                  </button>
                }
              </div>
            </div>
          }
        </div>
      }
    </div>
  \`,
})
export class ${PP}Component implements OnInit {
  ${names.plural.camel}: ${P}[] = []
  loading = true
  creating = false
${formProps(fields)}
  timeAgo = timeAgo

  constructor(
    private readonly ${names.camel}Api: ${P}ApiService,
    public authStore: AuthStore,
  ) {}

  ngOnInit() {
    this.fetch${PP}()
  }

  fetch${PP}() {
    this.loading = true
    this.${names.camel}Api.getAll${PP}().subscribe({
      next: (res) => {
        this.${names.plural.camel} = res.data.${names.plural.camel}
        this.loading = false
      },
      error: () => {
        this.loading = false
      },
    })
  }

  create${P}(dialog: { close: () => void }) {
    this.creating = true
    this.${names.camel}Api.create${P}({ ${payload(fields)} }).subscribe({
      next: () => {
${formReset(fields)}
        this.creating = false
        dialog.close()
        this.fetch${PP}()
      },
      error: () => {
        this.creating = false
      },
    })
  }

  delete${P}(id: string) {
    this.${names.camel}Api.delete${P}(id).subscribe({
      next: () => {
        this.${names.plural.camel} = this.${names.plural.camel}.filter((item) => item.id !== id)
      },
    })
  }
}
`,
    };
}

function detailComponent(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const kp = names.plural.kebab;
    const label = labelField(fields);
    const others = fields.filter((f) => f !== label);
    const usesJson = fields.some((f) => f.type === "json");
    const v = names.camel;
    return {
        path: `src/app/views/app/${names.kebab}-detail.component.ts`,
        content: `${usesJson ? "import { JsonPipe } from '@angular/common'\n" : ""}import { Component, OnInit } from '@angular/core'
import { ActivatedRoute, Router, RouterLink } from '@angular/router'
import { NgIcon, provideIcons } from '@ng-icons/core'
import { lucideArrowLeft, lucideTrash2, lucideUser } from '@ng-icons/lucide'
import { ${P}, ${P}ApiService } from '../../services/${names.kebab}-api.service'
import { AuthStore } from '../../services/auth.store'
import { timeAgo } from '../../utils/helpers'
import { HlmButton } from '@spartan-ng/helm/button'
import { HlmCard, HlmCardContent } from '@spartan-ng/helm/card'
import { HlmSpinner } from '@spartan-ng/helm/spinner'
import { HlmSeparator } from '@spartan-ng/helm/separator'

@Component({
  selector: 'app-${names.kebab}-detail',
  standalone: true,
  imports: [${usesJson ? "JsonPipe, " : ""}RouterLink, NgIcon, HlmButton, HlmCard, HlmCardContent, HlmSpinner, HlmSeparator],
  viewProviders: [provideIcons({ lucideArrowLeft, lucideTrash2, lucideUser })],
  template: \`
    <div class="mx-auto max-w-3xl px-4 py-8">
      <!-- Back -->
      <a routerLink="/${kp}" hlmBtn variant="ghost" size="sm" class="mb-6">
        <ng-icon name="lucideArrowLeft" size="18px" />
        Back to ${names.plural.title}
      </a>

      @if (loading) {
        <div class="flex justify-center py-20">
          <hlm-spinner class="size-8 text-primary" />
        </div>
      }

      @if (!loading && ${v}) {
        <div hlmCard>
          <div hlmCardContent>
            <div class="flex items-start justify-between gap-4">
              <h1 class="text-2xl font-bold">${display(label, v)}</h1>
              @if (${v}.user.id === authStore.user()?.id) {
                <button type="button" hlmBtn size="sm" variant="outline" (click)="remove()">
                  <ng-icon name="lucideTrash2" size="16px" />
                  Delete
                </button>
              }
            </div>
${others
    .map(
        (f) => `            <p class="mt-3 text-muted-foreground">
              <span class="font-medium text-foreground">${f.pascal}:</span> ${display(f, v)}
            </p>`,
    )
    .join("\n")}

            <hlm-separator class="my-4" />

            <!-- Meta -->
            <div class="flex items-center gap-4 text-sm text-muted-foreground">
              <a
                [routerLink]="['/users', ${v}.user.id]"
                class="flex items-center gap-1 hover:text-primary"
              >
                <ng-icon name="lucideUser" size="16px" />
                {{ ${v}.user.first_name }} {{ ${v}.user.last_name }} (&#64;{{ ${v}.user.username }})
              </a>
              <span>{{ timeAgo(${v}.createdAt) }}</span>
            </div>
          </div>
        </div>
      }
    </div>
  \`,
})
export class ${P}DetailComponent implements OnInit {
  ${v}: ${P} | null = null
  loading = true
  timeAgo = timeAgo

  constructor(
    private readonly route: ActivatedRoute,
    private readonly router: Router,
    private readonly ${v}Api: ${P}ApiService,
    public authStore: AuthStore,
  ) {}

  ngOnInit() {
    const id = this.route.snapshot.paramMap.get('id') ?? ''
    this.${v}Api.get${P}ById(id).subscribe({
      next: (res) => {
        this.${v} = res.data.${v}
        this.loading = false
      },
      error: () => {
        this.loading = false
      },
    })
  }

  remove() {
    const ${v} = this.${v}
    if (!${v}) return
    this.${v}Api.delete${P}(${v}.id).subscribe({
      next: () => {
        this.router.navigate(['/${kp}'])
      },
    })
  }
}
`,
    };
}

function store(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `src/app/services/${names.kebab}.store.ts`,
        content: `import { Injectable, signal } from '@angular/core'
import { ${P}, ${P}ApiService } from './${names.kebab}-api.service'

@Injectable({ providedIn: 'root' })
export class ${P}Store {
  items = signal<${P}[]>([])
  loading = signal(false)

  constructor(private readonly ${names.camel}Api: ${P}ApiService) {}

  fetchAll() {
    this.loading.set(true)
    this.${names.camel}Api.getAll${names.plural.pascal}().subscribe({
      next: (res) => {
        this.items.set(res.data.${names.plural.camel})
        this.loading.set(false)
      },
      error: () => {
        this.loading.set(false)
      },
    })
  }

  remove(id: string) {
    this.${names.camel}Api.delete${P}(id).subscribe({
      next: () => {
        this.items.update((items) => items.filter((item) => item.id !== id))
      },
    })
  }
}
`,
    };
}

function routePatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const P = names.pascal;
    const PP = names.plural.pascal;
    const kp = names.plural.kebab;
    return [
        {
            path: "src/app/app.routes.ts",
            // right after the `todos/:id` route object inside the authGuard children
            anchor: /m\.TodoDetailComponent\),\n\s*\},/,
            where: "after",
            insert: `\n      {\n        path: '${kp}',\n        loadComponent: () => import('./views/app/${kp}.component').then((m) => m.${PP}Component),\n      },\n      {\n        path: '${kp}/:id',\n        loadComponent: () =>\n          import('./views/app/${names.kebab}-detail.component').then((m) => m.${P}DetailComponent),\n      },`,
            skipIf: `path: '${kp}'`,
            describe: `add /${kp} routes next to the todo routes (same authGuard group)`,
        },
    ];
}

export const angular: Generator = {
    id: "angular",
    format: oxfmt,
    label: "Angular",
    kind: "frontend",
    commands: {
        resource: {
            describe:
                "api service + list component + detail component, routed in src/app/app.routes.ts",
            files: (ctx) => [service(ctx), listComponent(ctx), detailComponent(ctx)],
            patches: routePatches,
            notes: (ctx) => [
                `Add a nav link to /${ctx.names.plural.kebab} in src/app/layouts/default-layout.component.ts if you want it in the menu.`,
                `Move the ${ctx.names.pascal} interface into src/app/types/models.ts if you prefer the shared models file.`,
            ],
        },
        api: {
            describe: "HttpService-based API service in src/app/services/ (providedIn: root)",
            files: (ctx) => [service(ctx)],
        },
        service: {
            describe: "alias of make:api — API service in src/app/services/",
            files: (ctx) => [service(ctx)],
        },
        page: {
            describe: "list + detail standalone components in src/app/views/app/ (+ routes)",
            files: (ctx) => [listComponent(ctx), detailComponent(ctx)],
            patches: routePatches,
        },
        store: {
            describe: "signals store service in src/app/services/ (same shape as auth.store.ts)",
            files: (ctx) => [store(ctx)],
        },
        component: {
            describe: "spartan-ng helm UI component via ng g @spartan-ng/cli:ui",
            native: (ctx) => [
                { bin: "node_modules/.bin/ng", args: ["g", "@spartan-ng/cli:ui", ctx.names.kebab] },
            ],
        },
    },
};
