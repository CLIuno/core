import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { installSkills, skillsStatus } from "./skills";

function tmp(): string {
    return fs.mkdtempSync(path.join(os.tmpdir(), "cliuno-skills-"));
}

function skill(root: string, name: string, version: string, body = "hello") {
    fs.mkdirSync(path.join(root, name, "references"), { recursive: true });
    fs.writeFileSync(
        path.join(root, name, "SKILL.md"),
        `---\nname: ${name}\ndescription: x\nmetadata:\n  version: ${version}\n---\n${body}\n`,
    );
    fs.writeFileSync(path.join(root, name, "references", "a.md"), "ref");
}

test("status reports missing / installed / outdated / modified", () => {
    const packaged = tmp();
    const cwd = tmp();
    const home = tmp();
    skill(packaged, "cliuno-make", "3.0.0");
    skill(packaged, "cliuno-matrix", "3.0.0");
    skill(packaged, "cliuno-scaffold", "3.0.0");
    skill(path.join(cwd, ".claude", "skills"), "cliuno-matrix", "2.0.0");
    skill(path.join(home, ".claude", "skills"), "cliuno-scaffold", "3.0.0", "edited by user");

    const states = Object.fromEntries(
        skillsStatus({ cwd, home, packaged }).map((s) => [s.name, s.state]),
    );
    assert.deepEqual(states, {
        "cliuno-make": "missing",
        "cliuno-matrix": "outdated",
        "cliuno-scaffold": "modified",
    });
});

test("install copies missing/outdated, keeps modified unless --force, is idempotent", () => {
    const packaged = tmp();
    const cwd = tmp();
    const home = tmp();
    skill(packaged, "cliuno-make", "3.0.0");
    skill(packaged, "cliuno-scaffold", "3.0.0");
    skill(path.join(cwd, ".claude", "skills"), "cliuno-scaffold", "3.0.0", "edited by user");

    let r = installSkills({ cwd, home, packaged, global: false, force: false });
    assert.deepEqual(r.installed, ["cliuno-make"]);
    assert.deepEqual(r.skipped, ["cliuno-scaffold"]);
    assert.ok(fs.existsSync(path.join(cwd, ".claude/skills/cliuno-make/references/a.md")));
    assert.match(
        fs.readFileSync(path.join(cwd, ".claude/skills/cliuno-scaffold/SKILL.md"), "utf8"),
        /edited by user/,
    );

    r = installSkills({ cwd, home, packaged, global: false, force: true });
    assert.deepEqual(r.installed, ["cliuno-scaffold"]);
    assert.doesNotMatch(
        fs.readFileSync(path.join(cwd, ".claude/skills/cliuno-scaffold/SKILL.md"), "utf8"),
        /edited by user/,
    );

    r = installSkills({ cwd, home, packaged, global: false, force: false });
    assert.deepEqual(r.installed, []);
    assert.deepEqual(r.skipped, ["cliuno-make", "cliuno-scaffold"]);

    r = installSkills({ cwd, home, packaged, global: true, force: false });
    assert.equal(r.target, path.join(home, ".claude", "skills"));
    assert.deepEqual(r.installed, ["cliuno-make", "cliuno-scaffold"]);
    const all = skillsStatus({ cwd, home, packaged });
    assert.ok(all.every((s) => s.state === "installed"));
});
