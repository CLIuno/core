/**
 * Axum (Rust) generator — mirrors the template's `todos` reference resource:
 * `src/models/<s>.rs` (sqlx `FromRow` row + Create/Update bodies + runtime queries),
 * `src/routes/<sp>.rs` (`routes()` merged into `routes::api()`), an embedded sqlx
 * migration, and an integration test on the in-memory `TestApp` harness.
 * Responses are snake_case; multi-word request keys also accept camelCase.
 */
import fs from "node:fs";
import path from "node:path";
import type { Ctx, FileSpec, Generator, NativeCall, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";

const RUST: Record<FieldType, string> = {
    string: "String",
    text: "String",
    int: "i64",
    number: "f64",
    boolean: "bool",
    // Stored as ISO-8601 text exactly as sent: browsers' datetime-local values carry no
    // timezone, which a strict DateTime<Utc> would reject.
    date: "String",
    // Stored as JSON text, emitted as JSON again by `as_json`.
    json: "String",
};

const SQL: Record<FieldType, string> = {
    string: "TEXT",
    text: "TEXT",
    int: "INTEGER",
    number: "REAL",
    boolean: "INTEGER",
    date: "TEXT",
    json: "TEXT",
};

const isStringish = (f: Field) => f.type === "string" || f.type === "text";

const KEYWORDS = new Set(
    "as async await break const continue crate dyn else enum extern false fn for if impl in let loop match mod move mut pub ref return self static struct super trait true type unsafe use where while abstract become box do final macro override priv try typeof unsized virtual yield".split(
        " ",
    ),
);
/** Rust identifier for a field (raw identifier when the name is a keyword; serde keeps the plain key). */
const rs = (f: Field) => (KEYWORDS.has(f.snake) ? `r#${f.snake}` : f.snake);
const hasJson = (fields: Field[]) => fields.some((f) => f.type === "json");

/** Row field type (what sqlx decodes). */
function rowType(f: Field): string {
    if (f.type === "json") return "Option<String>"; // as_json reads it as optional text
    if (f.type === "boolean" && !f.nullable) return "bool";
    return f.nullable ? `Option<${RUST[f.type]}>` : RUST[f.type];
}

/** Request type: strings are `String` (empty = missing), everything else is optional so a
 * missing required value can be reported as 400 instead of silently defaulting to 0. */
function createType(f: Field): string {
    if (f.type === "json") return "Option<Value>";
    if (isStringish(f) && !f.nullable) return "String";
    return `Option<${RUST[f.type]}>`;
}

function updateType(f: Field): string {
    return f.type === "json" ? "Option<Value>" : `Option<${RUST[f.type]}>`;
}

function alias(f: Field): string {
    return f.camel !== f.snake ? `    #[serde(alias = "${f.camel}")]\n` : "";
}

/** Expression bound for a field in INSERT. */
function insertBind(f: Field): string {
    if (f.type === "json") return `input.${rs(f)}.as_ref().map(Value::to_string)`;
    if (f.type === "boolean" && !f.nullable) return `input.${rs(f)}.unwrap_or(false)`;
    if (isStringish(f) && !f.nullable) return `&input.${rs(f)}`;
    if (f.type === "string" || f.type === "text" || f.type === "date") return `&input.${rs(f)}`;
    return `input.${rs(f)}`;
}

function updateBind(f: Field): string {
    if (f.type === "json") return `input.${rs(f)}.as_ref().map(Value::to_string)`;
    if (f.type === "string" || f.type === "text" || f.type === "date") return `&input.${rs(f)}`;
    return `input.${rs(f)}`;
}

function model(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const table = names.plural.snake;
    const json = hasJson(fields);
    const rowFields = fields
        .map((f) => {
            const ser = f.type === "json" ? `    #[serde(serialize_with = "as_json")]\n` : "";
            return `${ser}    pub ${rs(f)}: ${rowType(f)},`;
        })
        .join("\n");
    const createFields = fields
        .map((f) => `${alias(f)}    pub ${rs(f)}: ${createType(f)},`)
        .join("\n");
    const updateFields = fields
        .map((f) => `${alias(f)}    pub ${rs(f)}: ${updateType(f)},`)
        .join("\n");
    const cols = fields.map((f) => f.snake).join(", ");
    const marks = fields.map(() => "?").join(", ");
    const sets = fields
        .map((f) => `             ${f.snake} = COALESCE(?, ${f.snake}), \\`)
        .join("\n");
    const imports = [
        "use chrono::{DateTime, Utc};",
        "use serde::{Deserialize, Serialize};",
        ...(json ? ["use serde_json::Value;"] : []),
        "use sqlx::{FromRow, SqlitePool};",
    ].join("\n");
    const jsonHelper = json
        ? `

/// JSON columns are stored as text; emit them as JSON (null when unset or unreadable).
fn as_json<S: serde::Serializer>(raw: &Option<String>, serializer: S) -> Result<S::Ok, S::Error> {
    raw.as_deref()
        .map(|text| serde_json::from_str::<Value>(text).unwrap_or(Value::Null))
        .serialize(serializer)
}`
        : "";
    return {
        path: `src/models/${names.snake}.rs`,
        content: `//! The \`${table}\` table (see \`migrations/*_create_${table}.sql\`): the row type, the
//! request bodies, and every query the ${names.plural.title.toLowerCase()} routes need.

${imports}

use super::Owned;

/// A row of \`${table}\`, serialized with snake_case keys.
#[derive(Debug, Clone, FromRow, Serialize)]
pub struct ${P} {
    pub id: i64,
    pub user_id: i64,
${rowFields}
    pub created_at: DateTime<Utc>,
    pub updated_at: DateTime<Utc>,
}

/// \`POST /${names.plural.kebab}\` body. Keys are snake_case; multi-word keys also accept camelCase.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Create${P} {
${createFields}
}

/// \`PATCH /${names.plural.kebab}/:id\` body — absent keys stay unchanged.
#[derive(Debug, Default, Deserialize)]
#[serde(default)]
pub struct Update${P} {
${updateFields}
}

impl Owned for ${P} {
    fn owner_id(&self) -> i64 {
        self.user_id
    }
}

impl ${P} {
    pub async fn all(db: &SqlitePool) -> sqlx::Result<Vec<${P}>> {
        sqlx::query_as("SELECT * FROM ${table} ORDER BY id DESC")
            .fetch_all(db)
            .await
    }

    pub async fn for_user(db: &SqlitePool, user_id: i64) -> sqlx::Result<Vec<${P}>> {
        sqlx::query_as("SELECT * FROM ${table} WHERE user_id = ? ORDER BY id DESC")
            .bind(user_id)
            .fetch_all(db)
            .await
    }

    pub async fn find(db: &SqlitePool, id: i64) -> sqlx::Result<Option<${P}>> {
        sqlx::query_as("SELECT * FROM ${table} WHERE id = ?")
            .bind(id)
            .fetch_optional(db)
            .await
    }

    pub async fn create(db: &SqlitePool, user_id: i64, input: &Create${P}) -> sqlx::Result<${P}> {
        sqlx::query_as("INSERT INTO ${table} (user_id, ${cols}) VALUES (?, ${marks}) RETURNING *")
            .bind(user_id)
${fields.map((f) => `            .bind(${insertBind(f)})`).join("\n")}
            .fetch_one(db)
            .await
    }

    pub async fn update(db: &SqlitePool, id: i64, input: &Update${P}) -> sqlx::Result<${P}> {
        sqlx::query_as(
            "UPDATE ${table} SET \\
${sets}
             updated_at = CURRENT_TIMESTAMP \\
             WHERE id = ? RETURNING *",
        )
${fields.map((f) => `        .bind(${updateBind(f)})`).join("\n")}
        .bind(id)
        .fetch_one(db)
        .await
    }

    pub async fn delete(db: &SqlitePool, id: i64) -> sqlx::Result<()> {
        sqlx::query("DELETE FROM ${table} WHERE id = ?")
            .bind(id)
            .execute(db)
            .await?;
        Ok(())
    }
}${jsonHelper}
`,
    };
}

function requiredChecks(fields: Field[]): string {
    return fields
        .filter((f) => !f.nullable && f.type !== "boolean")
        .map((f) => {
            const cond = isStringish(f)
                ? `input.${rs(f)}.trim().is_empty()`
                : `input.${rs(f)}.is_none()`;
            return `    if ${cond} {
        return Err(ApiError::bad_request("${f.pascal} is required"));
    }`;
        })
        .join("\n");
}

function updateChecks(fields: Field[]): string {
    return fields
        .filter((f) => !f.nullable && isStringish(f))
        .map(
            (f) => `    if input
        .${rs(f)}
        .as_deref()
        .is_some_and(|value| value.trim().is_empty())
    {
        return Err(ApiError::bad_request("${f.pascal} cannot be empty"));
    }`,
        )
        .join("\n");
}

function routes(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.snake;
    const many = names.plural.snake;
    const key = names.camel;
    const keys = names.plural.camel;
    const base = `/${names.plural.kebab}`;
    const title = names.title;
    const titles = names.plural.title;
    const checks = requiredChecks(fields);
    const upChecks = updateChecks(fields);
    return {
        path: `src/routes/${many}.rs`,
        content: `//! \`/api/v1${base}\` — every route needs a Bearer token; creates attach the
//! authenticated user as owner and only the owner may change or delete (403).

use axum::Router;
use axum::extract::State;
use axum::routing::get;
use serde_json::json;

use crate::auth::AuthUser;
use crate::error::{ApiError, ApiResult};
use crate::extract::{Json, Path};
use crate::models::${one}::{Create${P}, ${P}, Update${P}};
use crate::models::{with_owner, with_owners};
use crate::response::{created, ok};
use crate::state::AppState;

pub fn routes() -> Router<AppState> {
    Router::new()
        .route("${base}", get(index).post(store))
        .route("${base}/current-user", get(current_user))
        .route("${base}/{id}", get(show).patch(update).delete(destroy))
}

/// \`GET ${base}\` → \`data.${keys}\`
async fn index(State(state): State<AppState>, _auth: AuthUser) -> ApiResult {
    let ${many} = with_owners(&state.db, ${P}::all(&state.db).await?).await?;
    Ok(ok("${titles} fetched successfully", json!({ "${keys}": ${many} })))
}

/// \`GET ${base}/current-user\` → \`data.${keys}\` (the caller's own)
async fn current_user(State(state): State<AppState>, auth: AuthUser) -> ApiResult {
    let ${many} = with_owners(&state.db, ${P}::for_user(&state.db, auth.id).await?).await?;
    Ok(ok("${titles} fetched successfully", json!({ "${keys}": ${many} })))
}

/// \`GET ${base}/:id\` → \`data.${key}\`
async fn show(State(state): State<AppState>, _auth: AuthUser, Path(id): Path<i64>) -> ApiResult {
    let ${one} = find(&state, id).await?;
    let ${one} = with_owner(&state.db, ${one}).await?;
    Ok(ok("${title} fetched successfully", json!({ "${key}": ${one} })))
}

/// \`POST ${base}\` → 201 \`data.${key}\`
async fn store(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(input): Json<Create${P}>,
) -> ApiResult {
${checks ? `${checks}\n` : ""}    let ${one} = ${P}::create(&state.db, auth.id, &input).await?;
    let ${one} = with_owner(&state.db, ${one}).await?;
    Ok(created("${title} created successfully", json!({ "${key}": ${one} })))
}

/// \`PATCH ${base}/:id\` → \`data.${key}\`
async fn update(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<i64>,
    Json(input): Json<Update${P}>,
) -> ApiResult {
${upChecks ? `${upChecks}\n` : ""}    auth.ensure_owns(&find(&state, id).await?)?;
    let ${one} = ${P}::update(&state.db, id, &input).await?;
    let ${one} = with_owner(&state.db, ${one}).await?;
    Ok(ok("${title} updated successfully", json!({ "${key}": ${one} })))
}

/// \`DELETE ${base}/:id\` → \`data.${key}\` (the deleted row)
async fn destroy(State(state): State<AppState>, auth: AuthUser, Path(id): Path<i64>) -> ApiResult {
    let ${one} = find(&state, id).await?;
    auth.ensure_owns(&${one})?;
    ${P}::delete(&state.db, id).await?;
    Ok(ok("${title} deleted successfully", json!({ "${key}": ${one} })))
}

async fn find(state: &AppState, id: i64) -> Result<${P}, ApiError> {
    ${P}::find(&state.db, id)
        .await?
        .ok_or_else(|| ApiError::not_found("${title} not found"))
}
`,
    };
}

/** Reuse an existing `<stamp>_create_<plural>.sql` so a second run is a no-op. */
function migrationPath(ctx: Ctx): string {
    const suffix = `_create_${ctx.names.plural.snake}.sql`;
    try {
        const existing = fs
            .readdirSync(path.join(ctx.cwd, "migrations"))
            .find((f) => f.endsWith(suffix));
        if (existing) return `migrations/${existing}`;
    } catch {
        // no migrations dir (dry-run outside a checkout)
    }
    const stamp = new Date().toISOString().replace(/\D/g, "").slice(0, 14);
    return `migrations/${stamp}${suffix}`;
}

function migration(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const table = names.plural.snake;
    const width = Math.max(10, ...fields.map((f) => f.snake.length));
    const pad = (s: string) => s.padEnd(width);
    const cols = fields.map((f) => {
        let def = `${SQL[f.type].padEnd(7)}`;
        if (!f.nullable) def += f.type === "boolean" ? " NOT NULL DEFAULT 0" : " NOT NULL";
        return `    ${pad(f.snake)} ${def}`;
    });
    return {
        path: migrationPath(ctx),
        content: `CREATE TABLE IF NOT EXISTS ${table} (
    ${pad("id")} INTEGER PRIMARY KEY AUTOINCREMENT,
    ${pad("user_id")} INTEGER NOT NULL REFERENCES users (id) ON DELETE CASCADE,
${cols.join(",\n")},
    ${pad("created_at")} TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP,
    ${pad("updated_at")} TEXT    NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_${table}_user_id ON ${table} (user_id);
`,
    };
}

function sample(f: Field): string {
    switch (f.type) {
        case "string":
        case "text":
            return `"Sample ${f.name}"`;
        case "int":
            return "3";
        case "number":
            return "1.5";
        case "boolean":
            return "true";
        case "date":
            return `"2026-10-10T12:00:00Z"`;
        case "json":
            return `{ "k": "v" }`;
    }
}

function test(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const many = names.plural.snake;
    const key = names.camel;
    const keys = names.plural.camel;
    const base = `/api/v1/${names.plural.kebab}`;
    const label = labelField(fields);
    const body = fields.map((f) => `"${f.snake}": ${sample(f)}`).join(", ");
    const changed = isStringish(label) ? `"Renamed"` : sample(label);
    return {
        path: `tests/${many}.rs`,
        content: `//! \`${base}\` — generated by \`cliuno make:resource\`: CRUD round trip and owner checks.

mod common;

use axum::http::StatusCode;
use common::TestApp;
use serde_json::json;

#[tokio::test]
async fn ${many}_crud_round_trip() {
    let app = TestApp::new().await;
    let token = app.token_for("alice").await;
    let auth = Some(token.as_str());

    let created = app
        .request("POST", "${base}", auth, Some(json!({ ${body} })))
        .await;
    assert_eq!(created.status, StatusCode::CREATED);
    let id = created.data("${key}")["id"].as_i64().expect("data.${key}.id");
    assert_eq!(created.data("${key}")["user"]["username"], "alice");

    let list = app.request("GET", "${base}", auth, None).await;
    assert_eq!(list.status, StatusCode::OK);
    assert_eq!(list.data("${keys}").as_array().map(Vec::len), Some(1));

    let mine = app.request("GET", "${base}/current-user", auth, None).await;
    assert_eq!(mine.data("${keys}")[0]["id"], id);

    let path = format!("${base}/{id}");
    let updated = app
        .request("PATCH", &path, auth, Some(json!({ "${label.snake}": ${changed} })))
        .await;
    assert_eq!(updated.status, StatusCode::OK);
    assert_eq!(updated.data("${key}")["${label.snake}"], json!(${changed}));

    let deleted = app.request("DELETE", &path, auth, None).await;
    assert_eq!(deleted.status, StatusCode::OK);
    let gone = app.request("GET", &path, auth, None).await;
    assert_eq!(gone.status, StatusCode::NOT_FOUND);
}

#[tokio::test]
async fn only_the_owner_can_change_a_${names.snake}() {
    let app = TestApp::new().await;
    let owner = app.token_for("owner").await;
    let other = app.token_for("intruder").await;

    let created = app
        .request("POST", "${base}", Some(&owner), Some(json!({ ${body} })))
        .await;
    let id = created.data("${key}")["id"].as_i64().expect("id");
    let path = format!("${base}/{id}");

    let patch = app
        .request("PATCH", &path, Some(&other), Some(json!({})))
        .await;
    assert_eq!(patch.status, StatusCode::FORBIDDEN);
    let delete = app.request("DELETE", &path, Some(&other), None).await;
    assert_eq!(delete.status, StatusCode::FORBIDDEN);
}
`,
    };
}

/** Merge a `pub mod <name>;` into the first block of module declarations, sorted like rustfmt. */
export function mergeModDecl(block: string, name: string): string {
    const mods = new Set(
        block
            .split("\n")
            .map((l) => l.match(/^pub mod (\w+);$/)?.[1])
            .filter((m): m is string => Boolean(m)),
    );
    mods.add(name);
    return [...mods]
        .sort()
        .map((m) => `pub mod ${m};`)
        .join("\n");
}

function registerPatches(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const many = names.plural.snake;
    const one = names.snake;
    const MOD_BLOCK = /^(?:pub mod \w+;\n)*pub mod \w+;$/m;
    return [
        {
            path: "src/routes/mod.rs",
            anchor: MOD_BLOCK,
            where: "after",
            insert: `pub mod ${many};`,
            skipIf: `__never__${many}`,
            replace: (block) => mergeModDecl(block, many),
            describe: `declare the ${many} routes module`,
        },
        {
            path: "src/routes/mod.rs",
            anchor: /^ {8}\.merge\(\w+::routes\(\)\)$/m,
            where: "after",
            insert: `\n        .merge(${many}::routes())`,
            skipIf: `.merge(${many}::routes())`,
            describe: `merge ${many}::routes() into api()`,
        },
        {
            path: "src/models/mod.rs",
            anchor: MOD_BLOCK,
            where: "after",
            insert: `pub mod ${one};`,
            skipIf: `__never__${one}`,
            replace: (block) => mergeModDecl(block, one),
            describe: `declare the ${one} model module`,
        },
    ];
}

const cargoFmt = (): NativeCall => ({ bin: "cargo", args: ["fmt"], quiet: true });

export const axum: Generator = {
    id: "axum",
    label: "Axum",
    kind: "backend",
    format: cargoFmt,
    commands: {
        resource: {
            describe:
                "model + routes (/api/v1/<plural>, owner checks) + sqlx migration + integration test, registered in src/routes/mod.rs and src/models/mod.rs",
            files: (ctx) => [model(ctx), routes(ctx), migration(ctx), test(ctx)],
            patches: registerPatches,
            notes: (ctx) => [
                `Migrations are embedded at build time and run on boot — restart \`cargo run\` and the ${ctx.names.plural.snake} table appears.`,
                "Run `cargo test` and `cargo clippy --all-targets -- -D warnings`.",
            ],
        },
        model: {
            describe: "sqlx row + request bodies + queries in src/models/",
            files: (ctx) => [model(ctx)],
            patches: (ctx) => registerPatches(ctx).slice(2),
        },
        controller: {
            describe: "route handlers in src/routes/ (merged into routes::api())",
            files: (ctx) => [routes(ctx)],
            patches: (ctx) => registerPatches(ctx).slice(0, 2),
        },
        migration: { describe: "sqlx migration in migrations/", files: (ctx) => [migration(ctx)] },
        test: {
            describe: "integration test in tests/ on the TestApp harness",
            files: (ctx) => [test(ctx)],
        },
    },
};
