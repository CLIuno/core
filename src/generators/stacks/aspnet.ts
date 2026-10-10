import fs from "node:fs";
import path from "node:path";
import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";

// Stubs mirror CLIuno-ASP.NET-template: POCO models next to AppDb in Data/, controllers with
// primary constructors (AppDb db, AuthSupport auth) that call auth.Require(Request, db) and
// build the {status, message, data} envelope with Api.Ok/Created + Api.Data("<camel>", …).
// MapControllers picks the controller up; the model only needs a DbSet on AppDb (patched).

const DEFAULT_PROJECT = "BackendASP.NET/";
const DEFAULT_NAMESPACE = "BackendASPNET";

const CS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "int",
    number: "double",
    boolean: "bool",
    date: "DateTime",
    json: "string",
};

/** Locals every handler already declares — a field with one of these names gets a suffix. */
const RESERVED = new Set(["body", "user", "id", "db", "auth"]);

interface Project {
    /** Path prefix of the folder that holds the .csproj, relative to the stack root ("" when it is the root). */
    prefix: string;
    namespace: string;
}

function readNamespace(dir: string): string {
    try {
        const src = fs.readFileSync(path.join(dir, "Data", "Models.cs"), "utf8");
        const match = /^namespace\s+([\w.]+)\.Data;/m.exec(src);
        if (match) return match[1] as string;
    } catch {
        /* no Models.cs — fall back to the template namespace */
    }
    return DEFAULT_NAMESPACE;
}

/** The web project may be the stack root (run from inside it) or a sub-folder (run from the repo root). */
function project(cwd: string): Project {
    try {
        const entries = fs.readdirSync(cwd, { withFileTypes: true });
        if (entries.some((e) => e.isFile() && e.name.endsWith(".csproj"))) {
            return { prefix: "", namespace: readNamespace(cwd) };
        }
        for (const e of entries) {
            if (!e.isDirectory() || e.name.startsWith(".")) continue;
            const sub = path.join(cwd, e.name);
            if (fs.readdirSync(sub).some((n) => n.endsWith(".csproj"))) {
                return { prefix: `${e.name}/`, namespace: readNamespace(sub) };
            }
        }
    } catch {
        /* not an ASP.NET tree (dry-run from elsewhere) — use the template layout */
    }
    return { prefix: DEFAULT_PROJECT, namespace: DEFAULT_NAMESPACE };
}

function csType(f: Field): string {
    return `${CS[f.type]}${f.nullable ? "?" : ""}`;
}

function local(f: Field, names: Ctx["names"]): string {
    return RESERVED.has(f.camel) || f.camel === names.camel ? `${f.camel}Value` : f.camel;
}

/** `Field(body, "title")`, or the camelCase key with a snake_case fallback for multi-word names. */
function read(f: Field): string {
    return f.camel === f.snake
        ? `Field(body, "${f.camel}")`
        : `Field(body, "${f.camel}", "${f.snake}")`;
}

const READER: Record<FieldType, string> = {
    string: "Str",
    text: "Str",
    int: "Int",
    number: "Num",
    boolean: "Bool",
    date: "Date",
    json: "Json",
};

function modelProperty(f: Field): string {
    let init = "";
    if (!f.nullable && (f.type === "string" || f.type === "text")) init = ' = "";';
    if (!f.nullable && f.type === "json") init = ' = "{}";';
    return `    public ${csType(f)} ${f.pascal} { get; set; }${init}`;
}

function model(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const { prefix, namespace } = project(ctx.cwd);
    return {
        path: `${prefix}Data/${names.pascal}.cs`,
        content: `namespace ${namespace}.Data;

public class ${names.pascal}
{
    public long Id { get; set; }
${fields.map(modelProperty).join("\n")}
    public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

    public long UserId { get; set; }
    public User? User { get; set; }
}
`,
    };
}

function storeRead(f: Field, name: string): string[] {
    const lines = [`        var ${name} = ${READER[f.type]}(${read(f)});`];
    if (f.nullable || f.type === "boolean") return lines;
    const check =
        f.type === "string" || f.type === "text"
            ? `string.IsNullOrWhiteSpace(${name})`
            : `${name} is null`;
    lines.push(
        `        if (${check})`,
        `        {`,
        `            throw new ApiException(400, "${f.pascal} is required");`,
        `        }`,
    );
    return lines;
}

