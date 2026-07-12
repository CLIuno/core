import chalk from "chalk";
import shell from "shelljs";

interface FrameworkCheck {
    name: string;
    required: string[];
    optional?: string[];
}

const frameworks: FrameworkCheck[] = [
    // Node.js based
    { name: "React", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Vue", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Angular", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Nuxt", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Next", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Solid", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Svelte", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "NestJs", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Fastify", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "AdonisJs", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },
    { name: "Express", required: ["node"], optional: ["npm", "yarn", "pnpm", "bun", "deno"] },

    // PHP based
    {
        name: "Laravel",
        required: ["php", "composer"],
        optional: ["npm", "yarn", "pnpm", "bun", "deno"],
    },
    {
        name: "TallStack",
        required: ["php", "composer"],
        optional: ["npm", "yarn", "pnpm", "bun", "deno"],
    },

    // Python based
    { name: "Django", required: ["python3", "uv"] },
    { name: "FastAPI", required: ["python3", "uv"] },

    // Ruby based
    { name: "Rails", required: ["ruby", "gem", "bundler", "rails"] },

    // JVM based
    { name: "Spring Boot", required: ["java", "mvn"] },

    // .NET based
    { name: "ASP.NET", required: ["dotnet"] },

    // Rust based
    { name: "Axum", required: ["rustc", "cargo"] },
];

function getVersion(cmd: string): string | null {
    const versionFlags: { [key: string]: string } = {
        java: "-version",
    };
    const flag = versionFlags[cmd] || "--version";
    const result = shell.exec(`${cmd} ${flag}`, { silent: true });
    if (result.code !== 0) return null;
    const output = (result.stdout || result.stderr).trim();
    const match = output.match(/(\d+\.\d+[\w.-]*)/);
    return match?.[1] ?? "installed";
}

function collectToolStatus(): Map<string, string | null> {
    const allTools = new Set<string>();
    for (const fw of frameworks) {
        for (const tool of fw.required) allTools.add(tool);
        if (fw.optional) {
            for (const tool of fw.optional) allTools.add(tool);
        }
    }

    const toolStatus = new Map<string, string | null>();
    for (const tool of allTools) {
        const found = shell.which(tool);
        toolStatus.set(tool, found ? getVersion(tool) : null);
    }
    return toolStatus;
}

function printToolOverview(toolStatus: Map<string, string | null>) {
    console.log(chalk.bold("── Installed Tools ──\n"));
    const sorted = [...toolStatus.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    for (const [tool, version] of sorted) {
        if (version) {
            console.log(chalk.green(`  ✔ ${tool}`) + chalk.gray(` (${version})`));
        } else {
            console.log(chalk.red(`  ✘ ${tool}`) + chalk.gray(" (not found)"));
        }
    }
}

function printFrameworkReadiness(toolStatus: Map<string, string | null>) {
    console.log(chalk.bold("\n── Framework Readiness ──\n"));

    let allReady = true;

    for (const fw of frameworks) {
        const missingRequired = fw.required.filter((t) => !toolStatus.get(t));
        const hasOptional = fw.optional?.filter((t) => toolStatus.get(t)) ?? [];
        const missingAllOptional = fw.optional && hasOptional.length === 0;

        if (missingRequired.length === 0 && !missingAllOptional) {
            console.log(chalk.green(`  ✔ ${fw.name}`) + chalk.gray(" — ready"));
        } else {
            allReady = false;
            const issues: string[] = [];
            if (missingRequired.length > 0) {
                issues.push(chalk.red(`missing: ${missingRequired.join(", ")}`));
            }
            if (missingAllOptional && fw.optional) {
                issues.push(
                    chalk.yellow(`needs at least one package manager: ${fw.optional.join(", ")}`),
                );
            }
            console.log(chalk.red(`  ✘ ${fw.name}`) + chalk.gray(` — ${issues.join("; ")}`));
        }
    }

    console.log();
    if (allReady) {
        console.log(chalk.green("All frameworks are ready! 🎉\n"));
    } else {
        console.log(
            chalk.yellow(
                "Some frameworks have missing prerequisites. Install them to get started.\n",
            ),
        );
    }
}

export function runDoctor() {
    console.log(chalk.blue("\n🩺 CLIuno Doctor\n"));
    console.log(chalk.gray("Checking prerequisites for all supported frameworks...\n"));

    const toolStatus = collectToolStatus();
    printToolOverview(toolStatus);
    printFrameworkReadiness(toolStatus);
}
