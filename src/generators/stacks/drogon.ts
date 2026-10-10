import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";

// Stubs mirror CLIuno-Drogon-template: one self-contained HttpController<T> per resource in
// controllers/<P>Controller.cc (METHOD_LIST + ADD_METHOD_TO, raw SQL through
// app().getDbClient()->execSqlSync with sqlite "?" placeholders, cliuno::ok/fail/envelope for
// the {status, message, data} envelope, currentUserId(req) as the auth guard). CMake globs
// controllers/*.cc, so the only registration is the CREATE TABLE statement in main.cc.

const SQLITE: Record<FieldType, string> = {
    string: "TEXT",
    text: "TEXT",
    int: "INTEGER",
    number: "REAL",
    boolean: "INTEGER",
    date: "TEXT",
    json: "TEXT",
};

const SIG = "const HttpRequestPtr &, std::function<void(const HttpResponsePtr &)> &&";

/** `field(b, "title")`, or the camelCase key with a snake_case fallback for multi-word names. */
function read(f: Field): string {
    return f.camel === f.snake ? `field(b, "${f.camel}")` : `field(b, "${f.camel}", "${f.snake}")`;
}

/** jsoncpp predicate that the request value has the right shape. */
function check(f: Field): string {
    const v = read(f);
    switch (f.type) {
        case "string":
        case "text":
        case "date":
            return `${v}.isString()`;
        case "int":
            return `${v}.isIntegral()`;
        case "number":
            return `${v}.isNumeric()`;
        case "boolean":
            return `${v}.isBool()`;
        case "json":
            return `!${v}.isNull()`;
    }
}

/** Expression that converts the request value into a bindable sqlite argument. */
function bind(f: Field): string {
    const v = read(f);
    switch (f.type) {
        case "string":
        case "text":
        case "date":
            return `${v}.asString()`;
        case "int":
            return `${v}.asInt64()`;
        case "number":
            return `${v}.asDouble()`;
        case "boolean":
            return `${v}.asBool() ? 1 : 0`;
        case "json":
            return `jsonText(${v})`;
    }
}

/** Expression that reads the column back from an orm::Row into a Json::Value. */
function column(f: Field): string {
    const c = `r["${f.snake}"]`;
    let value: string;
    switch (f.type) {
        case "string":
        case "text":
        case "date":
            value = `Json::Value(${c}.as<std::string>())`;
            break;
        case "int":
            value = `Json::Value(${c}.as<int64_t>())`;
            break;
        case "number":
            value = `Json::Value(${c}.as<double>())`;
            break;
        case "boolean":
            value = `Json::Value(${c}.as<int>() != 0)`;
            break;
        case "json":
            value = `parseJson(${c}.as<std::string>())`;
            break;
    }
    if (f.nullable || f.type === "json") return `${c}.isNull() ? Json::Value() : ${value}`;
    return value;
}

function schemaColumn(f: Field): string {
    const parts = [f.snake, SQLITE[f.type]];
    if (!f.nullable) parts.push("NOT NULL");
    if (f.type === "boolean" && !f.nullable) parts.push("DEFAULT 0");
    return parts.join(" ");
}

function requiredGuard(f: Field, title: string): string {
    const v = read(f);
    const test =
        f.type === "string" || f.type === "text"
            ? `!${v}.isString() || ${v}.asString().empty()`
            : `!${check(f)}`;
    const line = `    if (${test})`;
    const action = `return cb(fail(k400BadRequest, "warning", "${title} is required"));`;
    return line.length + action.length + 1 > 100
        ? `${line}\n        ${action}`
        : `${line} ${action}`;
}

/** `UPDATE <table> SET <col>=? …` guarded by the request value's shape (one statement per field). */
function setStatement(f: Field, table: string, indent: string, uid: string): string {
    return `${indent}if (${check(f)})
${indent}    db->execSqlSync("UPDATE ${table} SET ${f.snake}=? WHERE id=? AND user_id=?",
${indent}                    ${bind(f)}, id, ${uid});`;
}

