#!/usr/bin/env node
/**
 * CLIuno frontend x backend compatibility matrix.
 *
 * For every backend template: boot it for real, run the canonical demo-app
 * flow (register -> login -> users/todos/posts/comments/follows -> logout)
 * using the exact payloads the frontends send.
 * For every frontend template: statically extract the endpoints its API
 * layer calls, then grade each frontend/backend pair against the live
 * results (flow-tested endpoints) plus existence probes for the rest.
 *
 * Usage:
 *   node scripts/test-matrix.mjs                     # full 5x6 matrix
 *   node scripts/test-matrix.mjs --backends express  # one backend
 *   node scripts/test-matrix.mjs --frontends vue,react --verbose
 *
 * Zero dependencies. Requires Node >= 18 (global fetch).
 */

import { spawn, execFileSync } from "node:child_process";
import crypto from "node:crypto";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import net from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = process.env.TEMPLATES_ROOT || path.resolve(__dirname, "..", "..");
const PORT = Number(process.env.MATRIX_PORT || 4310);
const SMTP_PORT = Number(process.env.MATRIX_SMTP_PORT || 4325);
const BASE = `http://127.0.0.1:${PORT}/api/v1`;
const BOOT_TIMEOUT_MS = 120_000;
const STEP_TIMEOUT_MS = 15_000;

const args = process.argv.slice(2);
const flag = (name) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 ? (args[i + 1] ?? "") : null;
};
const VERBOSE = args.includes("--verbose");
const onlyBackends = flag("backends")?.split(",").filter(Boolean);
const onlyFrontends = flag("frontends")?.split(",").filter(Boolean);
const OUT = flag("out") || path.join(__dirname, "..", "matrix-report.json");

const log = (...a) => console.log(...a);
const vlog = (...a) => VERBOSE && console.log("   ", ...a);

/* ---------------------------------------------------------------- config */

const testEnvBase = {
    NODE_ENV: "development",
    API_VERSION: "v1",
    JWT_SECRET_KEY: "matrix-test-secret",
    REFRESH_JWT_SECRET_KEY: "matrix-test-refresh-secret",
    SESSION_SECRET: "matrix-test-session",
    MAIL_HOST: "127.0.0.1",
    MAIL_PORT: String(SMTP_PORT),
    MAIL_USERNAME: "",
    MAIL_PASSWORD: "",
    MAIL_FROM_ADDRESS: "matrix@test.local",
    APP_URL: `http://127.0.0.1:${PORT}`,
    FRONTEND_URL: "http://127.0.0.1:5999",
};

// Read a stored one-time token (reset/verify) straight from the backend's database,
// standing in for the email the user would normally receive.
const sqliteRead = (dir, dbFile, table, col, email) =>
    execFileSync(
        "node",
        [
            "-e",
            `const D=require('better-sqlite3');const r=new D('${dbFile}').prepare('SELECT ${col} AS t FROM ${table} WHERE email=?').get(process.argv[1]);process.stdout.write((r&&r.t)||'')`,
            email,
        ],
        { cwd: dir },
    )
        .toString()
        .trim();

