import type { Ctx, FileSpec, Generator } from "../types";
import { pint } from "./shared";
import {
    apiRoutePatches,
    artisan,
    controller,
    formRequest,
    labelInfo,
    migration,
    model,
    phpUses,
    resourceNotes,
    samplePayload,
    userRelationPatch,
} from "./laravel";

/*
 * CLIuno-TallStack-template serves the same REST contract as the Laravel template (its API
 * layer is a port), so the model/migration/controller/route stubs are shared. Differences:
 * PHPUnit class tests instead of Pest, and a Livewire/Volt UI that a resource can get a page for.
 */

/** PHPUnit feature test (the TallStack template uses class-based tests, e.g. tests/Feature/TodosTest.php). */
export function phpunitTest(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const url = `/api/v1/${names.plural.kebab}`;
    const table = names.plural.snake;
    const { label, sample, updated, jsonAssertable, dbAssertable } = labelInfo(fields);
    const s = names.snake;
    const sp = names.plural.snake;
    const createdAssert = jsonAssertable
        ? `
            ->assertJsonPath('data.${one}.${label.snake}', ${sample})`
        : "";
    const createdDb = dbAssertable
        ? `
        $this->assertDatabaseHas('${table}', ['${label.snake}' => ${sample}, 'user_id' => $user->id]);`
        : `
        $this->assertDatabaseCount('${table}', 1);`;
    const updatedAssert = jsonAssertable
        ? `
            ->assertJsonPath('data.${one}.${label.snake}', ${updated})`
        : "";

    return {
        path: `tests/Feature/${names.plural.pascal}Test.php`,
        content: `<?php

namespace Tests\\Feature;

${phpUses([
    "App\\Models\\User",
    `App\\Models\\${P}`,
    "Illuminate\\Foundation\\Testing\\RefreshDatabase",
    "Laravel\\Sanctum\\Sanctum",
    "Tests\\TestCase",
])}

class ${names.plural.pascal}Test extends TestCase
{
    use RefreshDatabase;

    /**
     * @return array<string, mixed>
     */
    private function payload(): array
    {
        return [
${samplePayload(fields, "            ")}
        ];
    }

    public function test_${sp}_require_authentication(): void
    {
        $this->getJson('${url}')->assertUnauthorized();
    }

    public function test_${sp}_can_be_listed(): void
    {
        $user = User::factory()->create();
        ${P}::create([...$this->payload(), 'user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->getJson('${url}')
            ->assertOk()
            ->assertJsonCount(1, 'data.${many}');
    }

    public function test_current_user_${sp}_can_be_listed(): void
    {
        $user = User::factory()->create();
        ${P}::create([...$this->payload(), 'user_id' => $user->id]);
        ${P}::create([...$this->payload(), 'user_id' => User::factory()->create()->id]);

        Sanctum::actingAs($user);

        $this->getJson('${url}/current-user')
            ->assertOk()
            ->assertJsonCount(1, 'data.${many}');
    }

    public function test_${s}_can_be_created(): void
    {
        $user = User::factory()->create();

        Sanctum::actingAs($user);

        $this->postJson('${url}', $this->payload())
            ->assertCreated()${createdAssert};
${createdDb}
    }

    public function test_${s}_can_be_shown(): void
    {
        $user = User::factory()->create();
        $${one} = ${P}::create([...$this->payload(), 'user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->getJson('${url}/'.$${one}->id)
            ->assertOk()
            ->assertJsonPath('data.${one}.id', $${one}->id);
    }

    public function test_own_${s}_can_be_updated(): void
    {
        $user = User::factory()->create();
        $${one} = ${P}::create([...$this->payload(), 'user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->patchJson('${url}/'.$${one}->id, ['${label.snake}' => ${updated}])
            ->assertOk()${updatedAssert};
    }

    public function test_${s}_of_another_user_cannot_be_updated(): void
    {
        $user = User::factory()->create();
        $${one} = ${P}::create([...$this->payload(), 'user_id' => User::factory()->create()->id]);

        Sanctum::actingAs($user);

        $this->patchJson('${url}/'.$${one}->id, ['${label.snake}' => ${updated}])
            ->assertForbidden();
    }

    public function test_own_${s}_can_be_deleted(): void
    {
        $user = User::factory()->create();
        $${one} = ${P}::create([...$this->payload(), 'user_id' => $user->id]);

        Sanctum::actingAs($user);

        $this->deleteJson('${url}/'.$${one}->id)
            ->assertOk();

        $this->assertDatabaseMissing('${table}', ['id' => $${one}->id]);
    }
}
`,
    };
}

function voltNote(ctx: Ctx): string[] {
    const { names } = ctx;
    const kp = names.plural.kebab;
    return [
        `Livewire UI: copy resources/views/livewire/pages/todos.blade.php to resources/views/livewire/pages/${kp}.blade.php, swap Todo for ${names.pascal}, then add Volt::route('${kp}', 'pages.${kp}')->name('${kp}') inside the auth group in routes/web.php and a nav link in resources/views/livewire/layout/navigation.blade.php.`,
    ];
}

export const tallstack: Generator = {
    id: "tallstack",
    label: "TallStack",
    kind: "backend",
    format: pint,
    commands: {
        resource: {
            describe:
                "model + migration + controller (inline validation) + routes in routes/api.php + PHPUnit feature test",
            files: (ctx) => [model(ctx), migration(ctx), controller(ctx), phpunitTest(ctx)],
            patches: (ctx) => [...apiRoutePatches(ctx), userRelationPatch(ctx)],
            notes: (ctx) => [...resourceNotes(ctx), ...voltNote(ctx)],
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
            describe: "PHPUnit feature test in tests/Feature/",
            native: (ctx) => artisan("make:test", `${ctx.names.plural.pascal}Test`),
            files: (ctx) => [phpunitTest(ctx)],
        },
    },
};