function present(f: Field): string {
    return f.camel === f.snake ? `has(b, "${f.camel}")` : `has(b, "${f.camel}", "${f.snake}")`;
}

function clearStatement(f: Field, table: string, indent: string, uid: string): string {
    return `${indent}else if (${present(f)} && ${read(f)}.isNull())
${indent}    db->execSqlSync("UPDATE ${table} SET ${f.snake}=NULL WHERE id=? AND user_id=?", id, ${uid});`;
}

function controller(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const C = `${P}Controller`;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    const titles = names.plural.title;
    const table = names.plural.snake;
    const route = `/api/v1/${names.plural.kebab}`;
    const required = fields.filter((f) => !f.nullable);
    const optional = fields.filter((f) => f.nullable);
    const hasJson = fields.some((f) => f.type === "json");
    const hasSnake = fields.some((f) => f.camel !== f.snake);

    const includes = ["#include <functional>", "#include <string>"];
    if (hasJson) includes.unshift("#include <memory>");

    const insertColumns = ["user_id", ...required.map((f) => f.snake)];
    const insertArgs = [
        "*id",
        ...required.map((f) =>
            f.type === "boolean" ? `${check(f)} && ${read(f)}.asBool() ? 1 : 0` : bind(f),
        ),
    ];

    const guards = required
        .filter((f) => f.type !== "boolean")
        .map((f) => `${requiredGuard(f, f.pascal)}\n`)
        .join("");

    const helpers: string[] = [];
    helpers.push(`// Request keys arrive camelCase (or snake_case); a missing key reads as null.
const Json::Value &field(const Json::Value &b, const char *camel${hasSnake ? ", const char *snake = nullptr" : ""})
{
${
    hasSnake
        ? `    if (b.isMember(camel) || !snake) return b[camel];
    return b[snake];`
        : `    return b[camel];`
}
}`);
    if (hasJson)
        helpers.push(`// JSON columns are stored as text and parsed again on the way out.
std::string jsonText(const Json::Value &value)
{
    Json::StreamWriterBuilder writer;
    writer["indentation"] = "";
    return Json::writeString(writer, value);
}
Json::Value parseJson(const std::string &text)
{
    Json::CharReaderBuilder builder;
    std::unique_ptr<Json::CharReader> reader(builder.newCharReader());
    Json::Value out;
    std::string errs;
    if (text.empty() || !reader->parse(text.data(), text.data() + text.size(), &out, &errs))
        return Json::Value();
    return out;
}`);
    if (optional.length > 0)
        helpers.push(`// A missing key and an explicit null both read as null; only an explicit null clears a column.
bool has(const Json::Value &b, const char *camel, const char *snake = nullptr)
{
    return b.isMember(camel) || (snake != nullptr && b.isMember(snake));
}`);
    helpers.push(`// Nullable columns: set when the key is present, clear when it is explicitly null.
void applyOptional(const orm::DbClientPtr &db, const Json::Value &b, int64_t id, int64_t uid)
{
${optional.map((f) => `${setStatement(f, table, "    ", "uid")}\n${clearStatement(f, table, "    ", "uid")}`).join("\n")}
}`);

    const pad = " ".repeat(`void ${C}::update(`.length);
    const padShow = " ".repeat(`void ${C}::show(`.length);
    const padList = " ".repeat(`void ${C}::list(`.length);
    const padCreate = " ".repeat(`void ${C}::create(`.length);
    const padCurrent = " ".repeat(`void ${C}::currentUser(`.length);
    const padRemove = " ".repeat(`void ${C}::remove(`.length);

    return {
        path: `controllers/${C}.cc`,
        content: `#include "../utils/Helpers.h"

#include <drogon/HttpController.h>

${includes.join("\n")}

using namespace drogon;
using namespace cliuno;

// ${route} — all scoped to the authenticated owner.
class ${C} : public HttpController<${C}>
{
  public:
    METHOD_LIST_BEGIN
    ADD_METHOD_TO(${C}::currentUser, "${route}/current-user", Get);
    ADD_METHOD_TO(${C}::list, "${route}", Get);
    ADD_METHOD_TO(${C}::create, "${route}", Post);
    ADD_METHOD_TO(${C}::show, "${route}/{id}", Get);
    ADD_METHOD_TO(${C}::update, "${route}/{id}", Patch);
    ADD_METHOD_TO(${C}::remove, "${route}/{id}", Delete);
    METHOD_LIST_END

    void list(${SIG});
    void currentUser(${SIG});
    void create(${SIG});
    void show(${SIG}, std::string);
    void update(${SIG}, std::string);
    void remove(${SIG}, std::string);
};

namespace
{
${helpers.join("\n")}

Json::Value ${one}Json(const orm::Row &r)
{
    Json::Value v(Json::objectValue);
    v["id"] = r["id"].as<int64_t>();
    v["user_id"] = r["user_id"].as<int64_t>();
${fields.map((f) => `    v["${f.snake}"] = ${column(f)};`).join("\n")}
    v["created_at"] = r["created_at"].isNull() ? "" : r["created_at"].as<std::string>();
    return v;
}
} // namespace

void ${C}::list(const HttpRequestPtr &req,
${padList}std::function<void(const HttpResponsePtr &)> &&cb)
{
    auto id = currentUserId(req);
    if (!id) return cb(fail(k401Unauthorized, "error", "Unauthorized"));
    auto rows = app().getDbClient()->execSqlSync(
        "SELECT * FROM ${table} WHERE user_id=? ORDER BY id DESC", *id);
    Json::Value arr(Json::arrayValue);
    for (auto &r : rows) arr.append(${one}Json(r));
    Json::Value data(Json::objectValue);
    data["${many}"] = arr;
    cb(ok("${titles} fetched", data));
}

void ${C}::currentUser(const HttpRequestPtr &req,
${padCurrent}std::function<void(const HttpResponsePtr &)> &&cb)
{
    list(req, std::move(cb));
}

void ${C}::create(const HttpRequestPtr &req,
${padCreate}std::function<void(const HttpResponsePtr &)> &&cb)
{
    auto id = currentUserId(req);
    if (!id) return cb(fail(k401Unauthorized, "error", "Unauthorized"));
    const Json::Value b = bodyJson(req);
${guards}    auto db = app().getDbClient();
    auto ins = db->execSqlSync(
        "INSERT INTO ${table}(${insertColumns.join(",")}) VALUES(${insertColumns.map(() => "?").join(",")})",
        ${insertArgs.join(",\n        ")});
${optional.length > 0 ? `    applyOptional(db, b, static_cast<int64_t>(ins.insertId()), *id);\n` : ""}    auto rows = db->execSqlSync("SELECT * FROM ${table} WHERE id=?", ins.insertId());
    Json::Value data(Json::objectValue);
    data["${one}"] = ${one}Json(rows[0]);
    cb(envelope(k201Created, "success", "${title} created", data));
}

void ${C}::show(const HttpRequestPtr &req,
${padShow}std::function<void(const HttpResponsePtr &)> &&cb, std::string id)
{
    auto uid = currentUserId(req);
    if (!uid) return cb(fail(k401Unauthorized, "error", "Unauthorized"));
    try
    {
        auto rows = app().getDbClient()->execSqlSync(
            "SELECT * FROM ${table} WHERE id=? AND user_id=?", std::stoll(id), *uid);
        if (rows.empty()) return cb(fail(k404NotFound, "warning", "${title} not found"));
        Json::Value data(Json::objectValue);
        data["${one}"] = ${one}Json(rows[0]);
        cb(ok("", data));
    }
    catch (...)
    {
        cb(fail(k404NotFound, "warning", "${title} not found"));
    }
}

void ${C}::update(const HttpRequestPtr &req,
${pad}std::function<void(const HttpResponsePtr &)> &&cb, std::string rowId)
{
    auto uid = currentUserId(req);
    if (!uid) return cb(fail(k401Unauthorized, "error", "Unauthorized"));
    try
    {
        const Json::Value b = bodyJson(req);
        auto db = app().getDbClient();
        const int64_t id = std::stoll(rowId);
        auto rows = db->execSqlSync("SELECT * FROM ${table} WHERE id=? AND user_id=?", id, *uid);
        if (rows.empty()) return cb(fail(k404NotFound, "warning", "${title} not found"));
${required.map((f) => setStatement(f, table, "        ", "*uid")).join("\n")}
${optional.length > 0 ? `        applyOptional(db, b, id, *uid);\n` : ""}        auto updated = db->execSqlSync("SELECT * FROM ${table} WHERE id=? AND user_id=?", id, *uid);
        Json::Value data(Json::objectValue);
        data["${one}"] = ${one}Json(updated[0]);
        cb(ok("${title} updated", data));
    }
    catch (...)
    {
        cb(fail(k404NotFound, "warning", "${title} not found"));
    }
}

void ${C}::remove(const HttpRequestPtr &req,
${padRemove}std::function<void(const HttpResponsePtr &)> &&cb, std::string id)
{
    auto uid = currentUserId(req);
    if (!uid) return cb(fail(k401Unauthorized, "error", "Unauthorized"));
    try
    {
        auto db = app().getDbClient();
        auto rows = db->execSqlSync("SELECT * FROM ${table} WHERE id=? AND user_id=?",
                                    std::stoll(id), *uid);
        if (rows.empty()) return cb(fail(k404NotFound, "warning", "${title} not found"));
        Json::Value data(Json::objectValue);
        data["${one}"] = ${one}Json(rows[0]);
        db->execSqlSync("DELETE FROM ${table} WHERE id=? AND user_id=?", std::stoll(id), *uid);
        cb(ok("${title} deleted", data));
    }
    catch (...)
    {
        cb(fail(k404NotFound, "warning", "${title} not found"));
    }
}
`,
    };
}

