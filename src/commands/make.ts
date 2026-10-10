import chalk from "chalk";
import { detectStack, PROBES } from "../generators/detect";
import { generators } from "../generators/stacks";
import { buildNames } from "../generators/names";
import { parseFields, FIELD_TYPES } from "../generators/fields";
import { apply, plan, UnsupportedKindError } from "../generators/engine";
import { KINDS, type Ctx, type Kind } from "../generators/types";
import { flagBool, flagString, type ParsedArgv } from "../cli/argv";

export const MAKE_USAGE = `
Usage: cliuno make                         list generators for the detected stack
       cliuno make:<kind> <Name> [options]

Kinds:   ${KINDS.join(", ")}
Options:
  --fields a:string,b:int?   fields for the resource (types: ${FIELD_TYPES.join(", ")}; "?" = nullable)
                             default: title:string,description:text?
  --dry-run                  print what would be written, write nothing
  --force                    overwrite files that already exist

Examples:
  cliuno make:resource Product --fields name:string,price:number,inStock:boolean
  cliuno make:controller Invoice --dry-run
`;

function printPlan(label: string, kind: Kind, p: ReturnType<typeof plan>) {
    console.log(chalk.blue(`cliuno make:${kind}`) + chalk.gray(` (${label})`));
    for (const call of p.native)
        console.log(chalk.yellow(`  $ ${call.bin} ${call.args.join(" ")}`));
    for (const file of p.files) {
        console.log(chalk.green(`  + ${file.path}`));
        console.log(file.content.replace(/^/gm, "    "));
    }
    for (const patch of p.patches) {
        console.log(chalk.cyan(`  ~ ${patch.path}: ${patch.describe}`));
        console.log(patch.insert.replace(/^/gm, "    "));
    }
}

export async function runMake(parsed: ParsedArgv, cwd = process.cwd()): Promise<number> {
    const detection = detectStack(cwd);
    if (!detection) {
        console.error(
            chalk.red(
                "Could not detect a CLIuno stack here. Run this inside a scaffolded project.",
            ),
        );
        console.error(chalk.gray("Probes, in order:"));
        for (const probe of PROBES)
            console.error(chalk.gray(`  ${probe.stack.padEnd(12)} ${probe.describe}`));
        return 1;
    }
    const gen = generators[detection.stack];
    const kinds = Object.keys(gen.commands) as Kind[];

    if (!parsed.kind) {
        console.log(chalk.blue(`${gen.label}`) + chalk.gray(` (${detection.root})`));
        if (kinds.length === 0) {
            console.log(chalk.yellow("  no generators for this stack yet"));
            return 0;
        }
        for (const kind of kinds) {
            const cmd = gen.commands[kind]!;
            const native = cmd.native
                ? chalk.gray(` [native: ${cmd.native(demoCtx(detection.root))[0]?.bin}]`)
                : "";
            console.log(`  make:${kind.padEnd(11)} ${cmd.describe}${native}`);
        }
        console.log(MAKE_USAGE);
        return 0;
    }

    if (!(KINDS as readonly string[]).includes(parsed.kind)) {
        console.error(
            chalk.red(`Unknown generator "make:${parsed.kind}".`) + ` Kinds: ${KINDS.join(", ")}`,
        );
        return 1;
    }
    if (!parsed.name) {
        console.error(
            chalk.red(`make:${parsed.kind} needs a name, e.g. cliuno make:${parsed.kind} Product`),
        );
        return 1;
    }

    let ctx: Ctx;
    try {
        ctx = {
            cwd: detection.root,
            names: buildNames(parsed.name),
            fields: parseFields(flagString(parsed.flags, "fields")),
            force: flagBool(parsed.flags, "force"),
            dryRun: flagBool(parsed.flags, "dry-run"),
        };
    } catch (error) {
        console.error(chalk.red((error as Error).message));
        return 1;
    }

    let p;
    try {
        p = plan(gen, parsed.kind as Kind, ctx);
    } catch (error) {
        if (error instanceof UnsupportedKindError) {
            console.error(chalk.red(error.message));
            return 1;
        }
        console.error(chalk.red((error as Error).message));
        return 1;
    }

    if (ctx.dryRun) printPlan(gen.label, parsed.kind as Kind, p);

    const result = await apply(p, ctx, undefined, gen);
    if (result.nativeExit !== undefined) {
        if (result.nativeExit !== 0)
            console.error(chalk.red(`native command failed (exit ${result.nativeExit})`));
        for (const note of result.notes) console.log(chalk.gray(`  ${note}`));
        return result.nativeExit;
    }

    if (!ctx.dryRun) {
        for (const file of result.written) console.log(chalk.green(`  + ${file}`));
        for (const file of result.patched) console.log(chalk.cyan(`  ~ ${file}`));
    }
    for (const file of result.skipped)
        console.log(chalk.yellow(`  = ${file} exists (use --force to overwrite)`));
    if (result.formatted) console.log(chalk.gray("  ✓ formatted"));
    for (const note of result.notes) console.log(chalk.gray(`  ! ${note}`));
    if (result.written.length === 0 && result.patched.length === 0 && result.skipped.length > 0)
        return 1;
    return 0;
}

function demoCtx(cwd: string): Ctx {
    return {
        cwd,
        names: buildNames("example"),
        fields: parseFields(undefined),
        force: false,
        dryRun: true,
    };
}
