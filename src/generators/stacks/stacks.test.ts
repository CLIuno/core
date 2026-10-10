import { test } from "node:test";
import assert from "node:assert/strict";
import { generators } from "./index";
import { plan, type Io } from "../engine";
import { buildNames } from "../names";
import { parseFields } from "../fields";
import type { Ctx, Kind } from "../types";

const noNative: Io = {
    exists: () => false,
    read: () => "",
    write: () => {},
    which: () => false,
    run: () => 0,
};

const specs = [
    undefined,
    "name:string,price:number,qty:int,done:boolean,body:text?,due:date?,meta:json?",
];

for (const gen of Object.values(generators)) {
    const kinds = Object.keys(gen.commands) as Kind[];
    if (kinds.length === 0) continue;

    for (const kind of kinds) {
        for (const spec of specs) {
            test(`${gen.id} make:${kind} renders (${spec ? "custom" : "default"} fields)`, () => {
                const ctx: Ctx = {
                    cwd: "/tmp/x",
                    names: buildNames("blog-post"),
                    fields: parseFields(spec),
                    force: false,
                    dryRun: true,
                };
                let p;
                try {
                    p = plan(gen, kind, ctx, noNative);
                } catch (error) {
                    // native-only commands are allowed to refuse when the binary is absent
                    assert.match((error as Error).message, /not found on PATH/);
                    return;
                }
                const paths = new Set<string>();
                for (const file of p.files) {
                    assert.ok(!file.path.startsWith("/"), `${file.path} must be relative`);
                    assert.ok(!paths.has(file.path), `${file.path} duplicated`);
                    paths.add(file.path);
                    assert.ok(
                        !file.path.includes("undefined"),
                        `${file.path} has an undefined segment`,
                    );
                    for (const bad of ["[object Object]", "NaN"]) {
                        assert.ok(
                            !file.content.includes(bad),
                            `${gen.id}:${kind} ${file.path} contains "${bad}"`,
                        );
                    }
                    // handlebars-style leftovers like {{NAME}}; Vue/Angular `{{ expr }}` interpolation is fine
                    assert.doesNotMatch(
                        file.content,
                        /\{\{[A-Z_]+\}\}/,
                        `${gen.id}:${kind} ${file.path} has an unfilled placeholder`,
                    );
                    // "undefined" glued to an identifier means a template placeholder failed to interpolate
                    assert.doesNotMatch(
                        file.content,
                        /[A-Za-z]undefined|undefined[A-Za-z]/,
                        `${gen.id}:${kind} ${file.path} has an un-interpolated name`,
                    );
                    assert.ok(file.content.trim().length > 0, `${file.path} is empty`);
                }
                for (const patch of p.patches) {
                    assert.ok(
                        patch.skipIf.length > 0,
                        `${gen.id}:${kind} patch for ${patch.path} needs skipIf`,
                    );
                    assert.ok(!patch.insert.includes("undefined"));
                }
            });
        }
    }
}