const BACKENDS = [
    {
        id: "express",
        dir: "CLIuno-Express-template",
        start: () => ({ cmd: "node_modules/.bin/tsx", args: ["src/app.ts"] }),
        env: { PORT: String(PORT) },
        activateUser: (dir, username) =>
            execFileSync(
                "node",
                [
                    "-e",
                    `const D=require('better-sqlite3');new D('db.sqlite').prepare('UPDATE users SET is_verified=1 WHERE username=?').run(process.argv[1])`,
                    username,
                ],
                { cwd: dir },
            ),
        readToken: (dir, email, kind) =>
            sqliteRead(
                dir,
                "db.sqlite",
                "users",
                kind === "reset" ? "reset_token" : "verify_token",
                email,
            ),
    },
    {
        id: "fastify",
        dir: "CLIuno-Fastify-template",
        start: () => ({ cmd: "node_modules/.bin/tsx", args: ["src/app.ts"] }),
        env: { PORT: String(PORT) },
        readToken: (dir, email, kind) =>
            sqliteRead(
                dir,
                "db.sqlite",
                "Users",
                kind === "reset" ? "reset_token" : "verify_token",
                email,
            ),
    },
    {
        id: "adonis",
        dir: "CLIuno-Adonis-template",
        prepare: [["node", ["ace", "migration:run", "--force"]]],
        start: () => ({ cmd: "node", args: ["ace", "serve"] }),
        env: {
            PORT: String(PORT),
            HOST: "127.0.0.1",
            LOG_LEVEL: "warn",
            TZ: "UTC",
            APP_KEY: "matrix-test-app-key-32-chars-min!",
        },
        readToken: (dir, email, kind) =>
            sqliteRead(
                dir,
                "tmp/db.sqlite3",
                "users",
                kind === "reset" ? "reset_token" : "verify_token",
                email,
            ),
    },
    {
        id: "nest",
        dir: "CLIuno-Nest-template",
        prepare: [["node_modules/.bin/nest", ["build"]]],
        start: () => ({ cmd: "node", args: ["dist/main.js"] }),
        env: { PORT: String(PORT) },
        activateUser: (dir, username) =>
            execFileSync(
                "node",
                [
                    "-e",
                    `const D=require('better-sqlite3');new D('database.sqlite').prepare('UPDATE Users SET is_verified=1 WHERE username=?').run(process.argv[1])`,
                    username,
                ],
                { cwd: dir },
            ),
        readToken: (dir, email, kind) =>
            sqliteRead(
                dir,
                "database.sqlite",
                "Users",
                kind === "reset" ? "reset_token" : "verify_token",
                email,
            ),
    },
    {
        id: "django",
        dir: "CLIuno-Django-template",
        prepare: [["uv", ["run", "python", "manage.py", "migrate", "--noinput"]]],
        start: () => ({
            cmd: "uv",
            args: ["run", "python", "manage.py", "runserver", `127.0.0.1:${PORT}`, "--noreload"],
        }),
        activateUser: (dir, username) =>
            execFileSync(
                "uv",
                [
                    "run",
                    "python",
                    "manage.py",
                    "shell",
                    "-c",
                    `from src.models import User; User.objects.filter(username='${username}').update(is_verified=True)`,
                ],
                { cwd: dir },
            ),
        readToken: (dir, email, kind) =>
            execFileSync(
                "uv",
                [
                    "run",
                    "python",
                    "manage.py",
                    "shell",
                    "-c",
                    `from src.models import User; print(User.objects.get(email='${email}').${kind === "reset" ? "reset_token" : "verify_token"} or '')`,
                ],
                { cwd: dir },
            )
                .toString()
                .trim()
                .split("\n") // the shell prints an auto-import banner first
                .pop()
                .trim(),
    },
    {
        id: "fastapi",
        dir: "CLIuno-FastAPI-template",
        prepare: [["rm", ["-f", "matrix-test.db"]]],
        env: { DATABASE_URL: "sqlite:///./matrix-test.db" },
        start: () => ({
            cmd: "uv",
            args: ["run", "uvicorn", "src.app:app", "--port", String(PORT)],
        }),
        readToken: (dir, email, kind) =>
            execFileSync(
                "uv",
                [
                    "run",
                    "python",
                    "-c",
                    `import sqlite3;r=sqlite3.connect('matrix-test.db').execute("select ${kind === "reset" ? "reset_token" : "verify_token"} from users where email=?",('${email}',)).fetchone();print((r and r[0]) or '', end='')`,
                ],
                { cwd: dir },
            )
                .toString()
                .trim(),
    },
    {
        id: "laravel",
        dir: "CLIuno-Laravel-template",
        prepare: [["php", ["artisan", "migrate", "--force"]]],
        start: () => ({
            cmd: "php",
            args: ["artisan", "serve", "--host=127.0.0.1", `--port=${PORT}`],
        }),
        readToken: (dir, email, kind) =>
            execFileSync(
                "php",
                [
                    "artisan",
                    "tinker",
                    "--execute",
                    `echo optional(App\\Models\\User::where('email','${email}')->first())->${kind === "reset" ? "reset_password_token" : "verify_token"};`,
                ],
                { cwd: dir },
            )
                .toString()
                .trim(),
    },
    {
        id: "tallstack",
        dir: "CLIuno-TallStack-template",
        prepare: [["php", ["artisan", "migrate", "--force"]]],
        start: () => ({
            cmd: "php",
            args: ["artisan", "serve", "--host=127.0.0.1", `--port=${PORT}`],
        }),
        readToken: (dir, email, kind) =>
            execFileSync(
                "php",
                [
                    "artisan",
                    "tinker",
                    "--execute",
                    `echo optional(App\\Models\\User::where('email','${email}')->first())->${kind === "reset" ? "reset_password_token" : "verify_token"};`,
                ],
                { cwd: dir },
            )
                .toString()
                .trim(),
    },
    {
        id: "aspnet",
        dir: "CLIuno-ASP.NET-template",
        prepare: [["rm", ["-f", "BackendASP.NET/db.sqlite"]]],
        start: () => ({
            cmd: `${process.env.HOME}/.dotnet/dotnet`,
            args: ["run", "--project", "BackendASP.NET"],
        }),
        env: { PORT: String(PORT) },
        readToken: (dir, email, kind) =>
            execFileSync(
                "python3",
                [
                    "-c",
                    `import sqlite3;r=sqlite3.connect('BackendASP.NET/db.sqlite').execute("select ${kind === "reset" ? "ResetToken" : "VerifyToken"} from Users where Email=?",('${email}',)).fetchone();print((r and r[0]) or '', end='')`,
                ],
                { cwd: dir },
            )
                .toString()
                .trim(),
    },
    {
        id: "spring",
        dir: "CLIuno-Spring-template",
        prepare: [
            ["rm", ["-f", "db.sqlite"]],
            ["./mvnw", ["-q", "-DskipTests", "package"]],
        ],
        start: () => ({ cmd: "java", args: ["-jar", "target/cliuno-spring-template-2.0.1.jar"] }),
        env: { PORT: String(PORT) },
        readToken: (dir, email, kind) =>
            execFileSync(
                "python3",
                [
                    "-c",
                    `import sqlite3;r=sqlite3.connect('db.sqlite').execute("select ${kind === "reset" ? "reset_token" : "verify_token"} from users where email=?",('${email}',)).fetchone();print((r and r[0]) or '', end='')`,
                ],
                { cwd: dir },
            )
                .toString()
                .trim(),
    },
    {
        id: "rails",
        dir: "CLIuno-Rails-template",
        prepare: [["bin/rails", ["db:prepare"]]],
        start: () => ({
            cmd: "bin/rails",
            args: ["server", "-b", "127.0.0.1", "-p", String(PORT)],
        }),
        readToken: (dir, email, kind) =>
            execFileSync(
                "bin/rails",
                [
                    "runner",
                    `print User.find_by(email: '${email}')&.${kind === "reset" ? "reset_password_token" : "verify_token"}`,
                ],
                { cwd: dir },
            )
                .toString()
                .trim(),
    },
    {
        // Drogon is C++; it builds and runs inside the official drogon image
        // (the host needs docker + the drogonframework/drogon:latest image).
        // Everything runs as the host user so build/ and cliuno.db stay readable.
        id: "drogon",
        dir: "CLIuno-Drogon-template",
        prepare: [
            ["docker", ["rm", "-f", "cliuno-drogon-matrix"]],
            // Clean as root first: the README's build command runs as root, so a
            // stray root-owned build/ can exist; remove it before the user-owned build.
            [
                "bash",
                ["-lc", 'docker run --rm -v "$PWD":/app -w /app drogonframework/drogon:latest rm -rf build cliuno.db'],
            ],
            [
                "bash",
                [
                    "-lc",
                    'docker run --rm --user "$(id -u):$(id -g)" -v "$PWD":/app -w /app ' +
                        "-e CC=gcc-11 -e CXX=g++-11 drogonframework/drogon:latest " +
                        'bash -lc "cmake -S . -B build -DCMAKE_BUILD_TYPE=Release && cmake --build build -j2"',
                ],
            ],
        ],
        start: () => ({
            cmd: "bash",
            args: [
                "-lc",
                'exec docker run --rm --init --user "$(id -u):$(id -g)" ' +
                    "--name cliuno-drogon-matrix " +
                    `-p 127.0.0.1:${PORT}:${PORT} -v "$PWD":/app -w /app -e PORT=${PORT} ` +
                    "drogonframework/drogon:latest ./build/cliuno_drogon",
            ],
        }),
        readToken: (dir, email, kind) =>
            execFileSync(
                "python3",
                [
                    "-c",
                    `import sqlite3,sys;c=sqlite3.connect('cliuno.db');r=c.execute("SELECT ${kind === "reset" ? "reset_token" : "verify_token"} FROM users WHERE email=?",(sys.argv[1],)).fetchone();print((r[0] if r and r[0] else ''),end='')`,
                    email,
                ],
                { cwd: dir },
            )
                .toString()
                .trim(),
    },
];

