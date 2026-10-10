import fs from "node:fs";
import path from "node:path";
import type { Ctx, FileSpec, Generator, NativeCall, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { pint } from "./shared";

/*
 * Stubs mirror CLIuno-Laravel-template's todo resource: Eloquent model with $fillable/casts(),
 * anonymous-class migration, inline $request->validate() in the controller, explicit routes in
 * routes/api.php inside the auth:sanctum group, {data: {<camel>|<camelPlural>}} responses with
 * snake_case attributes, and a hasMany relation on User (the todo controller uses
 * $request->user()->todos()). Pint (laravel preset) formats everything written.
 */

const COLUMN: Record<FieldType, string> = {
    string: "string",
    text: "text",
    int: "integer",
    number: "float",
    boolean: "boolean",
    date: "dateTime",
    json: "json",
};

const CAST: Record<FieldType, string | null> = {
    string: null,
    text: null,
    int: "integer",
    number: "float",
    boolean: "boolean",
    date: "datetime",
    json: "array",
};

const RULES: Record<FieldType, string[]> = {
    string: ["string", "max:255"],
    text: ["string"],
    int: ["integer"],
    number: ["numeric"],
    boolean: ["boolean"],
    date: ["date"],
    json: ["array"],
};

/** PHP literal for a sample value (tests). */
const SAMPLE: Record<FieldType, (f: Field) => string> = {
    string: (f) => `'Sample ${f.snake.replace(/_/g, " ")}'`,
    text: (f) => `'Sample ${f.snake.replace(/_/g, " ")} text'`,
    int: () => "1",
    number: () => "1.5",
    boolean: () => "false",
    date: () => "'2026-01-01 00:00:00'",
    json: () => "['key' => 'value']",
};

const UPDATED: Record<FieldType, (f: Field) => string> = {
    string: (f) => `'Updated ${f.snake.replace(/_/g, " ")}'`,
    text: (f) => `'Updated ${f.snake.replace(/_/g, " ")} text'`,
    int: () => "2",
    number: () => "2.5",
    boolean: () => "true",
    date: () => "'2026-02-02 00:00:00'",
    json: () => "['key' => 'updated']",
};

const phpList = (items: string[]) => items.map((i) => `'${i}'`).join(", ");

/** Sort `use` statements the way Pint's ordered_imports (alpha) does. */
export function phpUses(classes: string[]): string {
    const key = (c: string) => c.replace(/\\/g, " ").toLowerCase();
    return [...new Set(classes)]
        .sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0))
        .map((c) => `use ${c};`)
        .join("\n");
}

function storeRules(f: Field): string {
    const rules = f.type === "boolean" ? ["sometimes"] : f.nullable ? ["nullable"] : ["required"];
    return `            '${f.snake}' => [${phpList([...rules, ...RULES[f.type]])}],`;
}

function updateRules(f: Field): string {
    const rules = f.nullable ? ["sometimes", "nullable"] : ["sometimes"];
    return `            '${f.snake}' => [${phpList([...rules, ...RULES[f.type]])}],`;
}

function column(f: Field): string {
    let line = `            $table->${COLUMN[f.type]}('${f.snake}')`;
    if (f.type === "boolean") line += "->default(false)";
    else if (f.nullable) line += "->nullable()";
    return `${line};`;
}

function utcStamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}_${p(d.getUTCMonth() + 1)}_${p(d.getUTCDate())}_${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

/** Reuse an existing create_<plural>_table migration so a second run is a no-op. */
export function migrationPath(ctx: Ctx): string {
    const suffix = `create_${ctx.names.plural.snake}_table.php`;
    try {
        const existing = fs
            .readdirSync(path.join(ctx.cwd, "database", "migrations"))
            .find((f) => f.endsWith(`_${suffix}`));
        if (existing) return `database/migrations/${existing}`;
    } catch {
        // no migrations dir (dry-run outside a checkout) — fall through to a fresh name
    }
    return `database/migrations/${utcStamp()}_${suffix}`;
}

export function model(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const casts = fields.filter((f) => CAST[f.type]);
    const castsBlock = casts.length
        ? `
    protected function casts(): array
    {
        return [
${casts.map((f) => `            '${f.snake}' => '${CAST[f.type]}',`).join("\n")}
        ];
    }
`
        : "";
    return {
        path: `app/Models/${names.pascal}.php`,
        content: `<?php

namespace App\\Models;

use Illuminate\\Database\\Eloquent\\Factories\\HasFactory;
use Illuminate\\Database\\Eloquent\\Model;
use Illuminate\\Database\\Eloquent\\Relations\\BelongsTo;

class ${names.pascal} extends Model
{
    use HasFactory;

    protected $fillable = [
${fields.map((f) => `        '${f.snake}',`).join("\n")}
        'user_id',
    ];
${castsBlock}
    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
`,
    };
}

export function migration(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: migrationPath(ctx),
        content: `<?php

use Illuminate\\Database\\Migrations\\Migration;
use Illuminate\\Database\\Schema\\Blueprint;
use Illuminate\\Support\\Facades\\Schema;

return new class extends Migration
{
    public function up(): void
    {
        Schema::create('${names.plural.snake}', function (Blueprint $table) {
            $table->id();
${fields.map(column).join("\n")}
            $table->foreignId('user_id')->constrained()->cascadeOnDelete();
            $table->timestamps();
        });
    }

    public function down(): void
    {
        Schema::dropIfExists('${names.plural.snake}');
    }
};
`,
    };
}

export function controller(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    return {
        path: `app/Http/Controllers/${P}Controller.php`,
        content: `<?php

namespace App\\Http\\Controllers;

use App\\Models\\${P};
use Illuminate\\Http\\JsonResponse;
use Illuminate\\Http\\Request;

class ${P}Controller extends Controller
{
    public function index(): JsonResponse
    {
        $${many} = ${P}::with('user')->latest()->get();

        return response()->json(['data' => ['${many}' => $${many}]]);
    }

    public function show(int $id): JsonResponse
    {
        $${one} = ${P}::with('user')->findOrFail($id);

        return response()->json(['data' => ['${one}' => $${one}]]);
    }

    public function store(Request $request): JsonResponse
    {
        $validated = $request->validate([
${fields.map(storeRules).join("\n")}
        ]);

        $${one} = $request->user()->${many}()->create($validated);

        return response()->json(['data' => ['${one}' => $${one}->load('user')]], 201);
    }

    public function update(Request $request, int $id): JsonResponse
    {
        $${one} = ${P}::findOrFail($id);

        if ($${one}->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $validated = $request->validate([
${fields.map(updateRules).join("\n")}
        ]);

        $${one}->update($validated);

        return response()->json(['data' => ['${one}' => $${one}->fresh()->load('user')]]);
    }

    public function destroy(Request $request, int $id): JsonResponse
    {
        $${one} = ${P}::findOrFail($id);

        if ($${one}->user_id !== $request->user()->id) {
            return response()->json(['message' => 'Unauthorized'], 403);
        }

        $${one}->delete();

        return response()->json(['message' => '${title} deleted successfully']);
    }

    public function currentUser(Request $request): JsonResponse
    {
        $${many} = $request->user()->${many}()->with('user')->latest()->get();

        return response()->json(['data' => ['${many}' => $${many}]]);
    }
}
`,
    };
}

/** Form request (only used as the stub fallback for make:request — the controllers validate inline like the template). */
export function formRequest(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: `app/Http/Requests/Store${names.pascal}Request.php`,
        content: `<?php

namespace App\\Http\\Requests;

use Illuminate\\Foundation\\Http\\FormRequest;

class Store${names.pascal}Request extends FormRequest
{
    public function authorize(): bool
    {
        return true;
    }

    /**
     * @return array<string, array<int, string>>
     */
    public function rules(): array
    {
        return [
${fields.map(storeRules).join("\n")}
        ];
    }
}
`,
    };
}

/** PHP array literal with one sample value per field, indented for a test body. */
export function samplePayload(fields: Field[], indent: string): string {
    return fields.map((f) => `${indent}'${f.snake}' => ${SAMPLE[f.type](f)},`).join("\n");
}

export function labelInfo(fields: Field[]) {
    const label = labelField(fields);
    const jsonAssertable = ["string", "text", "int", "number", "boolean"].includes(label.type);
    const dbAssertable = ["string", "text", "int"].includes(label.type);
    return {
        label,
        sample: SAMPLE[label.type](label),
        updated: UPDATED[label.type](label),
        jsonAssertable,
        dbAssertable,
    };
}

