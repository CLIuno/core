import { test } from "node:test";
import assert from "node:assert/strict";
import { apply, applyPatch, plan, quoteForCmd, type Io } from "./engine";
import type { Ctx, Generator, Patch } from "./types";
import { buildNames } from "./names";
import { parseFields } from "./fields";

const ctx = (over: Partial<Ctx> = {}): Ctx => ({
    cwd: "/app",
    names: buildNames("post"),
    fields: parseFields(undefined),
    force: false,
    dryRun: false,
    ...over,
});

function memIo(
    files: Record<string, string>,
    bins: string[] = [],
): Io & { files: Record<string, string>; ran: string[] } {
    const ran: string[] = [];
    return {
        files,
        ran,
        exists: (f) => f in files,
        read: (f) => files[f] as string,
        write: (f, c) => {
            files[f] = c;
        },
        which: (bin) => bins.includes(bin),
        run: (call) => {
            ran.push(`${call.bin} ${call.args.join(" ")}`);
            return 0;
        },
    };
}

const gen: Generator = {
    id: "express",
    label: "Express",
    kind: "backend",
    commands: {
        model: {
            describe: "entity",
            native: () => [{ bin: "php", args: ["artisan", "make:model"] }],
            files: (c) => [{ path: `src/${c.names.kebab}.ts`, content: "stub" }],
        },
        migration: {
            describe: "only native",
            native: () => [{ bin: "php", args: ["artisan", "make:migration"] }],
        },
        resource: {
            describe: "all",
            files: (c) => [{ path: `src/${c.names.kebab}.ts`, content: "stub" }],
            patches: () => [
                {
                    path: "src/index.ts",
                    anchor: "// end",
                    insert: "use(post)\n",
                    where: "before",
                    skipIf: "use(post)",
                    describe: "register",
                },
            ],
        },
    },
};

const patch: Patch = {
    path: "x",
    anchor: "// anchor",
    insert: "NEW\n",
    where: "after",
    skipIf: "NEW",
    describe: "add",
};

test("applyPatch after/before/skip/missing", () => {
    assert.equal(applyPatch("a\n// anchor\nb", patch).text, "a\n// anchorNEW\n\nb");
    assert.equal(
        applyPatch("a\n// anchor\nb", { ...patch, where: "before" }).text,
        "a\nNEW\n// anchor\nb",
    );
    assert.equal(applyPatch("NEW\n// anchor", patch).status, "skipped");
    assert.equal(applyPatch("nothing", patch).status, "anchor-missing");
    assert.equal(
        applyPatch("x\nimport a\nimport b\ny", { ...patch, anchor: /^import .*$/m }).text,
        "x\nimport a\nimport bNEW\n\ny",
    );
});

test("plan prefers native when the binary exists, falls back to stubs otherwise", () => {
    const withPhp = plan(gen, "model", ctx(), memIo({}, ["php"]));
    assert.equal(withPhp.native.length, 1);
    assert.equal(withPhp.files.length, 0);
    const noPhp = plan(gen, "model", ctx(), memIo({}));
    assert.equal(noPhp.native.length, 0);
    assert.equal(noPhp.files.length, 1);
    assert.match(noPhp.notes[0] as string, /not found/);
    assert.throws(() => plan(gen, "migration", ctx(), memIo({})), /not found on PATH/);
    assert.throws(() => plan(gen, "page", ctx(), memIo({})), /no "make:page"/);
});

test("apply refuses to overwrite without --force, writes with it, dry-run touches nothing", async () => {
    const io = memIo({ "/app/src/post.ts": "old", "/app/src/index.ts": "// end" });
    const p = plan(gen, "resource", ctx(), io);
    let r = await apply(p, ctx(), io);
    assert.deepEqual(r.skipped, ["src/post.ts"]);
    assert.equal(io.files["/app/src/post.ts"], "old");
    assert.equal(io.files["/app/src/index.ts"], "use(post)\n// end");

    r = await apply(p, ctx({ force: true }), io);
    assert.deepEqual(r.written, ["src/post.ts"]);
    assert.equal(io.files["/app/src/post.ts"], "stub");
    assert.equal(io.files["/app/src/index.ts"], "use(post)\n// end", "patch is idempotent");
    assert.deepEqual(r.patched, []);

    const dry = memIo({ "/app/src/index.ts": "// end" });
    r = await apply(p, ctx({ dryRun: true }), dry);
    assert.deepEqual(r.written, ["src/post.ts"]);
    assert.equal(dry.files["/app/src/post.ts"], undefined);
    assert.equal(dry.files["/app/src/index.ts"], "// end");
});

test("missing patch target or anchor becomes a note", async () => {
    const io = memIo({});
    const r = await apply(plan(gen, "resource", ctx(), io), ctx(), io);
    assert.match(r.notes[0] as string, /src\/index.ts not found/);
    const io2 = memIo({ "/app/src/index.ts": "no anchor here" });
    const r2 = await apply(plan(gen, "resource", ctx(), io2), ctx(), io2);
    assert.match(r2.notes[0] as string, /Could not find where to register/);
});

test("native calls run in order and dry-run only reports them", async () => {
    const io = memIo({}, ["php"]);
    const r = await apply(plan(gen, "model", ctx(), io), ctx(), io);
    assert.deepEqual(io.ran, ["php artisan make:model"]);
    assert.equal(r.nativeExit, 0);
    const dry = memIo({}, ["php"]);
    const r2 = await apply(plan(gen, "model", ctx(), dry), ctx({ dryRun: true }), dry);
    assert.deepEqual(dry.ran, []);
    assert.match(r2.notes[0] as string, /would run: php artisan make:model/);
});

test("formatter runs on written + patched files when its binary exists", async () => {
    const io = memIo({ "/app/src/index.ts": "// end" }, ["node_modules/.bin/oxfmt"]);
    const formatted: Generator = {
        ...gen,
        format: (files) => ({ bin: "node_modules/.bin/oxfmt", args: files, quiet: true }),
    };
    const r = await apply(plan(formatted, "resource", ctx(), io), ctx(), io, formatted);
    assert.equal(r.formatted, true);
    assert.deepEqual(io.ran, ["node_modules/.bin/oxfmt src/post.ts src/index.ts"]);
    const none = memIo({ "/app/src/index.ts": "// end" });
    const r2 = await apply(plan(formatted, "resource", ctx(), none), ctx(), none, formatted);
    assert.equal(r2.formatted, undefined);
    assert.deepEqual(none.ran, []);
});

test("replace patches rewrite the matched text and are idempotent", () => {
    const merge = (m: string) => (m.includes("b") ? m : `${m}, b`);
    const p: Patch = {
        path: "x",
        anchor: /^import .+$/m,
        insert: "b",
        where: "after",
        skipIf: "__never__",
        replace: merge,
        describe: "merge",
    };
    const once = applyPatch("import a\nrest", p);
    assert.equal(once.text, "import a, b\nrest");
    assert.equal(applyPatch(once.text, p).status, "skipped");
});

test("cmd.exe quoting keeps names with spaces and metacharacters as one argument", () => {
    assert.equal(quoteForCmd("make:model"), "make:model");
    assert.equal(quoteForCmd("Blog Post"), '"Blog Post"');
    assert.equal(quoteForCmd('a"b&c'), '"a""b&c"');
    assert.equal(quoteForCmd(""), '""');
});
