import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { detectStack } from "./detect";

function fixture(files: Record<string, string>): string {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "cliuno-detect-"));
    for (const [file, content] of Object.entries(files)) {
        fs.mkdirSync(path.dirname(path.join(dir, file)), { recursive: true });
        fs.writeFileSync(path.join(dir, file), content);
    }
    return dir;
}

const pkg = (deps: Record<string, string>) => JSON.stringify({ dependencies: deps });

const cases: Array<[string, Record<string, string>]> = [
    [
        "tallstack",
        {
            "composer.json": JSON.stringify({
                require: { "laravel/framework": "^13", "livewire/livewire": "^3" },
            }),
        },
    ],
    ["laravel", { "composer.json": JSON.stringify({ require: { "laravel/framework": "^13" } }) }],
    ["django", { "pyproject.toml": 'dependencies = ["django>=6.0", "djangorestframework"]' }],
    ["fastapi", { "pyproject.toml": 'dependencies = ["fastapi[standard]>=0.1"]' }],
    ["rails", { Gemfile: 'source "https://rubygems.org"\ngem "rails", "~> 8.1"' }],
    [
        "spring",
        {
            "pom.xml":
                "<project><parent><artifactId>spring-boot-starter-parent</artifactId></parent></project>",
        },
    ],
    ["aspnet", { "Api/Api.csproj": '<Project Sdk="Microsoft.NET.Sdk.Web"></Project>' }],
    ["drogon", { "CMakeLists.txt": "find_package(Drogon CONFIG REQUIRED)" }],
    ["flutter", { "pubspec.yaml": "dependencies:\n  flutter:\n    sdk: flutter\n" }],
    ["nest", { "package.json": pkg({ "@nestjs/core": "1", express: "1" }) }],
    ["adonis", { "package.json": pkg({ "@adonisjs/core": "1" }) }],
    ["fastify", { "package.json": pkg({ fastify: "1" }) }],
    ["express", { "package.json": pkg({ express: "1" }) }],
    ["next", { "package.json": pkg({ next: "1", react: "1" }) }],
    ["nuxt", { "package.json": pkg({ nuxt: "1", vue: "1", "vue-router": "1" }) }],
    ["reactnative", { "package.json": pkg({ expo: "1", react: "1" }) }],
    ["react", { "package.json": pkg({ react: "1", "react-router-dom": "1" }) }],
    ["vue", { "package.json": pkg({ vue: "1", "vue-router": "1" }) }],
    ["svelte", { "package.json": pkg({ "@sveltejs/kit": "1" }) }],
    ["solid", { "package.json": pkg({ "solid-js": "1" }) }],
    ["angular", { "package.json": pkg({ "@angular/core": "1" }) }],
];

for (const [stack, files] of cases) {
    test(`detects ${stack}`, () => {
        const dir = fixture(files);
        assert.equal(detectStack(dir)?.stack, stack);
    });
}

test("walks up from a sub directory and returns the root", () => {
    const dir = fixture({ "package.json": pkg({ express: "1" }), "src/controllers/.keep": "" });
    const found = detectStack(path.join(dir, "src/controllers"));
    assert.equal(found?.stack, "express");
    assert.equal(found?.root, dir);
});

test("returns null when nothing matches", () => {
    assert.equal(detectStack(fixture({ "README.md": "" })), null);
    assert.equal(detectStack(fixture({ "package.json": pkg({ lodash: "1" }) })), null);
});