/** Pest feature test (CLIuno-Laravel-template uses Pest with RefreshDatabase bound to tests/Feature). */
export function pestTest(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const url = `/api/v1/${names.plural.kebab}`;
    const table = names.plural.snake;
    const { label, sample, updated, jsonAssertable, dbAssertable } = labelInfo(fields);
    const human = names.title.toLowerCase();
    const humans = names.plural.title.toLowerCase();
    const createdAssert = jsonAssertable
        ? `
        ->assertJsonPath('data.${one}.${label.snake}', ${sample})`
        : "";
    const createdDb = dbAssertable
        ? `
    $this->assertDatabaseHas('${table}', ['${label.snake}' => ${sample}, 'user_id' => $this->user->id]);`
        : `
    $this->assertDatabaseCount('${table}', 1);`;
    const updatedAssert = jsonAssertable
        ? `
        ->assertJsonPath('data.${one}.${label.snake}', ${updated})`
        : "";

    return {
        path: `tests/Feature/${P}Test.php`,
        content: `<?php

${phpUses(["App\\Models\\User", `App\\Models\\${P}`, "Laravel\\Sanctum\\Sanctum"])}

beforeEach(function () {
    $this->user = User::factory()->create();
    $this->payload = [
${samplePayload(fields, "        ")}
    ];
});

test('${humans} require authentication', function () {
    $this->getJson('${url}')->assertUnauthorized();
});

test('${humans} can be listed', function () {
    ${P}::create([...$this->payload, 'user_id' => $this->user->id]);

    Sanctum::actingAs($this->user);

    $this->getJson('${url}')
        ->assertOk()
        ->assertJsonCount(1, 'data.${many}');
});

test('current user ${humans} can be listed', function () {
    ${P}::create([...$this->payload, 'user_id' => $this->user->id]);
    ${P}::create([...$this->payload, 'user_id' => User::factory()->create()->id]);

    Sanctum::actingAs($this->user);

    $this->getJson('${url}/current-user')
        ->assertOk()
        ->assertJsonCount(1, 'data.${many}');
});

test('a ${human} can be created', function () {
    Sanctum::actingAs($this->user);

    $this->postJson('${url}', $this->payload)
        ->assertCreated()${createdAssert};
${createdDb}
});

test('a ${human} can be shown', function () {
    $${one} = ${P}::create([...$this->payload, 'user_id' => $this->user->id]);

    Sanctum::actingAs($this->user);

    $this->getJson('${url}/'.$${one}->id)
        ->assertOk()
        ->assertJsonPath('data.${one}.id', $${one}->id);
});

test('an own ${human} can be updated', function () {
    $${one} = ${P}::create([...$this->payload, 'user_id' => $this->user->id]);

    Sanctum::actingAs($this->user);

    $this->patchJson('${url}/'.$${one}->id, ['${label.snake}' => ${updated}])
        ->assertOk()${updatedAssert};
});

test('a ${human} of another user cannot be updated', function () {
    $${one} = ${P}::create([...$this->payload, 'user_id' => User::factory()->create()->id]);

    Sanctum::actingAs($this->user);

    $this->patchJson('${url}/'.$${one}->id, ['${label.snake}' => ${updated}])
        ->assertForbidden();
});

test('an own ${human} can be deleted', function () {
    $${one} = ${P}::create([...$this->payload, 'user_id' => $this->user->id]);

    Sanctum::actingAs($this->user);

    $this->deleteJson('${url}/'.$${one}->id)
        ->assertOk();

    $this->assertDatabaseMissing('${table}', ['id' => $${one}->id]);
});
`,
    };
}

/** Insert `use App\Http\Controllers\<P>Controller;` where Pint's alpha import order wants it. */
function useControllerPatch(ctx: Ctx): Patch {
    const { names } = ctx;
    const line = `use App\\Http\\Controllers\\${names.pascal}Controller;`;
    const mine = `${names.pascal}Controller`.toLowerCase();
    let anchor: string | RegExp = /^use App\\Http\\Controllers\\[\w\\]+;$/m;
    let where: "before" | "after" = "after";
    try {
        const source = fs.readFileSync(path.join(ctx.cwd, "routes", "api.php"), "utf8");
        const re = /^use App\\Http\\Controllers\\([\w\\]+);$/gm;
        let m: RegExpExecArray | null;
        while ((m = re.exec(source)) !== null) {
            const key = (m[1] as string).replace(/\\/g, " ").toLowerCase();
            if (key > mine) {
                anchor = m[0];
                where = "before";
                break;
            }
        }
    } catch {
        // routes/api.php unreadable — append after the last controller import instead
    }
    return {
        path: "routes/api.php",
        anchor,
        where,
        insert: where === "before" ? `${line}\n` : `\n${line}`,
        skipIf: line,
        describe: `import ${names.pascal}Controller`,
    };
}

