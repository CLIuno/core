import shell from "shelljs";
import chalk from "chalk";
import * as messages from "./messages";
import { links } from "./links";

const PATH = process.cwd();

const installCommand: { [key: string]: string } = {
    npm: "npm i",
    yarn: "yarn",
    pnpm: "pnpm i",
    bun: "bun i",
    deno: "deno install",
};

export function getInstallCmd(packageManager: string): string {
    return installCommand[packageManager] || "npm i";
}

function getBackendCommands(packageManager: string): { [key: string]: string[] } {
    const install = getInstallCmd(packageManager);
    return {
        Fastify: [install],
        ExpressJs: [install],
        NestJs: [install],
        AdonisJs: [install],
        Laravel: ["composer install", install],
        Django: ["uv sync"],
        FastAPI: ["uv sync"],
        Rails: ["bundle install"],
        "Spring Boot": ["mvn clean install"],
        "ASP.NET": [],
    };
}

function runCommands(commands: string[]) {
    commands.forEach((command) => shell.exec(command));
}

export function mkdirAndClone(frameworkName: string) {
    console.log(chalk.green(`cloning ${frameworkName} from The Repo 🚀`));
    shell.exec(`git clone ${links.get(frameworkName)} ${frameworkName}_project`);
    shell.cd(`${PATH}/${frameworkName}_project`);
    console.log(chalk.green("🚀 Installing dependencies"));
}

export function cleaner() {
    shell.rm("-rf", ".git");
    shell.rm("-rf", ".github");
    shell.cd(`..`);
}

export function backendInstaller(frameworkName: string, packageManager: string = "npm") {
    const backendCommands = getBackendCommands(packageManager);
    if (backendCommands[frameworkName]) {
        mkdirAndClone(frameworkName);
        runCommands(backendCommands[frameworkName]);
        cleaner();
    } else {
        console.log(chalk.yellow("You look like you have a backend framework installed already"));
    }
}

export function frontEndInstaller(frameworkName: string, packageManager: string = "npm") {
    mkdirAndClone(frameworkName);
    shell.exec(getInstallCmd(packageManager));
    messages.goodBye();
    cleaner();
}

export function mobileInstaller(frameworkName: string) {
    mkdirAndClone(frameworkName);
    messages.goodBye();
    cleaner();
}
