#!/usr/bin/env node
"use strict";

import { parseArgv } from "./cli/argv";
import { runDoctor } from "./utils/doctor";
import { banner, runScaffold } from "./commands/scaffold";
import { runMake, MAKE_USAGE } from "./commands/make";
import { runSkills, SKILLS_USAGE } from "./commands/skills";
import { version } from "../package.json";

const HELP = `
Usage: cliuno [command] [options]

Commands:
  (none)                      interactive scaffolder: pick a backend / frontend / mobile template
  make                        list the generators available in the current project
  make:<kind> <Name>          generate a resource, controller, model, … in the current project
  skills status|install       check / install the CLIuno Claude skills (.claude/skills/)

Options:
  --help, -h       Show this help message
  --version, -v    Show the current version
  --doctor         Run system diagnostics
${MAKE_USAGE}${SKILLS_USAGE}`;

const parsed = parseArgv(process.argv.slice(2));

switch (parsed.command) {
    case "help":
        console.log(HELP);
        process.exit(0);
        break;
    case "version":
        console.log(version);
        process.exit(0);
        break;
    case "doctor":
        banner(version);
        runDoctor();
        break;
    case "make":
        process.exit(await runMake(parsed));
        break;
    case "skills":
        process.exit(await runSkills(parsed));
        break;
    default:
        banner(version);
        process.exit(await runScaffold());
}
