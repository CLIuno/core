#!/usr/bin/env node
// Generate a resource in a throw-away git worktree of every local template and run that
// stack's own quality gates. Local-workspace only (needs ../CLIuno-*-template checkouts).
//
//   node scripts/test-generators.mjs                 # every template
//   node scripts/test-generators.mjs --only express,react
//   node scripts/test-generators.mjs --keep          # leave the worktrees for inspection
//   node scripts/test-generators.mjs --fields name:string,price:number
//   node scripts/test-generators.mjs --cli dist-nest/app.js   # use a separate build output
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const core = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const workspace = path.resolve(core, "..");

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i === -1 ? undefined : args[i + 1] && !args[i + 1].startsWith("--") ? args[i + 1] : true;
};
const only = typeof flag("only") === "string" ? flag("only").split(",") : null;
const keep = flag("keep") === true;
const fields =
    typeof flag("fields") === "string"
        ? flag("fields")
        : "name:string,price:number,done:boolean,due:date?";
const scratch =
    typeof flag("scratch") === "string" ? flag("scratch") : path.join(os.tmpdir(), "cliuno-gen");
// --cli <path> lets parallel workers use their own build (e.g. `pnpm exec tsup --out-dir dist-x`).
const cli = path.resolve(
    core,
    typeof flag("cli") === "string" ? flag("cli") : path.join("dist", "app.js"),
);

const has = (bin) =>
    spawnSync("which", [bin], { stdio: "ignore" }).status === 0 &&
    spawnSync(bin, ["--version"], { stdio: "ignore" }).status === 0;
const pnpm = ["pnpm install --prefer-offline"];

/** id → { dir, needs: [binaries], prepare: [cmds], check: [cmds] } — mirrors each template's CI. */
const TEMPLATES = {
    express: {
        dir: "CLIuno-Express-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: [
            "pnpm type-check",
            "pnpm lint",
            "pnpm build",
            "npx jest --passWithNoTests src/__tests__/widget.spec.ts",
        ],
    },
    fastify: {
        dir: "CLIuno-Fastify-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm type-check", "pnpm lint", "pnpm build"],
    },
    nest: {
        dir: "CLIuno-Nest-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm build", "pnpm lint", "pnpm test"],
    },
    adonis: {
        dir: "CLIuno-Adonis-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm typecheck", "pnpm lint"],
    },
    django: {
        dir: "CLIuno-Django-template",
        needs: ["uv"],
        prepare: ["uv sync --extra dev"],
        check: [
            "uv run python manage.py makemigrations",
            "uv run python manage.py test",
            "uv run ruff check .",
        ],
    },
    fastapi: {
        dir: "CLIuno-FastAPI-template",
        needs: ["uv"],
        prepare: ["uv sync --extra dev"],
        check: ["uv run pytest tests/ -q", "uv run ruff check ."],
    },
    laravel: {
        dir: "CLIuno-Laravel-template",
        needs: ["php", "composer"],
        prepare: [
            "composer install --prefer-dist --no-interaction --quiet",
            "cp -n .env.example .env",
            "php artisan key:generate --quiet",
            "touch database/database.sqlite",
        ],
        check: ["php artisan test", "vendor/bin/pint --test"],
    },
    tallstack: {
        dir: "CLIuno-TallStack-template",
        needs: ["php", "composer", "npm"],
        prepare: [
            "composer install --prefer-dist --no-interaction --quiet",
            "cp -n .env.example .env",
            "php artisan key:generate --quiet",
            "touch database/database.sqlite",
            "npm ci --silent",
            "npm run build --silent",
        ],
        check: ["php artisan test", "vendor/bin/pint --test"],
    },
    rails: {
        dir: "CLIuno-Rails-template",
        needs: ["ruby", "bundle"],
        prepare: ["bundle install --quiet", "bin/rails db:prepare"],
        check: ["bin/rails db:migrate", "bin/rails test", "bin/rubocop"],
    },
    spring: {
        dir: "CLIuno-Spring-template",
        needs: ["java"],
        prepare: [],
        check: ["./mvnw -B -q test"],
    },
    aspnet: {
        dir: "CLIuno-ASP.NET-template",
        needs: ["dotnet"],
        prepare: [],
        check: ["dotnet build"],
    },
    drogon: {
        dir: "CLIuno-Drogon-template",
        needs: ["cmake"],
        prepare: [],
        check: ["cmake -S . -B build", "cmake --build build"],
    },
    react: {
        dir: "CLIuno-React-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm build", "pnpm lint"],
    },
    next: {
        dir: "CLIuno-Next-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm type-check", "pnpm lint", "pnpm build"],
    },
    vue: {
        dir: "CLIuno-Vue-template",
        needs: ["pnpm"],
        prepare: ["cp -n .env.example .env", ...pnpm],
        check: ["pnpm type-check", "pnpm lint", "pnpm build-only"],
    },
    nuxt: {
        dir: "CLIuno-Nuxt-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm lint", "pnpm build"],
    },
    svelte: {
        dir: "CLIuno-Svelte-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm build", "pnpm check", "pnpm lint"],
    },
    solid: {
        dir: "CLIuno-Solid-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["npx tsc --noEmit", "pnpm lint", "pnpm build"],
    },
    angular: {
        dir: "CLIuno-Angular-template",
        needs: ["pnpm"],
        prepare: pnpm,
        check: ["pnpm build", "pnpm lint"],
    },
    flutter: {
        dir: "CLIuno-Flutter-template",
        needs: ["flutter"],
        prepare: ["flutter pub get"],
        check: ["flutter analyze", "flutter test"],
    },
    reactnative: {
        dir: "CLIuno-ReactNative-template",
        needs: ["npm"],
        prepare: ["npm ci --silent"],
        check: ["npm run type-check", "npm run lint"],
    },
};

