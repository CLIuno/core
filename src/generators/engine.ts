import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import type { Command, Ctx, Generator, Kind, NativeCall, Patch, Plan } from "./types";

export interface Io {
    exists: (file: string) => boolean;
    read: (file: string) => string;
    write: (file: string, content: string) => void;
    which: (bin: string, cwd: string) => boolean;
    run: (call: NativeCall, cwd: string) => number;
}

export const realIo: Io = {
    exists: (file) => fs.existsSync(file),
    read: (file) => fs.readFileSync(file, "utf8"),
    write: (file, content) => {
        fs.mkdirSync(path.dirname(file), { recursive: true });
        fs.writeFileSync(file, content);
    },
    which: (bin, cwd) => {
        if (bin.includes("/") || bin.includes("\\")) return fs.existsSync(path.resolve(cwd, bin));
        const result = spawnSync(process.platform === "win32" ? "where" : "which", [bin], {
            stdio: "ignore",
        });
        return result.status === 0;
    },
    run: (call, cwd) => {
        // .cmd shims (npx, node_modules/.bin/*) need a shell on Windows; quote every argument for cmd.exe.
        const windows = process.platform === "win32";
        const result = windows
            ? spawnSync([call.bin, ...call.args].map(quoteForCmd).join(" "), {
                  cwd,
                  stdio: call.quiet ? "ignore" : "inherit",
                  shell: true,
              })
            : spawnSync(call.bin, call.args, { cwd, stdio: call.quiet ? "ignore" : "inherit" });
        return result.status ?? 1;
    },
};

/** Quote one argument for cmd.exe so spaces and metacharacters are passed through literally. */
export function quoteForCmd(arg: string): string {
    if (arg === "") return '""';
    if (!/[\s"&|<>^%()!,;=]/.test(arg)) return arg;
    return `"${arg.replace(/"/g, '""')}"`;
}

export class UnsupportedKindError extends Error {
    constructor(
        public readonly gen: Generator,
        public readonly kind: Kind,
    ) {
        super(
            `${gen.label} has no "make:${kind}" generator. Available: ${Object.keys(gen.commands).join(", ")}.`,
        );
    }
}

function command(gen: Generator, kind: Kind): Command {
    const cmd = gen.commands[kind];
    if (!cmd) throw new UnsupportedKindError(gen, kind);
    return cmd;
}

/** Decide between native delegation and stub rendering, then collect everything the command would do. */
export function plan(gen: Generator, kind: Kind, ctx: Ctx, io: Io = realIo): Plan {
    const cmd = command(gen, kind);
    const nativeCalls = cmd.native?.(ctx) ?? [];
    const canDelegate =
        nativeCalls.length > 0 && nativeCalls.every((c) => io.which(c.bin, ctx.cwd));
    const result: Plan = { native: [], files: [], patches: [], notes: cmd.notes?.(ctx) ?? [] };

    if (canDelegate) {
        result.native = nativeCalls;
        return result;
    }
    if (!cmd.files && !cmd.patches) {
        const needed = [...new Set(nativeCalls.map((c) => c.bin))].join(", ");
        throw new Error(
            `"make:${kind}" for ${gen.label} delegates to "${needed}", which was not found on PATH.`,
        );
    }
    if (nativeCalls.length > 0) {
        result.notes.unshift(
            `Native CLI (${nativeCalls[0]!.bin}) not found — rendered CLIuno stubs instead.`,
        );
    }
    result.files = cmd.files?.(ctx) ?? [];
    result.patches = cmd.patches?.(ctx) ?? [];
    return result;
}

export function applyPatch(
    source: string,
    patch: Patch,
): { text: string; status: "applied" | "skipped" | "anchor-missing" } {
    if (patch.skipIf && source.includes(patch.skipIf)) return { text: source, status: "skipped" };
    const anchor = patch.anchor;
    let index = -1;
    let length = 0;
    if (typeof anchor === "string") {
        index = patch.where === "after" ? source.lastIndexOf(anchor) : source.indexOf(anchor);
        length = anchor.length;
    } else {
        const flags = anchor.flags.includes("g") ? anchor.flags : `${anchor.flags}g`;
        const re = new RegExp(anchor.source, flags);
        let match: RegExpExecArray | null;
        let last: RegExpExecArray | null = null;
        while ((match = re.exec(source)) !== null) {
            last = match;
            if (patch.where === "before") break;
            if (match[0].length === 0) re.lastIndex++;
        }
        if (last) {
            index = last.index;
            length = last[0].length;
        }
    }
    if (index === -1) return { text: source, status: "anchor-missing" };
    if (patch.replace) {
        const matched = source.slice(index, index + length);
        const replaced = patch.replace(matched);
        if (replaced === matched) return { text: source, status: "skipped" };
        return {
            text: source.slice(0, index) + replaced + source.slice(index + length),
            status: "applied",
        };
    }
    const at = patch.where === "after" ? index + length : index;
    return { text: source.slice(0, at) + patch.insert + source.slice(at), status: "applied" };
}

export interface ApplyResult {
    written: string[];
    skipped: string[];
    patched: string[];
    notes: string[];
    nativeExit?: number;
    formatted?: boolean;
}

export async function apply(
    p: Plan,
    ctx: Ctx,
    io: Io = realIo,
    gen?: Generator,
): Promise<ApplyResult> {
    const result: ApplyResult = { written: [], skipped: [], patched: [], notes: [...p.notes] };

    if (p.native.length > 0) {
        if (ctx.dryRun) {
            result.notes.push(...p.native.map((c) => `would run: ${c.bin} ${c.args.join(" ")}`));
            return result;
        }
        for (const call of p.native) {
            const code = io.run(call, ctx.cwd);
            if (code !== 0) {
                result.nativeExit = code;
                return result;
            }
        }
        result.nativeExit = 0;
        return result;
    }

    for (const file of p.files) {
        const abs = path.join(ctx.cwd, file.path);
        if (io.exists(abs) && !ctx.force) {
            result.skipped.push(file.path);
            continue;
        }
        if (!ctx.dryRun) io.write(abs, file.content);
        result.written.push(file.path);
    }

    for (const patch of p.patches) {
        const abs = path.join(ctx.cwd, patch.path);
        if (!io.exists(abs)) {
            result.notes.push(
                `${patch.path} not found — ${patch.describe} by hand: ${patch.insert.trim()}`,
            );
            continue;
        }
        const { text, status } = applyPatch(io.read(abs), patch);
        if (status === "applied") {
            if (!ctx.dryRun) io.write(abs, text);
            result.patched.push(patch.path);
        } else if (status === "anchor-missing") {
            result.notes.push(
                `Could not find where to ${patch.describe} in ${patch.path} — add by hand: ${patch.insert.trim()}`,
            );
        }
    }

    const touched = [...result.written, ...result.patched];
    if (gen?.format && touched.length > 0 && !ctx.dryRun) {
        const call = gen.format(touched);
        if (io.which(call.bin, ctx.cwd)) {
            const code = io.run({ ...call, args: call.args }, ctx.cwd);
            if (code !== 0)
                result.notes.push(`formatter ${call.bin} exited ${code} — run it by hand.`);
            else result.formatted = true;
        }
    }
    return result;
}
