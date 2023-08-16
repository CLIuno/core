#!/usr/bin/env node
'use strict';

import inquirer from 'inquirer';
import shell from 'shelljs';
import chalk from 'chalk';
import { questions } from '../utils/questions.js';
import * as handler from '../utils/GitHandler.js';
import * as messages from '../utils/messages.js';

const runCli = async () => {
    console.log(chalk.blue('CLIuno🐱‍👤'));
    console.log(
        chalk.green(
            'Welcome to Aio, the Ultimate CLI for making full-stack apps and making your life easier and less painful 🚀',
        ),
    );

    const designPatternAnswer = await inquirer.prompt(questions.DesignPattern);

    if (designPatternAnswer['Design Pattern'] === 'MVC') {
        console.log(chalk.yellow('🚧 Only TallStack is available for MVC with Postgres 🚧'));
        const mvcAnswer = await inquirer.prompt(questions.MVC);

        if (mvcAnswer['MVC'] === 'TallStack') {
            handler.mkdirAndClone(mvcAnswer['MVC']);
            shell.exec('composer install');
            shell.exec('npm i');
            messages.goodBye();
            handler.cleaner();
        } else {
            console.log(chalk.red('🚧 This feature is not available yet 🚧'));
        }
    } else {
        console.log(chalk.yellow('🚧 Only Postgres is supported for now 🚧'));
        const backendAnswer = await inquirer.prompt(questions.RestApiBackend);
        console.log(chalk.green('📁 Created a folder for the backend project'));
        handler.backendInstaller(backendAnswer['backend']);

        const frontendTypeAnswer = await inquirer.prompt(questions.RestApiFrontend);

        if (frontendTypeAnswer['typeOfFrontend'] === 'Website') {
            const websiteAnswer = await inquirer.prompt(questions.RestApiWebsite);
            console.log(chalk.green('📁 Created a folder for the frontend project'));
            handler.frontEndInstaller(websiteAnswer['frontend']);
        } else if (frontendTypeAnswer['typeOfFrontend'] === 'Mobile') {
            const mobileAnswer = await inquirer.prompt(questions.RestApiMobile);
            console.log(chalk.green('📁 Created a folder for the mobile app project'));
            handler.mobileInstaller(mobileAnswer['mobile']);
        } else {
            messages.withoutDepend();
        }
    }
};

runCli();