function schema(ctx: Ctx): Patch[] {
    const { names, fields } = ctx;
    const table = names.plural.snake;
    const columns = [
        "id INTEGER PRIMARY KEY AUTOINCREMENT, user_id INTEGER NOT NULL,",
        ...fields.map((f) => `${schemaColumn(f)},`),
        "created_at TEXT NOT NULL DEFAULT (datetime('now')))",
    ];
    return [
        {
            path: "main.cc",
            anchor: "for (const auto &sql : schema) db->execSqlSync(sql);",
            where: "after",
            insert: `
        db->execSqlSync(
            "CREATE TABLE IF NOT EXISTS ${table} ("
${columns.map((c) => `            "${c}"`).join("\n")});`,
            skipIf: `CREATE TABLE IF NOT EXISTS ${table} (`,
            describe: `create the ${table} table at boot`,
        },
    ];
}

export const drogon: Generator = {
    id: "drogon",
    label: "Drogon",
    kind: "backend",
    commands: {
        resource: {
            describe:
                "HttpController in controllers/ under /api/v1/<plural> + CREATE TABLE in main.cc (CMake globs controllers/*.cc)",
            files: (ctx) => [controller(ctx)],
            patches: schema,
            notes: (ctx) => [
                `Rebuild (cmake --build build) — CMake globs controllers/*.cc; the ${ctx.names.plural.snake} table is created at boot by main.cc.`,
                `Routes live at /api/v1/${ctx.names.plural.kebab} (+ /current-user); rows are scoped to the Bearer user.`,
                "Responses use snake_case keys; requests accept camelCase or snake_case keys.",
            ],
        },
        controller: {
            describe:
                "HttpController<T> using currentUserId + the ok/fail envelope (needs the table in main.cc)",
            files: (ctx) => [controller(ctx)],
        },
    },
};
