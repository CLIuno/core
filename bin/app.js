#! /usr/bin/env node
'use strict';

import inquirer from 'inquirer';
import shell from 'shelljs';
import chalk from 'chalk';
import * as qs from '../utils/questions.js';
import * as handler from '../utils/GitHandler.js';
import * as messages from '../utils/messages.js';




const runCli = async () => {
    console.log(chalk.green("Welcome to Aio the Ultimate CLI for making fullstack apps\nand making your life easier and less pain 🚀"));
    inquirer.prompt(qs.questionsDP)
        .then((answers) => {
            if (answers['Design Pattern'] === 'MVC') {
                console.log(chalk.yellow("🚧 Only TallStack is available for MVC with Postgres 🚧"));
                inquirer.prompt(qs.questionsMVC).then((answers) => {
                    if (answers['MVC'] === 'TallStack') {
                        handler.mkdirAndClone(answers['MVC']);
                        shell.exec(`composer install`);
                        shell.exec(`npm i`);
                        messages.goodBye();
                        handler.cleaner();
                    } else {
                        console.log(chalk.red('🚧 This feature is not available yet 🚧'));
                    }
                });
            } else {
                console.log(chalk.yellow("🚧 Only Postgres is supported for now 🚧"));
                inquirer.prompt(qs.questionsRestApiB).then((answers) => {
                    console.log(chalk.green('📁 Created a folder for the backend project'));
                    handler.backendInstaller(answers['backend']);
                    inquirer.prompt(qs.questionsRestApiFrontend).then((answers) => {
                        if (answers['typeOfFrontend'] === 'Website') {
                            inquirer.prompt(qs.questionsRestApiW).then((answers) => {
                                console.log(chalk.green('📁 Created a folder for the frontend project'));
                                handler.frontEndInstaller(answers['frontend']);
                            });
                        } else if (answers['typeOfFrontend'] === 'Mobile') {
                            inquirer.prompt(qs.questionsRestApiM).then((answers) => {
                                console.log(chalk.green('📁 Created a folder for mobile app project'));
                                handler.mobileInstaller(answers['mobile']);
                            });
                        } else {
                            messages.withoutDepend();
                        }

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
