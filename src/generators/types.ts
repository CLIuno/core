import type { Field } from "./fields";
import type { Names } from "./names";
import type { StackId } from "./detect";

export const KINDS = [
    "resource",
    "controller",
    "model",
    "migration",
    "service",
    "validator",
    "request",
    "dto",
    "test",
    "api",
    "store",
    "page",
    "component",
] as const;
export type Kind = (typeof KINDS)[number];

export interface Ctx {
    cwd: string;
    names: Names;
    fields: Field[];
    force: boolean;
    dryRun: boolean;
}

export interface FileSpec {
    /** Relative to the stack root. */
    path: string;
    content: string;
}

export interface Patch {
    path: string;
    anchor: string | RegExp;
    insert: string;
    where: "before" | "after";
    /** When this text is already in the file the patch is skipped (idempotency). */
    skipIf: string;
    /** Rewrite the matched anchor text instead of inserting next to it (`insert` is then only shown in notes). */
    replace?: (matched: string) => string;
    describe: string;
}

export interface NativeCall {
    bin: string;
    args: string[];
    /** Hide the command's output (formatters). */
    quiet?: boolean;
}

export interface Command {
    describe: string;
    /** Delegate to the framework's own CLI when its binary resolves. */
    native?: (ctx: Ctx) => NativeCall[];
    files?: (ctx: Ctx) => FileSpec[];
    patches?: (ctx: Ctx) => Patch[];
    notes?: (ctx: Ctx) => string[];
}

export interface Generator {
    id: StackId;
    label: string;
    kind: "backend" | "frontend" | "mobile";
    commands: Partial<Record<Kind, Command>>;
    /** Optional formatter run on the files just written (only when its binary exists in the project). */
    format?: (files: string[]) => NativeCall;
}

export interface Plan {
    native: NativeCall[];
    files: FileSpec[];
    patches: Patch[];
    notes: string[];
}
