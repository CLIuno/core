#! /usr/bin/env node

import inquirer from 'inquirer';
import shell from 'shelljs';

inquirer
    .prompt([
        {
            type: 'list',
            name: 'framework',
            message: 'Choose the JS framework which you are using:',
            choices: ['VueJs', 'NuxtJS', 'React', 'NextJS', 'Angular', 'Svelte', ''],
        }, {
            type: 'list',
            name: 'packageManager',
            message: 'Choose the package manager which you are using:',
            choices: ['npm', 'yarn'],
        },
        {
            type: 'input',
            name: 'name',
            message: 'Enter your name:',
        },
        {
            type: 'password',
            name: 'password',
            message: 'Enter your password:',
        },
        {
            type: 'editor',
            name: 'bio',
            message: 'Tell us about yourself:',
        },
        {
            type: 'expand',
            name: 'expandTest',
            message: 'Conflict on `file.js`: ',
            choices: [
                {
                    key: 'y',
                    name: 'Overwrite',
                    value: 'overwrite',
                }],
        },
        {
            type: 'checkbox',
            name: 'checkboxTest',
            message: 'Conflict on `file.js`: ',
        },
        {
            type: 'confirm',
            name: 'isConfirmed',
            message: 'Are you sure you want to continue?',
        },
    ])
    .then((answers) => {
        console.log(answers);
    })
    .catch((error) => {
        if (error.isTtyError) {
            console.log("Prompt couldn't be rendered in the current environment");
        } else {
            console.log("Something else went wrong");
        }
    });