const FRONTENDS = [
    { id: "vue", dir: "CLIuno-Vue-template", globs: ["src/apis"] },
    { id: "react", dir: "CLIuno-React-template", globs: ["src/apis"] },
    { id: "solid", dir: "CLIuno-Solid-template", globs: ["src/apis"] },
    { id: "next", dir: "CLIuno-Next-template", globs: ["src/apis"] },
    { id: "svelte", dir: "CLIuno-Svelte-template", globs: ["src/lib/apis"] },
    { id: "nuxt", dir: "CLIuno-Nuxt-template", globs: ["composables"] },
    { id: "angular", dir: "CLIuno-Angular-template", globs: ["src/app/services"] },
    { id: "flutter", dir: "CLIuno-Flutter-template", globs: ["lib/apis"] },
    { id: "reactnative", dir: "CLIuno-ReactNative-template", globs: ["src/apis"] },
];

/* ------------------------------------------------- frontend extraction */

// Matches http.get('/x'), http.post(`/x/${id}`), this.http.get<T>(`/x`), ...
const CALL_RE = /\.(get|post|patch|put|delete)\s*(?:<[^>()]*>)?\(\s*[`'"]([^`'"]+)[`'"]/g;

function normalizePath(p) {
    let out = p.replace(/\$\{[^}]+\}/g, ":p");
    if (!out.startsWith("/")) out = `/${out}`;
    return out.replace(/\/+$/, "") || "/";
}

function extractEndpoints(feDir, globs) {
    const endpoints = new Map(); // "METHOD /path" -> {method, path, files:Set}
    for (const g of globs) {
        const dir = path.join(feDir, g);
        if (!existsSync(dir)) continue;
        for (const f of readdirSync(dir)) {
            if (!/\.(ts|js|mts|dart)$/.test(f) || f.endsWith(".d.ts")) continue;
            const src = readFileSync(path.join(dir, f), "utf8");
            for (const m of src.matchAll(CALL_RE)) {
                const raw = m[2];
                if (/^https?:/.test(raw)) continue; // absolute URLs are not api-base relative
                const norm = normalizePath(raw);
                // skip base-wrapper calls like `${this.base}${url}` that carry no literal segment
                if (norm.replaceAll(":p", "").replaceAll("/", "") === "") continue;
                const key = `${m[1].toUpperCase()} ${norm}`;
                if (!endpoints.has(key)) {
                    endpoints.set(key, {
                        method: m[1].toUpperCase(),
                        path: normalizePath(raw),
                        files: new Set(),
                    });
                }
                endpoints.get(key).files.add(f);
            }
        }
    }
    return endpoints;
}

/* ------------------------------------------------------- smtp sink */

// Minimal SMTP server so backends that send mail on register don't hang/fail.
function startSmtpSink(port) {
    const server = net.createServer((sock) => {
        sock.write("220 matrix-sink ESMTP\r\n");
        let inData = false;
        sock.on("data", (buf) => {
            const lines = buf.toString().split("\r\n");
            for (const line of lines) {
                if (!line) continue;
                if (inData) {
                    if (line === ".") {
                        inData = false;
                        sock.write("250 OK\r\n");
                    }
                    continue;
                }
                const cmd = line.split(" ")[0].toUpperCase();
                if (cmd === "DATA") {
                    inData = true;
                    sock.write("354 go\r\n");
                } else if (cmd === "QUIT") {
                    sock.write("221 bye\r\n");
                    sock.end();
                } else if (cmd === "EHLO" || cmd === "HELO") {
                    sock.write("250-matrix-sink\r\n250 AUTH PLAIN LOGIN\r\n");
                } else {
                    sock.write("250 OK\r\n");
                }
            }
        });
        sock.on("error", () => {});
    });
    server.on("error", () => {});
    server.listen(port, "127.0.0.1");
    return server;
}

/* ------------------------------------------------------- http helpers */

async function req(method, url, { token, body } = {}) {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), STEP_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method,
            signal: ctrl.signal,
            headers: {
                "Content-Type": "application/json",
                Accept: "application/json",
                ...(token ? { Authorization: `Bearer ${token}` } : {}),
            },
            ...(body === undefined ? {} : { body: JSON.stringify(body) }),
        });
        let json = null;
        const text = await res.text();
        try {
            json = JSON.parse(text);
        } catch {
            /* non-json body */
        }
        return { status: res.status, json, text };
    } catch (e) {
        return { status: 0, json: null, text: String(e) };
    } finally {
        clearTimeout(t);
    }
}

