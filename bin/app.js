#! /usr/bin/env node

import inquirer from 'inquirer';
import shell from 'shelljs';
const path = process.cwd();
import chalk from 'chalk';
import * as qs from '../utils/questions.js';
import { links } from '../utils/links.js';

console.log(chalk.green("Hello, I'm a CLI for creating a new project"));
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
                    shell.exec(`npm i`);
                    console.log(chalk.green('📦 Successfully installed all the required dependencies\nHappy hacking 🚀'));
                } else {
                    console.log(chalk.red('🚧 This feature is not available yet'));
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
            console.log(chalk.red('🚧 Only VueJS With ExpressJs is available for RESTful API 🚧'));
            console.log(chalk.yellow("🚧 Only SQLite is supported for now 🚧"));
            console.log(chalk.red("🚧 Only NPM is supported for now 🚧"));
            inquirer.prompt(qs.questionsRestApi).then((answers) => {
                if (answers['frontend'] === 'VueJs') {
                    console.log("YOU ARE USING VUEJS");
                } else if (answers['frontend'] === 'NuxtJS') {
                    console.log("YOU ARE USING NuxtJS");
                } else if (answers['frontend'] === 'React') {
                    console.log("YOU ARE USING React");
                } else if (answers['frontend'] === 'NextJS') {
                    console.log("YOU ARE USING NextJS");
                } else if (answers['frontend'] === 'Angular') {
                    console.log("YOU ARE USING Angular");
                } else if (answers['frontend'] === 'Svelte') {
                    console.log("YOU ARE USING Svelte");
                }
                if (answers['backend'] === 'Express') {
                    console.log("YOU ARE USING Express");
                } else if (answers['backend'] === 'NestJS') {
                    console.log("YOU ARE USING NestJS");
                } else if (answers['backend'] === 'AdonisJS') {
                    console.log("YOU ARE USING AdonisJS");
                } else if (answers['backend'] === 'Fastify') {
                    console.log("YOU ARE USING Fastify");
                } else if (answers['backend'] === 'Django') {
                    console.log("YOU ARE USING Django");
                } else if (answers['backend'] === 'Laravel') {
                    console.log("YOU ARE USING Laravel");
                } else if (answers['backend'] === 'Spring Boot') {
                    console.log("YOU ARE USING Spring Boot");
                } else if (answers['backend'] === 'Dotnet Core') {
                    console.log("YOU ARE USING Dotnet Core");
                }
                // inquirer.prompt(qs.questionsDB).then((answers) => {
                //     if (answers['database'] === 'MongoDB') {
                //         console.log("Sorry MongoDB is not supported yet");
                //     } else if (answers['database'] === 'PostgreSQL') {
                //         console.log("Sorry PostgreSQL is not supported yet");
                //     } else if (answers['database'] === 'SQLite') {
                //         console.log("YOU ARE USING SQLite");
                //     }
                // inquirer.prompt(qs.questionsPM).then((answers) => {
                //     if (answers['package manager'] === 'npm') {
                //         console.log("YOU ARE USING npm");
                //     } else if (answers['package manager'] === 'yarn') {
                //         console.log("Sorry yarn is not supported yet");
                //     }
                // });
                // });
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

