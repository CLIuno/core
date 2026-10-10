import type { NativeCall } from "../types";

/** oxfmt from the project's node_modules — every JS/TS CLIuno template ships it. */
export function oxfmt(files: string[]): NativeCall {
    return { bin: "node_modules/.bin/oxfmt", args: files, quiet: true };
}

/** ruff via uv (Django / FastAPI templates). */
export function ruffFormat(files: string[]): NativeCall {
    return { bin: "uv", args: ["run", "ruff", "format", ...files], quiet: true };
}

/** Laravel Pint (Laravel / TallStack templates). */
export function pint(files: string[]): NativeCall {
    return { bin: "vendor/bin/pint", args: files, quiet: true };
}