function storeAssign(f: Field, name: string): string {
    if (f.type === "boolean")
        return `            ${f.pascal} = ${name}${f.nullable ? "" : " ?? false"},`;
    if (f.nullable || f.type === "string" || f.type === "text" || f.type === "json")
        return `            ${f.pascal} = ${name},`;
    return `            ${f.pascal} = ${name}.Value,`;
}

function updateAssign(f: Field, one: string, names: Ctx["names"]): string {
    const v = local(f, names);
    const clear = f.nullable
        ? `
        else if (${read(f)}.ValueKind == JsonValueKind.Null)
        {
            ${one}.${f.pascal} = null;
        }`
        : "";
    return `        if (${READER[f.type]}(${read(f)}) is { } ${v})
        {
            ${one}.${f.pascal} = ${v};
        }${clear}`;
}

const HELPERS: Record<FieldType, string> = {
    string: `    private static string? Str(JsonElement value) =>
        value.ValueKind == JsonValueKind.String ? value.GetString() : null;`,
    text: "",
    int: `    private static int? Int(JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetInt32(out var number) ? number : null;`,
    number: `    private static double? Num(JsonElement value) =>
        value.ValueKind == JsonValueKind.Number && value.TryGetDouble(out var number) ? number : null;`,
    boolean: `    private static bool? Bool(JsonElement value) =>
        value.ValueKind is JsonValueKind.True or JsonValueKind.False ? value.GetBoolean() : null;`,
    date: `    private static DateTime? Date(JsonElement value) =>
        value.ValueKind == JsonValueKind.String
        && DateTime.TryParse(value.GetString(), CultureInfo.InvariantCulture,
            DateTimeStyles.AdjustToUniversal | DateTimeStyles.AssumeUniversal, out var date)
            ? date
            : null;`,
    json: `    private static string? Json(JsonElement value) =>
        value.ValueKind is JsonValueKind.Undefined or JsonValueKind.Null ? null : value.GetRawText();`,
};

