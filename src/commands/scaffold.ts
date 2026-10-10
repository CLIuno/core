import chalk from "chalk";
import shell from "shelljs";
import { select } from "@inquirer/prompts";
import * as messages from "../utils/messages";
import * as handler from "../utils/GitHandler";
import { runDoctor } from "../utils/doctor";
import { questions } from "../utils/questions";
import { shouldHintSkills } from "./skills";

const noJsPackageManager = new Set([
    "Django",
    "FastAPI",
    "Rails",
    "Spring Boot",
    "ASP.NET",
    "Drogon",
    "Without Backend",
]);

export function banner(version: string) {
    console.log(chalk.blue("CLIuno 🕹"));
    console.log(
        chalk.green(
            "Welcome to CLIuno, the Ultimate tool for making full web apps in less than min 🚀",
        ),
    );
    console.log("Current version:", chalk.yellow(version));
    if (shouldHintSkills(process.cwd())) {
        console.log(
            chalk.gray("💡 AI agent here? Install the CLIuno skills: ") +
                chalk.cyan("cliuno skills install"),
        );
    }
}

export async function runScaffold(): Promise<number> {
    try {
        const designPattern = await select(questions.DesignPattern);

        if (designPattern === "Doctor 🩺") {
            runDoctor();
        } else if (designPattern === "MVC") {
            await handleMVC();
        } else {
            await handleRestApi();
        }
        return 0;
    } catch (error) {
        if (error instanceof Error && error.name === "ExitPromptError") {
            console.log(chalk.yellow("\n👋 Bye!"));
            return 0;
        }
        console.error(chalk.red(`\n✘ ${error instanceof Error ? error.message : String(error)}`));
        return 1;
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
