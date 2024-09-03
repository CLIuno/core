#!/usr/bin/env node
'use strict'

import chalk from 'chalk'
import shell from 'shelljs'
import inquirer from 'inquirer'
import * as messages from '../utils/messages'
import * as handler from '../utils/GitHandler'
import { questions } from '../utils/questions'
import { version } from '../package.json'
;(async () => {
    console.log(chalk.blue('CLIuno 🐱‍👤'))
    console.log(
        chalk.green(
            'Welcome to CLIuno, the Ultimate CLI for making full stack apps and making your life easier and less painful 🚀'
        )
    )
    console.log('Current version:', chalk.yellow(version))
    const designPatternAnswer = await inquirer.prompt(questions.DesignPattern as any)

    if (designPatternAnswer['Design Pattern'] === 'MVC') {
        await handleMVC()
    } else {
        await handleRestApi()
    }

    async function handleMVC() {
        console.log(chalk.yellow('🚧 Only TallStack is available for MVC with Postgres 🚧'))
        const mvcAnswer = await inquirer.prompt(questions.MVC as any)

        if (mvcAnswer['MVC'] === 'TallStack') {
            handler.mkdirAndClone(mvcAnswer['MVC'])
            shell.exec('composer install')
            shell.exec('npm i')
            messages.goodBye()
            handler.cleaner()
        } else {
            console.log(chalk.red('🚧 This feature is not available yet 🚧'))
        }
    }

    async function handleRestApi() {
        console.log(chalk.yellow('🚧 Only Postgres is supported for now 🚧'))
        const backendAnswer = await inquirer.prompt(questions.RestApiBackend as any)
        console.log(chalk.green('📁 Created a folder for the backend project'))
        handler.backendInstaller(backendAnswer['backend'])

        const frontendTypeAnswer = await inquirer.prompt(questions.RestApiFrontend as any)

        if (frontendTypeAnswer['typeOfFrontend'] === 'Website') {
            await handleWebsite()
        } else if (frontendTypeAnswer['typeOfFrontend'] === 'Mobile') {
            await handleMobile()
        } else {
            messages.withoutDepend()
        }
    }

    async function handleWebsite() {
        const websiteAnswer = await inquirer.prompt(questions.RestApiWebsite as any)
        console.log(chalk.green('📁 Created a folder for the frontend project'))
        handler.frontEndInstaller(websiteAnswer['frontend'])
    }

    async function handleMobile() {
        const mobileAnswer = await inquirer.prompt(questions.RestApiMobile as any)
        console.log(chalk.green('📁 Created a folder for the mobile app project'))
        handler.mobileInstaller(mobileAnswer['mobile'])
    }
})()
