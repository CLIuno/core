export interface ParsedArgv {
    command: "scaffold" | "make" | "skills" | "doctor" | "help" | "version";
    kind?: string;
    name?: string;
    sub?: string;
    flags: Record<string, string | boolean>;
    positional: string[];
}

const BOOLEAN_FLAGS = new Set([
    "force",
    "dry-run",
    "global",
    "help",
    "h",
    "version",
    "v",
    "doctor",
]);

function flagName(raw: string): string {
    return raw.replace(/^--?/, "");
}

export function parseArgv(argv: string[]): ParsedArgv {
    const flags: Record<string, string | boolean> = {};
    const positional: string[] = [];

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i] as string;
        if (!arg.startsWith("-")) {
            positional.push(arg);
            continue;
        }
        const eq = arg.indexOf("=");
        if (eq !== -1) {
            flags[flagName(arg.slice(0, eq))] = arg.slice(eq + 1);
            continue;
        }
        const name = flagName(arg);
        const next = argv[i + 1];
        if (BOOLEAN_FLAGS.has(name) || next === undefined || next.startsWith("-")) {
            flags[name] = true;
        } else {
            flags[name] = next;
            i++;
        }
    }

    const first = positional[0];
    if (flags.help || flags.h) return { command: "help", flags, positional };
    if (flags.version || flags.v) return { command: "version", flags, positional };
    if (flags.doctor) return { command: "doctor", flags, positional };

    if (first === "make" || first?.startsWith("make:")) {
        const kind = first === "make" ? undefined : first.slice("make:".length);
        return {
            command: "make",
            kind,
            name: positional[1],
            flags,
            positional: positional.slice(2),
        };
    }
    if (first === "skills") {
        return { command: "skills", sub: positional[1], flags, positional: positional.slice(2) };
    }
    return { command: "scaffold", flags, positional };
}

export function flagString(
    flags: Record<string, string | boolean>,
    name: string,
): string | undefined {
    const value = flags[name];
    return typeof value === "string" ? value : undefined;
}

export function flagBool(flags: Record<string, string | boolean>, name: string): boolean {
    return flags[name] === true || flags[name] === "true";
}
