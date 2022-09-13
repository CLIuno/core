#! /usr/bin/env node

import inquirer from 'inquirer';
import shell from 'shelljs';

import { questions, questionsTs } from '../utils/questions.js';

inquirer
    .prompt(questions)
    .then((answers) => {
        if (answers['Design Pattern'] === 'MVC') {

        }
    })
    .catch((error) => {
        if (error.isTtyError) {
            console.log("Prompt couldn't be rendered in the current environment");
        } else {
            console.log("Something else went wrong");
        }
    });