// Minimal TOTP (RFC 6238, sha1/6 digits/30s) so the OTP endpoints get tested end-to-end.
function base32Decode(str) {
    const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
    let bits = 0;
    let value = 0;
    const out = [];
    for (const c of str.replace(/=+$/, "").toUpperCase()) {
        const idx = alphabet.indexOf(c);
        if (idx < 0) continue;
        value = (value << 5) | idx;
        bits += 5;
        if (bits >= 8) {
            out.push((value >>> (bits - 8)) & 0xff);
            bits -= 8;
        }
    }
    return Buffer.from(out);
}

function totp(secret, now = Date.now()) {
    const counter = Buffer.alloc(8);
    counter.writeBigUInt64BE(BigInt(Math.floor(now / 1000 / 30)));
    const h = crypto.createHmac("sha1", base32Decode(secret)).update(counter).digest();
    const offset = h[h.length - 1] & 0xf;
    return String((h.readUInt32BE(offset) & 0x7fffffff) % 1_000_000).padStart(6, "0");
}

function pick(obj, paths) {
    for (const p of paths) {
        let cur = obj;
        let ok = true;
        for (const seg of p.split(".")) {
            if (cur && typeof cur === "object" && seg in cur) cur = cur[seg];
            else {
                ok = false;
                break;
            }
        }
        if (ok && cur !== undefined && cur !== null) return { path: p, value: cur };
    }
    return null;
}

/* --------------------------------------------------- canonical flow */

