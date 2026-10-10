import fs from "node:fs";
import path from "node:path";

export type StackId =
    | "express"
    | "fastify"
    | "nest"
    | "adonis"
    | "django"
    | "fastapi"
    | "laravel"
    | "tallstack"
    | "rails"
    | "spring"
    | "aspnet"
    | "drogon"
    | "axum"
    | "react"
    | "next"
    | "vue"
    | "nuxt"
    | "svelte"
    | "solid"
    | "angular"
    | "flutter"
    | "reactnative";

export interface Detection {
    stack: StackId;
    root: string;
}

interface Probe {
    stack: StackId;
    describe: string;
    test: (dir: string) => boolean;
}

function read(dir: string, file: string): string | null {
    try {
        return fs.readFileSync(path.join(dir, file), "utf8");
    } catch {
        return null;
    }
}

function pkgDeps(dir: string): Record<string, string> | null {
    const raw = read(dir, "package.json");
    if (!raw) return null;
    try {
        const pkg = JSON.parse(raw) as {
            dependencies?: Record<string, string>;
            devDependencies?: Record<string, string>;
        };
        return { ...pkg.dependencies, ...pkg.devDependencies };
    } catch {
        return null;
    }
}

function composerRequires(dir: string, name: string): boolean {
    const raw = read(dir, "composer.json");
    if (!raw) return false;
    try {
        const c = JSON.parse(raw) as { require?: Record<string, string> };
        return Boolean(c.require?.[name]);
    } catch {
        return false;
    }
}

function pyprojectHas(dir: string, name: string): boolean {
    const raw = read(dir, "pyproject.toml");
    return raw !== null && new RegExp(`["']${name}(\\[|[>=<~!]|["'])`, "i").test(raw);
}

function csprojIsWeb(dir: string): boolean {
    const candidates: string[] = [];
    try {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isFile() && entry.name.endsWith(".csproj"))
                candidates.push(path.join(dir, entry.name));
            if (entry.isDirectory() && !entry.name.startsWith(".")) {
                try {
                    for (const sub of fs.readdirSync(path.join(dir, entry.name))) {
                        if (sub.endsWith(".csproj"))
                            candidates.push(path.join(dir, entry.name, sub));
                    }
                } catch {
                    /* unreadable sub dir */
                }
            }
        }
    } catch {
        return false;
    }
    return candidates.some((file) => {
        try {
            return fs.readFileSync(file, "utf8").includes("Microsoft.NET.Sdk.Web");
        } catch {
            return false; // dangling symlink or unreadable file
        }
    });
}

const dep = (dir: string, name: string) => Boolean(pkgDeps(dir)?.[name]);

export const PROBES: readonly Probe[] = [
    {
        stack: "tallstack",
        describe: "composer.json requires livewire/livewire",
        test: (d) => composerRequires(d, "livewire/livewire"),
    },
    {
        stack: "laravel",
        describe: "composer.json requires laravel/framework",
        test: (d) => composerRequires(d, "laravel/framework"),
    },
    {
        stack: "django",
        describe: "pyproject.toml lists django",
        test: (d) => pyprojectHas(d, "django"),
    },
    {
        stack: "fastapi",
        describe: "pyproject.toml lists fastapi",
        test: (d) => pyprojectHas(d, "fastapi"),
    },
    {
        stack: "rails",
        describe: 'Gemfile has gem "rails"',
        test: (d) => /gem\s+["']rails["']/.test(read(d, "Gemfile") ?? ""),
    },
    {
        stack: "spring",
        describe: "pom.xml contains spring-boot",
        test: (d) => (read(d, "pom.xml") ?? "").includes("spring-boot"),
    },
    { stack: "aspnet", describe: "*.csproj uses Microsoft.NET.Sdk.Web", test: csprojIsWeb },
    {
        stack: "drogon",
        describe: "CMakeLists.txt links Drogon",
        test: (d) => (read(d, "CMakeLists.txt") ?? "").includes("Drogon"),
    },
    {
        stack: "axum",
        describe: "Cargo.toml depends on axum",
        test: (d) => /^\s*axum\s*=/m.test(read(d, "Cargo.toml") ?? ""),
    },
    {
        stack: "flutter",
        describe: "pubspec.yaml depends on flutter",
        test: (d) => /^\s+flutter:\s*$/m.test(read(d, "pubspec.yaml") ?? ""),
    },
    {
        stack: "nest",
        describe: "package.json depends on @nestjs/core",
        test: (d) => dep(d, "@nestjs/core"),
    },
    {
        stack: "adonis",
        describe: "package.json depends on @adonisjs/core",
        test: (d) => dep(d, "@adonisjs/core"),
    },
    {
        stack: "fastify",
        describe: "package.json depends on fastify",
        test: (d) => dep(d, "fastify"),
    },
    {
        stack: "express",
        describe: "package.json depends on express",
        test: (d) => dep(d, "express"),
    },
    { stack: "next", describe: "package.json depends on next", test: (d) => dep(d, "next") },
    { stack: "nuxt", describe: "package.json depends on nuxt", test: (d) => dep(d, "nuxt") },
    { stack: "reactnative", describe: "package.json depends on expo", test: (d) => dep(d, "expo") },
    {
        stack: "react",
        describe: "package.json depends on react + react-router-dom",
        test: (d) => dep(d, "react") && dep(d, "react-router-dom"),
    },
    {
        stack: "vue",
        describe: "package.json depends on vue + vue-router",
        test: (d) => dep(d, "vue") && dep(d, "vue-router"),
    },
    {
        stack: "svelte",
        describe: "package.json depends on @sveltejs/kit",
        test: (d) => dep(d, "@sveltejs/kit"),
    },
    {
        stack: "solid",
        describe: "package.json depends on solid-js",
        test: (d) => dep(d, "solid-js"),
    },
    {
        stack: "angular",
        describe: "package.json depends on @angular/core",
        test: (d) => dep(d, "@angular/core"),
    },
];

const MANIFESTS = [
    "Cargo.toml",
    "package.json",
    "composer.json",
    "pyproject.toml",
    "Gemfile",
    "pom.xml",
    "CMakeLists.txt",
    "pubspec.yaml",
];

function hasManifest(dir: string): boolean {
    if (MANIFESTS.some((m) => fs.existsSync(path.join(dir, m)))) return true;
    return csprojIsWeb(dir);
}

/** Walk up from cwd (≤ 6 levels) to the first directory with a manifest, then run the probes in order. */
export function detectStack(cwd: string): Detection | null {
    let dir = path.resolve(cwd);
    for (let depth = 0; depth <= 6; depth++) {
        if (hasManifest(dir)) {
            for (const probe of PROBES) {
                if (probe.test(dir)) return { stack: probe.stack, root: dir };
            }
            return null;
        }
        const parent = path.dirname(dir);
        if (parent === dir) break;
        dir = parent;
    }
    return null;
}