function controller(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const { prefix, namespace } = project(ctx.cwd);
    const P = names.pascal;
    const Pp = names.plural.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    const titles = names.plural.title;
    const own = names.plural.kebab.replace(/-/g, " ");
    const x = one.charAt(0);

    const usings = ["System.Text.Json"];
    if (fields.some((f) => f.type === "date")) usings.unshift("System.Globalization");

    const reads: string[] = [];
    const assigns: string[] = [];
    for (const f of fields) {
        const name = local(f, names);
        reads.push(...storeRead(f, name));
        assigns.push(storeAssign(f, name));
    }

    const used = new Set<FieldType>(fields.map((f) => (f.type === "text" ? "string" : f.type)));
    const helpers = (Object.keys(HELPERS) as FieldType[])
        .filter((t) => used.has(t) && HELPERS[t])
        .map((t) => HELPERS[t]);

    return {
        path: `${prefix}Controllers/${Pp}Controller.cs`,
        content: `${usings.map((u) => `using ${u};`).join("\n")}
using ${namespace}.Data;
using ${namespace}.Support;
using Microsoft.AspNetCore.Mvc;
using Microsoft.EntityFrameworkCore;

namespace ${namespace}.Controllers;

[ApiController]
[Route("api/v1/${names.plural.kebab}")]
public class ${Pp}Controller(AppDb db, AuthSupport auth) : ControllerBase
{
    private async Task<${P}> Find(long id) =>
        await db.${Pp}.Include(${x} => ${x}.User).FirstOrDefaultAsync(${x} => ${x}.Id == id)
        ?? throw new ApiException(404, "${title} not found");

    [HttpGet]
    public async Task<IActionResult> Index()
    {
        await auth.Require(Request, db);
        var ${many} = await db.${Pp}.Include(${x} => ${x}.User)
            .OrderByDescending(${x} => ${x}.CreatedAt).ToListAsync();
        return Api.Ok("${titles}", Api.Data("${many}", ${many}));
    }

    [HttpGet("current-user")]
    public async Task<IActionResult> CurrentUser()
    {
        var user = await auth.Require(Request, db);
        var ${many} = await db.${Pp}.Include(${x} => ${x}.User)
            .Where(${x} => ${x}.UserId == user.Id)
            .OrderByDescending(${x} => ${x}.CreatedAt).ToListAsync();
        return Api.Ok("${titles}", Api.Data("${many}", ${many}));
    }

    [HttpPost]
    public async Task<IActionResult> Store([FromBody] Dictionary<string, JsonElement> body)
    {
        var user = await auth.Require(Request, db);
${reads.join("\n")}

        var ${one} = new ${P}
        {
${assigns.join("\n")}
            User = user,
        };
        db.${Pp}.Add(${one});
        await db.SaveChangesAsync();
        return Api.Created("${title} created successfully", Api.Data("${one}", ${one}));
    }

    [HttpGet("{id:long}")]
    public async Task<IActionResult> Show(long id)
    {
        await auth.Require(Request, db);
        return Api.Ok("${title}", Api.Data("${one}", await Find(id)));
    }

    [HttpPatch("{id:long}")]
    public async Task<IActionResult> Update(long id, [FromBody] Dictionary<string, JsonElement> body)
    {
        var user = await auth.Require(Request, db);
        var ${one} = await Find(id);
        if (${one}.UserId != user.Id)
        {
            throw new ApiException(403, "You can only update your own ${own}");
        }
${fields.map((f) => updateAssign(f, one, names)).join("\n")}
        ${one}.UpdatedAt = DateTime.UtcNow;
        await db.SaveChangesAsync();
        return Api.Ok("${title} updated", Api.Data("${one}", ${one}));
    }

    [HttpDelete("{id:long}")]
    public async Task<IActionResult> Destroy(long id)
    {
        var user = await auth.Require(Request, db);
        var ${one} = await Find(id);
        if (${one}.UserId != user.Id)
        {
            throw new ApiException(403, "You can only delete your own ${own}");
        }
        db.${Pp}.Remove(${one});
        await db.SaveChangesAsync();
        return Api.Ok("${title} deleted successfully");
    }

    // Request keys arrive camelCase (or snake_case); a missing key reads as JsonValueKind.Undefined.
    private static JsonElement Field(Dictionary<string, JsonElement> body, params string[] keys)
    {
        foreach (var key in keys)
        {
            if (body.TryGetValue(key, out var value))
            {
                return value;
            }
        }
        return default;
    }

${helpers.join("\n\n")}
}
`,
    };
}

function registerDbSet(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const { prefix } = project(ctx.cwd);
    return [
        {
            path: `${prefix}Data/Models.cs`,
            anchor: /^    public DbSet<\w+> \w+ => Set<\w+>\(\);$/m,
            where: "after",
            insert: `\n    public DbSet<${names.pascal}> ${names.plural.pascal} => Set<${names.pascal}>();`,
            skipIf: `DbSet<${names.pascal}>`,
            describe: `add the ${names.plural.pascal} DbSet to AppDb`,
        },
    ];
}

export const aspnet: Generator = {
    id: "aspnet",
    label: "ASP.NET",
    kind: "backend",
    commands: {
        resource: {
            describe:
                "EF Core model + controller under /api/v1/<plural> + DbSet on AppDb (MapControllers registers it)",
            files: (ctx) => [model(ctx), controller(ctx)],
            patches: registerDbSet,
            notes: (ctx) => [
                `EnsureCreated does not migrate an existing database — delete ${project(ctx.cwd).prefix}db.sqlite so the ${ctx.names.plural.pascal} table is created on the next run.`,
                `MapControllers picks up ${ctx.names.plural.pascal}Controller — routes live at /api/v1/${ctx.names.plural.kebab} (+ /current-user).`,
                "Responses serialise properties as snake_case; requests accept camelCase or snake_case keys.",
            ],
        },
        model: {
            describe: "EF Core model in Data/ + DbSet on AppDb",
            files: (ctx) => [model(ctx)],
            patches: registerDbSet,
        },
        controller: {
            describe:
                "[ApiController] using auth.Require + the Api envelope (needs the model + DbSet)",
            files: (ctx) => [controller(ctx)],
        },
    },
};