// Every step mirrors what the frontend API layers actually send.
async function runFlow(backend, dir) {
    const results = new Map(); // "METHOD /pattern" -> {ok, status, note}
    const ctx = {};
    const stamp = Date.now().toString(36);
    const user = (n) => ({
        first_name: "Matrix",
        last_name: `Tester${n}`,
        username: `matrix_${stamp}_${n}`,
        email: `matrix_${stamp}_${n}@example.com`,
        phone: `+1555${String(Date.now()).slice(-6)}${n}`,
        password: "Matrix#Pass123",
        password_confirmation: "Matrix#Pass123",
    });
    const u1 = user(1);
    const u2 = user(2);

    const record = (key, r, okWhen, note = "") => {
        const ok = okWhen(r);
        results.set(key, {
            ok,
            status: r.status,
            note: ok ? note : note || (r.json?.message ?? r.text?.slice(0, 120) ?? ""),
        });
        vlog(`${ok ? "✓" : "✗"} ${key} -> ${r.status} ${results.get(key).note}`);
        return ok;
    };
    const ok2xx = (r) => r.status >= 200 && r.status < 300;
    // Frontends destructure e.g. res.data.data.todos — enforce that exact nesting.
    const okShape = (p) => (r) => ok2xx(r) && !!pick(r.json ?? {}, [p]);

    // -- auth: register + activate + login (both users)
    for (const [n, u] of [
        [1, u1],
        [2, u2],
    ]) {
        const reg = await req("POST", `${BASE}/auth/register`, { body: u });
        if (n === 1) record("POST /auth/register", reg, ok2xx);
        if (backend.activateUser) {
            try {
                backend.activateUser(dir, u.username);
            } catch (e) {
                vlog(`activateUser failed: ${String(e).slice(0, 100)}`);
            }
        }
        const login = await req("POST", `${BASE}/auth/login`, {
            body: { usernameOrEmail: u.username, password: u.password },
        });
        const tok = pick(login.json ?? {}, ["data.token", "token", "data.access_token"]);
        if (n === 1) {
            // frontends read data.token specifically
            record(
                "POST /auth/login",
                login,
                (r) => ok2xx(r) && !!pick(r.json ?? {}, ["data.token"]),
                tok ? `token@${tok.path}` : "no token in response",
            );
            ctx.token = tok?.value;
            ctx.refreshToken = pick(login.json ?? {}, [
                "data.refreshToken",
                "data.refresh_token",
            ])?.value;
        } else {
            ctx.token2 = tok?.value;
        }
    }
    const T = { token: ctx.token };

    // -- token management (frontends: Bearer + {token} / {refreshToken})
    record(
        "POST /auth/check-token",
        await req("POST", `${BASE}/auth/check-token`, { ...T, body: { token: ctx.token } }),
        ok2xx,
    );
    if (ctx.refreshToken) {
        const rf = await req("POST", `${BASE}/auth/refresh-token`, {
            body: { refreshToken: ctx.refreshToken },
        });
        const rotated = pick(rf.json ?? {}, ["data.token"]);
        record(
            "POST /auth/refresh-token",
            rf,
            (r) => ok2xx(r) && !!rotated,
            rotated ? "token rotated" : "no token in response",
        );
        const nextRefresh = pick(rf.json ?? {}, ["data.refreshToken", "data.refresh_token"]);
        if (nextRefresh) ctx.refreshToken = nextRefresh.value;
    }

    // -- current user (both ids needed for follows)
    const me = await req("GET", `${BASE}/users/current`, T);
    const meId = pick(me.json ?? {}, ["data.user.id", "data.id", "user.id", "id"]);
    record("GET /users/current", me, okShape("data.user.id"), meId ? `id@${meId.path}` : "no id");
    ctx.userId = meId?.value;
    const me2 = await req("GET", `${BASE}/users/current`, { token: ctx.token2 });
    ctx.userId2 = pick(me2.json ?? {}, ["data.user.id", "data.id", "user.id", "id"])?.value;

    record(
        "PATCH /users/current",
        await req("PATCH", `${BASE}/users/current`, { ...T, body: { first_name: "Matrix" } }),
        okShape("data.user"),
    );
    record("GET /users", await req("GET", `${BASE}/users`, T), okShape("data.users"));
    if (ctx.userId) {
        record(
            "GET /users/:p",
            await req("GET", `${BASE}/users/${ctx.userId}`, T),
            okShape("data.user"),
        );
        record(
            "GET /users/username/:p",
            await req("GET", `${BASE}/users/username/${u1.username}`, T),
            okShape("data.user"),
        );
        record(
            "PATCH /users/:p",
            await req("PATCH", `${BASE}/users/${ctx.userId}`, {
                ...T,
                body: { first_name: "Matrixx" },
            }),
            (r) => ok2xx(r) || r.status === 403, // admin-gating this route is a valid contract
            "2xx or admin-gated 403",
        );
        record(
            "GET /users/:p/posts",
            await req("GET", `${BASE}/users/${ctx.userId}/posts`, T),
            okShape("data.posts"),
        );
        record(
            "GET /users/:p/roles",
            await req("GET", `${BASE}/users/${ctx.userId}/roles`, T),
            ok2xx,
        );
    }

    // -- todos
    const todoC = await req("POST", `${BASE}/todos`, {
        ...T,
        body: { title: "matrix todo", description: "made by test-matrix" },
    });
    const todoId = pick(todoC.json ?? {}, [
        "data.todo.id",
        "data.result.id",
        "data.id",
        "todo.id",
        "id",
    ]);
    record(
        "POST /todos",
        todoC,
        (r) => ok2xx(r) && !!todoId,
        todoId ? `id@${todoId.path}` : "no id",
    );
    ctx.todoId = todoId?.value;
    record("GET /todos", await req("GET", `${BASE}/todos`, T), okShape("data.todos"));
    record(
        "GET /todos/current-user",
        await req("GET", `${BASE}/todos/current-user`, T),
        okShape("data.todos"),
    );
    if (ctx.todoId) {
        record(
            "GET /todos/:p",
            await req("GET", `${BASE}/todos/${ctx.todoId}`, T),
            okShape("data.todo"),
        );
        record(
            "PATCH /todos/:p/toggle",
            await req("PATCH", `${BASE}/todos/${ctx.todoId}/toggle`, T),
            ok2xx,
        );
        record(
            "PATCH /todos/:p",
            await req("PATCH", `${BASE}/todos/${ctx.todoId}`, {
                ...T,
                body: { title: "matrix todo 2" },
            }),
            ok2xx,
        );
    }

    // -- posts + nested comments
    const postC = await req("POST", `${BASE}/posts`, {
        ...T,
        body: { title: "matrix post", content: "made by test-matrix" },
    });
    const postId = pick(postC.json ?? {}, [
        "data.post.id",
        "data.result.id",
        "data.id",
        "post.id",
        "id",
    ]);
    record(
        "POST /posts",
        postC,
        (r) => ok2xx(r) && !!postId,
        postId ? `id@${postId.path}` : "no id",
    );
    ctx.postId = postId?.value;
    record("GET /posts", await req("GET", `${BASE}/posts`, T), okShape("data.posts"));
    record(
        "GET /posts/current-user",
        await req("GET", `${BASE}/posts/current-user`, T),
        okShape("data.posts"),
    );
    if (ctx.postId) {
        record(
            "GET /posts/:p",
            await req("GET", `${BASE}/posts/${ctx.postId}`, T),
            okShape("data.post"),
        );
        record(
            "PATCH /posts/:p",
            await req("PATCH", `${BASE}/posts/${ctx.postId}`, {
                ...T,
                body: { title: "matrix post 2" },
            }),
            ok2xx,
        );
        record(
            "GET /posts/:p/user",
            await req("GET", `${BASE}/posts/${ctx.postId}/user`, T),
            okShape("data.user"),
        );
        const comC = await req("POST", `${BASE}/posts/${ctx.postId}/comments`, {
            ...T,
            body: { content: "matrix comment" },
        });
        const comId = pick(comC.json ?? {}, ["data.comment.id", "data.id", "comment.id", "id"]);
        record("POST /posts/:p/comments", comC, (r) => ok2xx(r) && !!comId);
        record(
            "GET /posts/:p/comments",
            await req("GET", `${BASE}/posts/${ctx.postId}/comments`, T),
            ok2xx,
        );
        if (comId?.value) {
            record(
                "PATCH /posts/:p/comments/:p",
                await req("PATCH", `${BASE}/posts/${ctx.postId}/comments/${comId.value}`, {
                    ...T,
                    body: { content: "matrix comment 2" },
                }),
                ok2xx,
            );
            record(
                "DELETE /posts/:p/comments/:p",
                await req("DELETE", `${BASE}/posts/${ctx.postId}/comments/${comId.value}`, T),
                ok2xx,
            );
        }
    }

    // -- follows (user1 follows user2)
    if (ctx.userId2) {
        record(
            "POST /follows/:p/follow",
            await req("POST", `${BASE}/follows/${ctx.userId2}/follow`, T),
            ok2xx,
        );
        record(
            "GET /follows/:p/followers",
            await req("GET", `${BASE}/follows/${ctx.userId2}/followers`, T),
            okShape("data.followers"),
        );
        record(
            "GET /follows/:p/following",
            await req("GET", `${BASE}/follows/${ctx.userId}/following`, T),
            okShape("data.following"),
        );
        record(
            "GET /follows/:p/is-following",
            await req("GET", `${BASE}/follows/${ctx.userId2}/is-following`, T),
            okShape("data.isFollowing"),
        );
        record(
            "DELETE /follows/:p/follow",
            await req("DELETE", `${BASE}/follows/${ctx.userId2}/follow`, T),
            ok2xx,
        );
    }

    // -- auth feature endpoints (frontends: {email}, auth'd OTP with {otp})
    // Re-login and roll the working credentials after a password change.
    const relogin = async () => {
        const rl = await req("POST", `${BASE}/auth/login`, {
            body: { usernameOrEmail: u1.username, password: u1.password },
        });
        const t = pick(rl.json ?? {}, ["data.token"]);
        if (!t) return false;
        ctx.token = t.value;
        T.token = t.value;
        const r2 = pick(rl.json ?? {}, ["data.refreshToken", "data.refresh_token"]);
        if (r2) ctx.refreshToken = r2.value;
        return true;
    };
    const readToken = (kind) => {
        if (!backend.readToken) return "";
        try {
            return backend.readToken(dir, u1.email, kind) || "";
        } catch (e) {
            vlog(`readToken(${kind}) failed: ${String(e).slice(0, 100)}`);
            return "";
        }
    };

    record(
        "POST /auth/forgot-password",
        await req("POST", `${BASE}/auth/forgot-password`, { body: { email: u1.email } }),
        ok2xx,
    );
    const resetToken = readToken("reset");
    if (resetToken) {
        const rp = await req("POST", `${BASE}/auth/reset-password`, {
            body: { password: "Matrix#Reset456", token: resetToken },
        });
        let rpOk = ok2xx(rp);
        if (rpOk) {
            u1.password = "Matrix#Reset456";
            rpOk = await relogin();
        }
        record(
            "POST /auth/reset-password",
            rp,
            () => rpOk,
            rpOk ? "reset + re-login ok" : "reset or re-login failed",
        );
    }

    record(
        "POST /auth/send-verify-email",
        await req("POST", `${BASE}/auth/send-verify-email`, T),
        ok2xx,
    );
    const verifyToken = readToken("verify");
    if (verifyToken) {
        record(
            "POST /auth/verify-email",
            await req("POST", `${BASE}/auth/verify-email`, { body: { token: verifyToken } }),
            ok2xx,
        );
    }
    const gen = await req("POST", `${BASE}/auth/otp/generate`, T);
    let secret = pick(gen.json ?? {}, ["data.secret", "data.otp_secret", "data.base32", "secret"]);
    if (!secret) {
        const uri = pick(gen.json ?? {}, [
            "data.otpauth_url",
            "data.provisioning_uri",
            "data.url",
            "data.uri",
        ]);
        const m = uri && String(uri.value).match(/[?&]secret=([A-Z2-7]+)/i);
        if (m) secret = { path: "otpauth-uri", value: m[1] };
    }
    record(
        "POST /auth/otp/generate",
        gen,
        (r) => ok2xx(r) && !!secret,
        secret ? `secret@${secret.path}` : "no otp secret in response",
    );
    if (secret) {
        record(
            "POST /auth/otp/verify",
            await req("POST", `${BASE}/auth/otp/verify`, {
                ...T,
                body: { otp: totp(secret.value) },
            }),
            ok2xx,
        );
        record(
            "POST /auth/otp/validate",
            await req("POST", `${BASE}/auth/otp/validate`, {
                ...T,
                body: { otp: totp(secret.value) },
            }),
            ok2xx,
        );
        record("POST /auth/otp/disable", await req("POST", `${BASE}/auth/otp/disable`, T), ok2xx);
    }

    // -- change password (frontends: Bearer + {oldPassword, newPassword})
    const cp = await req("POST", `${BASE}/auth/change-password`, {
        ...T,
        body: { oldPassword: u1.password, newPassword: "Matrix#Change789" },
    });
    let cpOk = ok2xx(cp);
    if (cpOk) {
        u1.password = "Matrix#Change789";
        cpOk = await relogin();
    }
    record(
        "POST /auth/change-password",
        cp,
        () => cpOk,
        cpOk ? "changed + re-login ok" : "change or re-login failed",
    );

    // -- admin-gated user delete (a valid contract is 2xx or 403 for non-admins)
    if (ctx.userId2) {
        record(
            "DELETE /users/:p",
            await req("DELETE", `${BASE}/users/${ctx.userId2}`, T),
            (r) => ok2xx(r) || r.status === 403,
            "2xx or admin-gated 403",
        );
    }

    // -- cleanup + logout
    if (ctx.todoId)
        record("DELETE /todos/:p", await req("DELETE", `${BASE}/todos/${ctx.todoId}`, T), ok2xx);
    if (ctx.postId)
        record("DELETE /posts/:p", await req("DELETE", `${BASE}/posts/${ctx.postId}`, T), ok2xx);
    record("POST /auth/logout", await req("POST", `${BASE}/auth/logout`, T), ok2xx);

    return { results, ctx };
}

