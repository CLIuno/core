#! /usr/bin/env node
'use strict';

import inquirer from 'inquirer';
import shell from 'shelljs';
import chalk from 'chalk';
import * as qs from '../utils/questions.js';
import * as handler from '../utils/GitHandler.js';
import * as messages from '../utils/messages.js';

const runCli = async () => {
  console.log(chalk.green('Welcome to Aio the Ultimate CLI for making fullstack apps and making your life easier and less pain 🚀'));

  const designPatternAnswer = await inquirer.prompt(qs.questionsDP);
  if (designPatternAnswer['Design Pattern'] === 'MVC') {
    console.log(chalk.yellow('🚧 Only TallStack is available for MVC with Postgres 🚧'));

    const mvcAnswer = await inquirer.prompt(qs.questionsMVC);
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

    const backendAnswer = await inquirer.prompt(qs.questionsRestApiB);
    console.log(chalk.green('📁 Created a folder for the backend project'));
    handler.backendInstaller(backendAnswer['backend']);

    const frontendTypeAnswer = await inquirer.prompt(qs.questionsRestApiFrontend);
    if (frontendTypeAnswer['typeOfFrontend'] === 'Website') {
      const websiteAnswer = await inquirer.prompt(qs.questionsRestApiW);
      console.log(chalk.green('📁 Created a folder for the frontend project'));
      handler.frontEndInstaller(websiteAnswer['frontend']);
    } else if (frontendTypeAnswer['typeOfFrontend'] === 'Mobile') {
      const mobileAnswer = await inquirer.prompt(qs.questionsRestApiM);
      console.log(chalk.green('📁 Created a folder for mobile app project'));
      handler.mobileInstaller(mobileAnswer['mobile']);
    } else {
      messages.withoutDepend();
    }
  }
};

runCli();
