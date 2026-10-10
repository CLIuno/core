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

const install = (cwd: string, home: string, packaged: string, extra = {}) =>
    installSkills({ cwd, home, packaged, global: false, force: false, ...extra });

test("an untouched older install is outdated and upgrades; an edited one is modified and kept", () => {
    const packaged = tmp();
    const cwd = tmp();
    const home = tmp();
    skill(packaged, "cliuno-make", "2.2.0");
    skill(packaged, "cliuno-scaffold", "2.2.0");
    install(cwd, home, packaged);

    // a new release ships different content
    skill(packaged, "cliuno-make", "2.3.0", "new body");
    skill(packaged, "cliuno-scaffold", "2.3.0", "new body");
    // the user edited one of the installed copies
    fs.appendFileSync(path.join(cwd, ".claude/skills/cliuno-scaffold/SKILL.md"), "my notes\n");

    const states = Object.fromEntries(
        skillsStatus({ cwd, home, packaged }).map((s) => [s.name, s.state]),
    );
    assert.deepEqual(states, { "cliuno-make": "outdated", "cliuno-scaffold": "modified" });

    const r = install(cwd, home, packaged);
    assert.deepEqual(r.installed, ["cliuno-make"]);
    assert.deepEqual(r.skipped, [{ name: "cliuno-scaffold", state: "modified" }]);
    assert.match(
        fs.readFileSync(path.join(cwd, ".claude/skills/cliuno-scaffold/SKILL.md"), "utf8"),
        /my notes/,
    );
});

test("a hand-copied skill without an install record is never overwritten without --force", () => {
    const packaged = tmp();
    const cwd = tmp();
    const home = tmp();
    skill(packaged, "cliuno-make", "2.3.0");
    skill(path.join(cwd, ".claude", "skills"), "cliuno-make", "2.0.0");
    assert.equal(skillsStatus({ cwd, home, packaged })[0]!.state, "modified");
    assert.deepEqual(install(cwd, home, packaged).installed, []);
    assert.deepEqual(install(cwd, home, packaged, { force: true }).installed, ["cliuno-make"]);
    assert.equal(skillsStatus({ cwd, home, packaged })[0]!.state, "installed");
});

test("a directory without SKILL.md is reported as occupied and left alone", () => {
    const packaged = tmp();
    const cwd = tmp();
    const home = tmp();
    skill(packaged, "cliuno-make", "2.3.0");
    const dir = path.join(cwd, ".claude", "skills", "cliuno-make");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "my-file.txt"), "keep me");

    assert.equal(skillsStatus({ cwd, home, packaged })[0]!.state, "occupied");
    const r = install(cwd, home, packaged);
    assert.deepEqual(r.skipped, [{ name: "cliuno-make", state: "occupied" }]);
    assert.equal(fs.readFileSync(path.join(dir, "my-file.txt"), "utf8"), "keep me");
});

test("status reports the copy Claude Code loads: the personal one wins over the project one", () => {
    const packaged = tmp();
    const cwd = tmp();
    const home = tmp();
    skill(packaged, "cliuno-make", "2.3.0");
    install(cwd, home, packaged);
    skill(path.join(home, ".claude", "skills"), "cliuno-make", "2.3.0", "edited personal copy");

    const [s] = skillsStatus({ cwd, home, packaged });
    assert.equal(s!.projectState, "installed");
    assert.equal(s!.userState, "modified");
    assert.equal(s!.state, "modified");
});

test("install is idempotent and --global targets the home directory", () => {
    const packaged = tmp();
    const cwd = tmp();
    const home = tmp();
    skill(packaged, "cliuno-make", "2.3.0");
    assert.deepEqual(install(cwd, home, packaged).installed, ["cliuno-make"]);
    assert.deepEqual(install(cwd, home, packaged).skipped, [
        { name: "cliuno-make", state: "installed" },
    ]);
    const g = install(cwd, home, packaged, { global: true });
    assert.equal(g.target, path.join(home, ".claude", "skills"));
    assert.deepEqual(g.installed, ["cliuno-make"]);
    assert.ok(fs.existsSync(path.join(home, ".claude/skills/cliuno-make/references/a.md")));
});
