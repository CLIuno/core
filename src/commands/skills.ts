import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import chalk from "chalk";
import { flagBool, type ParsedArgv } from "../cli/argv";
import { packagedSkillsDir } from "../skills/locate";

/**
 * - `missing`   no copy in this scope
 * - `installed` identical to the packaged skill
 * - `outdated`  an untouched copy from an earlier `cliuno skills install` — safe to upgrade
 * - `modified`  differs from the package and was not provably installed by us — kept unless --force
 * - `occupied`  the directory exists but has no SKILL.md — never touched without --force
 */
export type SkillState = "missing" | "installed" | "outdated" | "modified" | "occupied";

export interface SkillStatus {
    name: string;
    packaged: string;
    project?: string;
    user?: string;
    projectState: SkillState;
    userState: SkillState;
    /** State of the copy Claude Code actually loads (personal scope wins over project scope). */
    state: SkillState;
}

export const SKILLS_USAGE = `
Usage: cliuno skills status              show which CLIuno skills are installed (project + user scope)
       cliuno skills install [options]   copy the skills into ./.claude/skills/

Options:
  --global   install into ~/.claude/skills/ instead of the current project
  --force    overwrite skills that were modified locally (or directories that are not skills)
`;

/** Written next to an installed skill so a later install can tell an untouched copy from an edited one. */
const RECORD = ".cliuno-skill.json";

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

function walk(dir: string): string[] {
    const out: string[] = [];
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.name === RECORD) continue;
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) out.push(...walk(full));
        else out.push(full);
    }
    return out.sort();
}

/** Content hash of a skill directory (relative paths + bytes), ignoring our install record. */
export function hashSkill(dir: string): string {
    const hash = crypto.createHash("sha256");
    for (const file of walk(dir)) {
        hash.update(path.relative(dir, file));
        hash.update("\0");
        hash.update(fs.readFileSync(file));
        hash.update("\0");
    }
    return hash.digest("hex");
}

function readRecord(dir: string): { hash?: string } | null {
    try {
        return JSON.parse(fs.readFileSync(path.join(dir, RECORD), "utf8")) as { hash?: string };
    } catch {
        return null;
    }
}

export function stateOf(packaged: string, target: string): SkillState {
    if (!fs.existsSync(target)) return "missing";
    if (!fs.existsSync(path.join(target, "SKILL.md"))) return "occupied";
    const current = hashSkill(target);
    if (current === hashSkill(packaged)) return "installed";
    // Content differs. It is only safe to replace when our record proves nobody edited it since install.
    return readRecord(target)?.hash === current ? "outdated" : "modified";
}

export function skillsStatus(opts: { cwd: string; home: string; packaged: string }): SkillStatus[] {
    const projectDir = path.join(opts.cwd, ".claude", "skills");
    const userDir = path.join(opts.home, ".claude", "skills");
    return listSkills(opts.packaged).map((name) => {
        const packaged = path.join(opts.packaged, name);
        const project = path.join(projectDir, name);
        const user = path.join(userDir, name);
        const projectState = stateOf(packaged, project);
        const userState = stateOf(packaged, user);
        return {
            name,
            packaged,
            project: projectState === "missing" ? undefined : project,
            user: userState === "missing" ? undefined : user,
            projectState,
            userState,
            state: userState !== "missing" ? userState : projectState,
        };
    });
}

function copySkill(from: string, to: string) {
    fs.rmSync(to, { recursive: true, force: true });
    fs.mkdirSync(to, { recursive: true });
    fs.cpSync(from, to, { recursive: true, dereference: true });
    fs.writeFileSync(
        path.join(to, RECORD),
        `${JSON.stringify({ version: skillVersion(from), hash: hashSkill(from) }, null, 2)}\n`,
    );
}

export function installSkills(opts: {
    cwd: string;
    home: string;
    packaged: string;
    global: boolean;
    force: boolean;
}): {
    installed: string[];
    skipped: { name: string; state: SkillState }[];
    target: string;
} {
    const target = path.join(opts.global ? opts.home : opts.cwd, ".claude", "skills");
    const installed: string[] = [];
    const skipped: { name: string; state: SkillState }[] = [];
    for (const name of listSkills(opts.packaged)) {
        const from = path.join(opts.packaged, name);
        const to = path.join(target, name);
        const state = stateOf(from, to);
        const safe = state === "missing" || state === "outdated";
        if (state === "installed" || (!safe && !opts.force)) {
            skipped.push({ name, state });
            continue;
        }
        copySkill(from, to);
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

const SKIP_REASON: Record<SkillState, string> = {
    installed: "already up to date",
    modified: "modified locally — kept (use --force to overwrite)",
    occupied: "directory exists but is not a skill — kept (use --force to replace)",
    outdated: "outdated",
    missing: "missing",
};

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
            const scopes = chalk.gray(`project: ${s.projectState} · user: ${s.userState}`);
            console.log(`${icon} ${s.name.padEnd(16)} ${s.state.padEnd(10)} ${scopes}`);
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
        for (const { name, state } of result.skipped)
            console.log(chalk.yellow(`  = ${name}: ${SKIP_REASON[state]}`));
        console.log(
            chalk.gray("\nClaude Code picks project skills up from .claude/skills/ automatically."),
        );
        return 0;
    }

    console.error(chalk.red(`Unknown sub-command "skills ${sub}".`));
    console.error(SKILLS_USAGE);
    return 1;
}
