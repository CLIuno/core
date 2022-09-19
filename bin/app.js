#! /usr/bin/env node


import inquirer from 'inquirer';
import shell from 'shelljs';
const path = process.cwd();
import chalk from 'chalk';
import * as qs from '../utils/questions.js';
import { links } from '../utils/links.js';
import * as handler from '../utils/GitHandler.js';


console.log(chalk.green("Hello 👋, I'm a AIO CLI for creating a new project and make your pain less 🚀"));
inquirer
    .prompt(qs.questionsDP)
    .then((answers) => {
        if (answers['Design Pattern'] === 'MVC') {
            console.log(chalk.yellow("🚧 Only TallStack is available for MVC with SQLite 🚧"));
            inquirer.prompt(qs.questionsMVC).then((answers) => {
                if (answers['MVC'] === 'TallStack') {
                    shell.exec(`mkdir ${answers['MVC']}`);
                    console.log(chalk.green('📁 Created a folder for the project'));
                    shell.exec(`git clone ${links.get('TallStack')} ${answers['MVC']}`);
                    shell.cd(`${path}/${answers['MVC']}`);
                    console.log(chalk.green('🚀 Installing dependencies'));
                    shell.exec(`composer install`);
                    shell.exec(`npm i`);
                    console.log(chalk.green('📦 Successfully installed all the required dependencies\nHappy hacking 🚀'));
                    console.log(chalk.green('\nMade with ❤️  by @ru44'));
                    console.log(chalk.bgGreen("Please donate to the project if you like it ❤️"));
                    shell.rm('-rf', '.git');
                    shell.rm('-rf', '.github');
                    shell.cd(`..`);
                } else {
                    console.log(chalk.red('🚧 This feature is not available yet 🚧'));
                }

                // This Part is still just idea and not implemented yet

                // console.log(chalk.red('🚧 This Projects is still under development'));
                //     inquirer.prompt(qs.questionsDB).then((answers) => {
                //         if (answers['database'] === 'MongoDB') {
                //             console.log("Sorry MongoDB is not supported yet");
                //         } else if (answers['database'] === 'PostgreSQL') {
                //             console.log("Sorry PostgreSQL is not supported yet");
                //         } else if (answers['database'] === 'SQLite') {
                //             console.log("YOU ARE USING SQLite");
                //         }
                //     });
            });
        } else {
            console.log(chalk.red('🚧 Laravel and Django and Spring Boot and Dotnet is not available for RESTful API 🚧'));
            console.log(chalk.yellow("🚧 Only SQLite is supported for now 🚧"));
            inquirer.prompt(qs.questionsRestApiB).then((answers) => {
                console.log(chalk.green('📁 Created a folder for the backend project'));
                if (answers['backend'] === 'ExpressJs') {
                    handler.backendInstall('ExpressJs');
                } else if (answers['backend'] === 'Fastify') {
                    handler.backendInstall('Fastify');
                } else if (answers['backend'] === 'NestJs') {
                    handler.backendInstall('NestJs');
                } else if (answers['backend'] === 'AdonisJs') {
                    handler.backendInstall('AdonisJs');
                }
                else {
                    console.log(chalk.red('🚧 This feature is not available yet'));
                }

                inquirer.prompt(qs.questionsRestApiF).then((answers) => {
                    console.log(chalk.green('📁 Created a folder for the frontend project'));
                    handler.frontEndInstall(answers['frontend']);
                });
            });

        }
    })
    .catch((error) => {
        if (error.isTtyError) {
            console.log("Prompt couldn't be rendered in the current environment");
        } else {
            console.log("Something else went wrong");
        }
    });