export function apiRoutePatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const P = names.pascal;
    const kp = names.plural.kebab;
    return [
        useControllerPatch(ctx),
        {
            path: "routes/api.php",
            anchor: "Route::middleware(['auth:sanctum'])->group(function () {",
            where: "after",
            insert: `
    // ${names.plural.title}
    Route::get('/${kp}/current-user', [${P}Controller::class, 'currentUser']);
    Route::get('/${kp}', [${P}Controller::class, 'index']);
    Route::get('/${kp}/{id}', [${P}Controller::class, 'show']);
    Route::post('/${kp}', [${P}Controller::class, 'store']);
    Route::patch('/${kp}/{id}', [${P}Controller::class, 'update']);
    Route::delete('/${kp}/{id}', [${P}Controller::class, 'destroy']);
`,
            skipIf: `Route::get('/${kp}', [${P}Controller::class, 'index']);`,
            describe: `register /${kp} routes in the auth:sanctum group`,
        },
    ];
}

/** hasMany relation on User, after the last single-line hasMany (todos/posts/comments). */
export function userRelationPatch(ctx: Ctx): Patch {
    const { names } = ctx;
    const many = names.plural.camel;
    return {
        path: "app/Models/User.php",
        anchor: /    public function \w+\(\): HasMany\n    \{\n        return \$this->hasMany\(\w+::class\);\n    \}\n/,
        where: "after",
        insert: `
    public function ${many}(): HasMany
    {
        return $this->hasMany(${names.pascal}::class);
    }
`,
        skipIf: `public function ${many}(): HasMany`,
        describe: `add the ${many}() relation to User`,
    };
}

export function artisan(...args: string[]): NativeCall[] {
    return [{ bin: "php", args: ["artisan", ...args] }];
}

export function resourceNotes(ctx: Ctx): string[] {
    const { names } = ctx;
    return [
        `php artisan migrate — creates the ${names.plural.snake} table.`,
        `Edit the validation rules in ${names.pascal}Controller (store/update) and add business logic there; the frontends destructure data.${names.plural.camel} / data.${names.camel}.`,
    ];
}

export const laravel: Generator = {
    id: "laravel",
    label: "Laravel",
    kind: "backend",
    format: pint,
    commands: {
        resource: {
            describe:
                "model + migration + controller (inline validation) + routes in routes/api.php + Pest feature test",
            files: (ctx) => [model(ctx), migration(ctx), controller(ctx), pestTest(ctx)],
            patches: (ctx) => [...apiRoutePatches(ctx), userRelationPatch(ctx)],
            notes: resourceNotes,
        },
        model: {
            describe: "Eloquent model in app/Models/",
            native: (ctx) => artisan("make:model", ctx.names.pascal),
            files: (ctx) => [model(ctx)],
        },
        controller: {
            describe: "API controller in app/Http/Controllers/",
            native: (ctx) => artisan("make:controller", `${ctx.names.pascal}Controller`, "--api"),
            files: (ctx) => [controller(ctx)],
        },
        migration: {
            describe: "create_<plural>_table migration in database/migrations/",
            native: (ctx) => artisan("make:migration", `create_${ctx.names.plural.snake}_table`),
            files: (ctx) => [migration(ctx)],
        },
        request: {
            describe: "form request in app/Http/Requests/",
            native: (ctx) => artisan("make:request", `Store${ctx.names.pascal}Request`),
            files: (ctx) => [formRequest(ctx)],
        },
        test: {
            describe: "Pest feature test in tests/Feature/",
            native: (ctx) => artisan("make:test", `${ctx.names.pascal}Test`, "--pest"),
            files: (ctx) => [pestTest(ctx)],
        },
    },
};
