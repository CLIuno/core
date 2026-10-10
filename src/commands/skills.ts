import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import { flagBool, type ParsedArgv } from "../cli/argv";
import { packagedSkillsDir } from "../skills/locate";

export interface SkillStatus {
    name: string;
    packaged: string;
    project?: string;
    user?: string;
    state: "missing" | "installed" | "outdated" | "modified";
}

export const SKILLS_USAGE = `
Usage: cliuno skills status              show which CLIuno skills are installed (project + user scope)
       cliuno skills install [options]   copy the skills into ./.claude/skills/

Options:
  --global   install into ~/.claude/skills/ instead of the current project
  --force    overwrite skills that were modified locally
`;

function listSkills(dir: string): string[] {
    if (!fs.existsSync(dir)) return [];
    return fs
        .readdirSync(dir, { withFileTypes: true })
        .filter(
            (e) =>
                (e.isDirectory() || e.isSymbolicLink()) &&
                fs.existsSync(path.join(dir, e.name, "SKILL.md")),
        )
        .map((e) => e.name)
        .sort();
}

export function skillVersion(skillDir: string): string {
    const text = fs.readFileSync(path.join(skillDir, "SKILL.md"), "utf8");
    const match = text.match(/^\s*version:\s*["']?([\w.-]+)["']?\s*$/m);
    return match?.[1] ?? "0.0.0";
}

function compareVersions(a: string, b: string): number {
    const pa = a.split(".").map((n) => Number.parseInt(n, 10) || 0);
    const pb = b.split(".").map((n) => Number.parseInt(n, 10) || 0);
    for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d;
    }
    return 0;
}

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out.sort();
}

function sameContent(a: string, b: string): boolean {
    const fa = walk(a).map((f) => path.relative(a, f));
    const fb = walk(b).map((f) => path.relative(b, f));
    if (fa.join("\n") !== fb.join("\n")) return false;
    return fa.every(
        (rel) =>
            fs.readFileSync(path.join(a, rel), "utf8") ===
            fs.readFileSync(path.join(b, rel), "utf8"),
    );
}

function stateOf(packaged: string, installed: string | undefined): SkillStatus["state"] {
    if (!installed) return "missing";
    const cmp = compareVersions(skillVersion(installed), skillVersion(packaged));
    if (cmp < 0) return "outdated";
    if (sameContent(packaged, installed)) return "installed";
    return "modified";
}

export function skillsStatus(opts: { cwd: string; home: string; packaged: string }): SkillStatus[] {
    const projectDir = path.join(opts.cwd, ".claude", "skills");
    const userDir = path.join(opts.home, ".claude", "skills");
    return listSkills(opts.packaged).map((name) => {
        const packaged = path.join(opts.packaged, name);
        const project = fs.existsSync(path.join(projectDir, name, "SKILL.md"))
            ? path.join(projectDir, name)
            : undefined;
        const user = fs.existsSync(path.join(userDir, name, "SKILL.md"))
            ? path.join(userDir, name)
            : undefined;
        const states = [project, user].filter(Boolean).map((dir) => stateOf(packaged, dir));
        let state: SkillStatus["state"] = "missing";
        if (states.includes("installed")) state = "installed";
        else if (states.includes("modified")) state = "modified";
        else if (states.includes("outdated")) state = "outdated";
        return { name, packaged, project, user, state };
    });
}

function copyDir(from: string, to: string) {
    fs.rmSync(to, { recursive: true, force: true });
    fs.mkdirSync(to, { recursive: true });
    fs.cpSync(from, to, { recursive: true });
}

export function installSkills(opts: {
    cwd: string;
    home: string;
    packaged: string;
    global: boolean;
    force: boolean;
}): {
    installed: string[];
    skipped: string[];
    target: string;
} {
    const target = path.join(opts.global ? opts.home : opts.cwd, ".claude", "skills");
    const installed: string[] = [];
    const skipped: string[] = [];
    for (const name of listSkills(opts.packaged)) {
        const from = path.join(opts.packaged, name);
        const to = path.join(target, name);
        const state = stateOf(from, fs.existsSync(path.join(to, "SKILL.md")) ? to : undefined);
        if (state === "installed" || (state === "modified" && !opts.force)) {
            skipped.push(name);
            continue;
        }
        copyDir(from, to);
        installed.push(name);
    }
    return { installed, skipped, target };
}

/** True when the cwd looks like an AI-agent-aware project but has none of the CLIuno skills. */
export function shouldHintSkills(cwd: string, home = os.homedir()): boolean {
    const agentAware =
        fs.existsSync(path.join(cwd, "CLAUDE.md")) || fs.existsSync(path.join(cwd, ".claude"));
    if (!agentAware) return false;
    try {
        return skillsStatus({ cwd, home, packaged: packagedSkillsDir() }).every(
            (s) => s.state === "missing",
        );
    } catch {
        return false;
    }
}

export async function runSkills(
    parsed: ParsedArgv,
    cwd = process.cwd(),
    home = os.homedir(),
): Promise<number> {
    const packaged = packagedSkillsDir();
    const sub = parsed.sub ?? "status";

    if (sub === "status") {
        const statuses = skillsStatus({ cwd, home, packaged });
        for (const s of statuses) {
            const icon =
                s.state === "installed"
                    ? chalk.green("✔")
                    : s.state === "missing"
                      ? chalk.red("✘")
                      : chalk.yellow("!");
            const where =
                [s.project && "project", s.user && "user"].filter(Boolean).join(" + ") || "-";
            console.log(`${icon} ${s.name.padEnd(16)} ${s.state.padEnd(10)} ${chalk.gray(where)}`);
        }
        if (statuses.some((s) => s.state !== "installed")) {
            console.log(
                chalk.gray("\nInstall or refresh with: cliuno skills install [--global] [--force]"),
            );
            return statuses.every((s) => s.state === "missing") ? 2 : 0;
        }
        return 0;
    }

    if (sub === "install") {
        const result = installSkills({
            cwd,
            home,
            packaged,
            global: flagBool(parsed.flags, "global"),
            force: flagBool(parsed.flags, "force"),
        });
        for (const name of result.installed)
            console.log(chalk.green(`  + ${path.join(result.target, name)}`));
        for (const name of result.skipped)
            console.log(chalk.yellow(`  = ${name} already up to date (or modified — use --force)`));
        console.log(
            chalk.gray("\nClaude Code picks project skills up from .claude/skills/ automatically."),
        );
        return 0;
    }

    console.error(chalk.red(`Unknown sub-command "skills ${sub}".`));
    console.error(SKILLS_USAGE);
    return 1;
}