/* ------------------------------------------------- existence probing */

// For endpoints outside the canonical flow: probe WITHOUT auth.
// 404/405 => route missing. Anything else (401/403/400/422/200...) => exists.
async function probe(method, pattern, ctx) {
    const url = `${BASE}${pattern
        .replace("/users/:p", `/users/${ctx.userId ?? "00000000-0000-4000-8000-000000000000"}`)
        .replaceAll(":p", "00000000-0000-4000-8000-000000000000")}`;
    const r = await req(method, url, {
        body: ["POST", "PATCH", "PUT"].includes(method) ? {} : undefined,
    });
    if (r.status === 0) return { exists: false, status: 0, note: "no response" };
    if (r.status === 404 || r.status === 405)
        return { exists: false, status: r.status, note: "not found" };
    return { exists: true, status: r.status, note: "exists (probe)" };
}

/* --------------------------------------------------- process control */

function spawnServer(dir, { cmd, args }, extraEnv) {
    const env = { ...process.env, ...testEnvBase, ...extraEnv };
    delete env.VIRTUAL_ENV; // avoid uv picking up an unrelated active venv
    const child = spawn(cmd, args, {
        cwd: dir,
        env,
        detached: true,
        stdio: ["ignore", "pipe", "pipe"],
    });
    let out = "";
    child.stdout.on("data", (d) => {
        out += d;
        if (VERBOSE) process.stdout.write(`      ${d}`.slice(0, 400));
    });
    child.stderr.on("data", (d) => {
        out += d;
        if (VERBOSE) process.stdout.write(`      ${d}`.slice(0, 400));
    });
    return { child, getOutput: () => out };
}