function run(cmd, cwd, env = {}) {
    const started = Date.now();
    const result = spawnSync(cmd, {
        cwd,
        shell: true,
        stdio: "pipe",
        encoding: "utf8",
        env: { ...process.env, VIRTUAL_ENV: undefined, CI: "1", ...env },
    });
    return {
        ok: result.status === 0,
        out: `${result.stdout ?? ""}${result.stderr ?? ""}`,
        ms: Date.now() - started,
    };
}

const results = [];
fs.mkdirSync(scratch, { recursive: true });

for (const [id, t] of Object.entries(TEMPLATES)) {
    if (only && !only.includes(id)) continue;
    const repo = path.join(workspace, t.dir);
    const row = { id, status: "PASS", step: "", ms: 0, detail: "" };
    results.push(row);
    const started = Date.now();
    const missing = t.needs.filter((bin) => !has(bin));
    if (!fs.existsSync(repo)) {
        row.status = "SKIP";
        row.detail = `${t.dir} not checked out`;
        continue;
    }
    if (missing.length > 0) {
        row.status = "SKIP";
        row.detail = `missing tool: ${missing.join(", ")}`;
        continue;
    }

    const wt = path.join(scratch, id);
    run(`git worktree remove --force "${wt}"`, repo);
    fs.rmSync(wt, { recursive: true, force: true });
    const add = run(`git worktree add --detach "${wt}" HEAD`, repo);
    if (!add.ok) {
        row.status = "FAIL";
        row.step = "worktree";
        row.detail = add.out.trim().split("\n").slice(-5).join("\n");
        continue;
    }

    const steps = [
        ...t.prepare.map((c) => ["prepare", c]),
        ["generate", `node "${cli}" make:resource Widget --fields ${fields}`],
        ...t.check.map((c) => ["check", c]),
    ];
    for (const [phase, cmd] of steps) {
        process.stdout.write(`${id.padEnd(12)} ${phase.padEnd(9)} ${cmd}\n`);
        const r = run(cmd, wt);
        if (!r.ok) {
            row.status = "FAIL";
            row.step = `${phase}: ${cmd}`;
            row.detail = r.out.trim().split("\n").slice(-25).join("\n");
            break;
        }
    }
    row.ms = Date.now() - started;
    if (!keep) {
        run(`git worktree remove --force "${wt}"`, repo);
        fs.rmSync(wt, { recursive: true, force: true });
    }
}

console.log("\n" + "id".padEnd(12) + "status  " + "time".padStart(7) + "  detail");
for (const r of results) {
    console.log(
        `${r.id.padEnd(12)}${r.status.padEnd(8)}${String(Math.round(r.ms / 1000) + "s").padStart(7)}  ${r.step}`,
    );
    if (r.status === "FAIL") console.log(r.detail.replace(/^/gm, "    "));
    else if (r.status === "SKIP") console.log(`    ${r.detail}`);
}
if (keep) console.log(`\nWorktrees kept under ${scratch}`);
process.exit(results.some((r) => r.status === "FAIL") ? 1 : 0);
