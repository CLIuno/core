#! /usr/bin/env node
'use strict';

import inquirer from 'inquirer';
import shell from 'shelljs';
import chalk from 'chalk';
import * as qs from '../utils/questions.js';
import * as handler from '../utils/GitHandler.js';
import * as messages from '../utils/messages.js';

const runCli = async () => {
    console.log(chalk.green("Hello 👋, I'm a AIO CLI for creating a new project and make your pain less 🚀"));
    inquirer
        .prompt(qs.questionsDP)
        .then((answers) => {
            if (answers['Design Pattern'] === 'MVC') {
                console.log(chalk.yellow("🚧 Only TallStack is available for MVC with SQLite 🚧"));
                inquirer.prompt(qs.questionsMVC).then((answers) => {
                    if (answers['MVC'] === 'TallStack') {
                        handler.mkdirAndClone(answers['MVC']);
                        shell.exec(`composer install`);
                        shell.exec(`npm i`);
                        messages.goodBye();
                        shell.rm('-rf', '.git');
                        shell.rm('-rf', '.github');
                        shell.cd(`..`);
                    } else {
                        console.log(chalk.red('🚧 This feature is not available yet 🚧'));
                    }
                });
            } else {
                console.log(chalk.red('🚧 Laravel and Django and Spring Boot and Dotnet is not available for RESTful API 🚧'));
                console.log(chalk.yellow("🚧 Only SQLite is supported for now 🚧"));
                inquirer.prompt(qs.questionsRestApiB).then((answers) => {
                    console.log(chalk.green('📁 Created a folder for the backend project'));
                    handler.backendInstall(answers['backend']);
                    inquirer.prompt(qs.questionsRestApiF).then((answers) => {
                        console.log(chalk.green('📁 Created a folder for the frontend project'));
                        handler.frontEndInstall(answers['frontend']);
                    });
                });
            }
        })
        .catch((error) => {
            if (error.isTtyError) {
                console.log(chalk.bgRed("Prompt couldn't be rendered in the current environment"));
            } else {
                console.log("Something else went wrong");
            }
        });

}
runCli();
