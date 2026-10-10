import { test } from "node:test";
import assert from "node:assert/strict";
import { applyPatch } from "../engine";
import { mergeRouterImport } from "./fastapi";
import { fastapi } from "./fastapi";
import { buildNames } from "../names";
import { parseFields } from "../fields";
import type { Ctx } from "../types";

const ctx = (name: string): Ctx => ({
    cwd: "/x",
    names: buildNames(name),
    fields: parseFields(undefined),
    force: false,
    dryRun: true,
});

test("router import stays sorted and wraps like ruff format", () => {
    assert.equal(
        mergeRouterImport("from src.routers import auth, users", "todos"),
        "from src.routers import auth, todos, users",
    );
    const long = mergeRouterImport(
        "from src.routers import auth, comments, follows, posts, roles, todos, uploads, users, widgets",
        "gadgets",
    );
    assert.match(long, /^from src\.routers import \(\n {4}auth,\n/);
    assert.equal(
        mergeRouterImport(long, "zebras")
            .split("\n")
            .filter((l) => l.trim() === "zebras,").length,
        1,
    );
});

test("generating several resources keeps one import per router and never a dangling include", () => {
    let app =
        "from src.routers import auth, comments, follows, posts, roles, todos, uploads, users\n\napp.include_router(auth.router)\n";
    for (const name of ["widget", "gadget", "invoice", "widget"]) {
        for (const patch of fastapi.commands.resource!.patches!(ctx(name))) {
            app = applyPatch(app, patch).text;
        }
    }
    for (const mod of ["widgets", "gadgets", "invoices"]) {
        assert.equal(app.split(`${mod}.router`).length - 1, 1, `${mod} include once`);
        assert.match(app, new RegExp(`\\b${mod},?\\n|, ${mod}\\b|${mod}\\n`), `${mod} imported`);
    }
});
