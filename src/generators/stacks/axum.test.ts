import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../engine";
import { axum, mergeModDecl } from "./axum";
import { buildNames } from "../names";
import { parseFields } from "../fields";
import type { Ctx } from "../types";

const ctx = (name: string): Ctx => ({
    cwd: "/x",
    names: buildNames(name),
    fields: parseFields("type:string,meta:json"),
    force: false,
    dryRun: true,
});

test("module declarations stay sorted and unique (rustfmt reorder_modules)", () => {
    assert.equal(
        mergeModDecl("pub mod auth;\npub mod users;", "products"),
        "pub mod auth;\npub mod products;\npub mod users;",
    );
    assert.equal(mergeModDecl("pub mod a;\npub mod b;", "a"), "pub mod a;\npub mod b;");
});

test("registering twice changes nothing the second time", () => {
    let mod =
        "pub mod auth;\npub mod todos;\n\npub fn api() -> Router<AppState> {\n    Router::new()\n        .merge(auth::routes())\n        .merge(todos::routes())\n}\n";
    const patches = axum.commands.resource!.patches!(ctx("product")).filter(
        (p) => p.path === "src/routes/mod.rs",
    );
    for (let i = 0; i < 2; i++) for (const p of patches) mod = applyPatch(mod, p).text;
    assert.equal(mod.split("pub mod products;").length - 1, 1);
    assert.equal(mod.split(".merge(products::routes())").length - 1, 1);
});

test("keyword field names become raw identifiers and JSON columns use the text serializer", () => {
    const [model] = axum.commands.model!.files!(ctx("product"));
    assert.match(model!.content, /pub r#type: String,/);
    assert.match(
        model!.content,
        /#\[serde\(serialize_with = "as_json"\)\]\n {4}pub meta: Option<String>,/,
    );
    assert.match(model!.content, /fn as_json</);
});
