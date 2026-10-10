import { test } from "node:test";
import assert from "node:assert/strict";
import { parseArgv } from "./argv";

test("make:<kind> with name and flags", () => {
    const parsed = parseArgv(["make:resource", "Post", "--fields", "a:string", "--dry-run"]);
    assert.equal(parsed.command, "make");
    assert.equal(parsed.kind, "resource");
    assert.equal(parsed.name, "Post");
    assert.equal(parsed.flags.fields, "a:string");
    assert.equal(parsed.flags["dry-run"], true);
});

test("bare make lists generators", () => {
    const parsed = parseArgv(["make"]);
    assert.equal(parsed.command, "make");
    assert.equal(parsed.kind, undefined);
});

test("skills sub-command and global flag", () => {
    const parsed = parseArgv(["skills", "install", "--global", "--force"]);
    assert.equal(parsed.command, "skills");
    assert.equal(parsed.sub, "install");
    assert.equal(parsed.flags.global, true);
    assert.equal(parsed.flags.force, true);
});

test("legacy flags still route", () => {
    assert.equal(parseArgv(["--doctor"]).command, "doctor");
    assert.equal(parseArgv(["-v"]).command, "version");
    assert.equal(parseArgv(["--help"]).command, "help");
    assert.equal(parseArgv([]).command, "scaffold");
});

test("--flag=value form", () => {
    const parsed = parseArgv(["make:model", "Tag", "--fields=name:string"]);
    assert.equal(parsed.flags.fields, "name:string");
});
