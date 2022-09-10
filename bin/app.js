#! /usr/bin/env node

import inquirer from 'inquirer';
import shell from 'shelljs';

inquirer
    .prompt([
        {
            type: 'list',
            name: 'framework',
            message: 'Choose the JS framework which you are using:',
            choices: ['React', 'NextJS', 'Angular', 'Svelte', 'VueJS'],
        },{
            type: 'list',
            name: 'packageManager',
            message: 'Choose the package manager which you are using:',
            choices: ['npm', 'yarn'],
        }
    ])
    .then((answers) => {
        // Use user feedback for... whatever!!
    })
    .catch((error) => {
        if (error.isTtyError) {
            // Prompt couldn't be rendered in the current environment
        } else {
            // Something else went wrong
        }
    });