async function waitForServer(child) {
    const start = Date.now();
    while (Date.now() - start < BOOT_TIMEOUT_MS) {
        if (child.exitCode !== null) return false;
        const r = await req("GET", `http://127.0.0.1:${PORT}/`);
        if (r.status !== 0) return true;
        await new Promise((r2) => setTimeout(r2, 500));
    }
    return false;
}

function killServer(child) {
    if (child.exitCode !== null) return Promise.resolve();
    return new Promise((resolve) => {
        const done = () => resolve();
        child.once("exit", done);
        try {
            process.kill(-child.pid, "SIGTERM");
        } catch {
            try {
                child.kill("SIGTERM");
            } catch {
                /* already gone */
            }
        }
        setTimeout(() => {
            try {
                process.kill(-child.pid, "SIGKILL");
            } catch {
                /* already gone */
            }
            setTimeout(done, 300);
        }, 4000);
    });
}

/* -------------------------------------------------------------- main */

async function main() {
    const backends = BACKENDS.filter((b) => !onlyBackends || onlyBackends.includes(b.id));
    const frontends = FRONTENDS.filter((f) => !onlyFrontends || onlyFrontends.includes(f.id));

    log(`\nCLIuno matrix: ${frontends.length} frontends x ${backends.length} backends`);
    log(`templates root: ${ROOT}\n`);

    // 1. extract every frontend's endpoint expectations
    const feEndpoints = new Map();
    for (const fe of frontends) {
        const dir = path.join(ROOT, fe.dir);
        const eps = extractEndpoints(dir, fe.globs);
        feEndpoints.set(fe.id, eps);
        log(`  ${fe.id.padEnd(8)} expects ${eps.size} endpoints`);
    }

    const smtp = startSmtpSink(SMTP_PORT);
    const report = { date: new Date().toISOString(), backends: {}, matrix: {} };

    // 2. per backend: boot, flow, probe the union of frontend endpoints
    for (const be of backends) {
        const dir = path.join(ROOT, be.dir);
        log(`\n━━ backend: ${be.id} ${"━".repeat(50 - be.id.length)}`);
        if (!existsSync(dir)) {
            log(`  SKIP - missing dir ${dir}`);
            continue;
        }

        for (const [cmd, cargs] of be.prepare ?? []) {
            try {
                vlog(`prepare: ${cmd} ${cargs.join(" ")}`);
                execFileSync(cmd, cargs, {
                    cwd: dir,
                    env: { ...process.env, ...testEnvBase, ...be.env },
                    stdio: VERBOSE ? "inherit" : "pipe",
                });
            } catch (e) {
                log(`  prepare failed: ${String(e).slice(0, 200)}`);
            }
        }

        const { child, getOutput } = spawnServer(dir, be.start(), be.env);
        const up = await waitForServer(child);
        if (!up) {
            log(`  BOOT FAILED (${be.id}) - last output:\n${getOutput().slice(-800)}`);
            report.backends[be.id] = { boot: false };
            await killServer(child);
            continue;
        }
        log(`  up on :${PORT} - running canonical flow`);

        const { results, ctx } = await runFlow(be, dir);

        // probe endpoints any frontend uses that the flow didn't cover
        const probed = new Map();
        for (const eps of feEndpoints.values()) {
            for (const [key, ep] of eps) {
                if (results.has(key) || probed.has(key)) continue;
                probed.set(key, await probe(ep.method, ep.path, ctx));
            }
        }

        await killServer(child);

        const flowPass = [...results.values()].filter((r) => r.ok).length;
        log(`  flow: ${flowPass}/${results.size} steps passed`);
        report.backends[be.id] = {
            boot: true,
            flow: Object.fromEntries([...results].map(([k, v]) => [k, v])),
            probes: Object.fromEntries([...probed].map(([k, v]) => [k, v])),
        };

        // 3. grade each frontend cell against this backend
        for (const fe of frontends) {
            const eps = feEndpoints.get(fe.id);
            const missing = [];
            const failed = [];
            const untested = [];
            for (const [key] of eps) {
                if (results.has(key)) {
                    if (!results.get(key).ok) failed.push(key);
                } else if (probed.has(key)) {
                    const p = probed.get(key);
                    if (!p.exists) missing.push(key);
                    else untested.push(key);
                }
            }
            const status =
                missing.length || failed.length ? "FAIL" : untested.length ? "WARN" : "PASS";
            report.matrix[`${fe.id}|${be.id}`] = { status, missing, failed, untested };
        }
    }

    smtp.close();

    // 4. render the matrix
    log(`\n${"".padEnd(10)}${backends.map((b) => b.id.padEnd(10)).join("")}`);
    for (const fe of frontends) {
        let row = fe.id.padEnd(10);
        for (const be of backends) {
            const cell = report.matrix[`${fe.id}|${be.id}`];
            const mark = !report.backends[be.id]?.boot
                ? "BOOT✗"
                : cell.status === "PASS"
                  ? "PASS"
                  : cell.status === "WARN"
                    ? `WARN(${cell.untested.length})`
                    : `FAIL(${cell.missing.length + cell.failed.length})`;
            row += mark.padEnd(10);
        }
        log(row);
    }

    // 5. details for failures
    for (const [pair, cell] of Object.entries(report.matrix)) {
        if (cell.status !== "FAIL") continue;
        log(`\n✗ ${pair}`);
        for (const k of cell.missing.slice(0, 8)) log(`    missing: ${k}`);
        for (const k of cell.failed.slice(0, 8)) {
            const be = pair.split("|")[1];
            const r = report.backends[be]?.flow?.[k];
            log(`    failed:  ${k} -> ${r?.status} ${r?.note ?? ""}`);
        }
        const more = cell.missing.length + cell.failed.length - 16;
        if (more > 0) log(`    ... and ${more} more`);
    }

    writeFileSync(OUT, JSON.stringify(report, null, 2));
    log(`\nreport: ${OUT}`);

    const anyFail = Object.values(report.matrix).some((c) => c.status === "FAIL");
    const anyBootFail = Object.values(report.backends).some((b) => !b.boot);
    process.exit(anyFail || anyBootFail ? 1 : 0);
}

main().catch((e) => {
    console.error(e);
    process.exit(1);
});
