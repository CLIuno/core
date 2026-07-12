#!/usr/bin/env node
"use strict";

import chalk from "chalk";
import shell from "shelljs";
import { select } from "@inquirer/prompts";
import * as messages from "./utils/messages";
import * as handler from "./utils/GitHandler";
import { runDoctor } from "./utils/doctor";
import { questions } from "./utils/questions";
import { version } from "../package.json";

console.log(chalk.blue("CLIuno 🕹"));
console.log(
    chalk.green(
        "Welcome to CLIuno, the Ultimate tool for making full web apps in less than min 🚀",
    ),
);
console.log("Current version:", chalk.yellow(version));

const noJsPackageManager = new Set([
    "Django",
    "FastAPI",
    "Rails",
    "Spring Boot",
    "ASP.NET",
    "Without Backend",
]);
const args = new Set(process.argv.slice(2));

if (args.has("--help") || args.has("-h")) {
    console.log(`
Usage: cliuno [options]

Options:
  --help, -h       Show this help message
  --version, -v    Show the current version
  --doctor         Run system diagnostics
`);
    process.exit(0);
} else if (args.has("--version") || args.has("-v")) {
    process.exit(0);
} else if (args.has("--doctor")) {
    runDoctor();
} else {
    try {
        const designPattern = await select(questions.DesignPattern);

        if (designPattern === "Doctor 🩺") {
            runDoctor();
        } else if (designPattern === "MVC") {
            await handleMVC();
        } else {
            await handleRestApi();
        }
    } catch {
        console.log(chalk.yellow("\n👋 Bye!"));
        process.exit(0);
    }
}

async function askPackageManager(): Promise<string> {
    return select(questions.PackageManager);
}

async function handleMVC() {
    console.log(chalk.yellow("🚧 Only TallStack is available for MVC with Postgres 🚧"));
    const mvcChoice = await select(questions.MVC);

    if (mvcChoice === "TallStack") {
        handler.mkdirAndClone(mvcChoice);
        shell.exec("composer install");
        const packageManager = await askPackageManager();
        shell.exec(handler.getInstallCmd(packageManager));
        messages.goodBye();
        handler.cleaner();
    } else {
        console.log(chalk.red("🚧 This feature is not available yet 🚧"));
    }
}

async function handleRestApi() {
    console.log(chalk.yellow("🚧 Only SQLite is supported for now 🚧"));
    const backendChoice = await select(questions.RestApiBackend);

    let packageManager = "npm";
    if (!noJsPackageManager.has(backendChoice)) {
        packageManager = await askPackageManager();
    }

    console.log(chalk.green("📁 Created a folder for the backend project"));
    handler.backendInstaller(backendChoice, packageManager);

    const frontendType = await select(questions.RestApiFrontend);

    if (frontendType === "Website") {
        if (noJsPackageManager.has(backendChoice)) {
            packageManager = await askPackageManager();
        }
        await handleWebsite(packageManager);
    } else if (frontendType === "Mobile") {
        await handleMobile();
    } else {
        messages.withoutDepend();
    }
}

async function handleWebsite(packageManager: string) {
    const frontend = await select(questions.RestApiWebsite);
    console.log(chalk.green("📁 Created a folder for the frontend project"));
    handler.frontEndInstaller(frontend, packageManager);
}

async function handleMobile() {
    const mobile = await select(questions.RestApiMobile);
    console.log(chalk.green("📁 Created a folder for the mobile app project"));
    handler.mobileInstaller(mobile);
}
