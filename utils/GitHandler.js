import shell from 'shelljs';
const path = process.cwd();
import chalk from 'chalk';
import * as messages from '../utils/messages.js';
import { links } from '../utils/links.js';

export function mkdirAndClone(fmName) {
    shell.exec(`mkdir ${fmName}`);
    console.log(chalk.green(`cloning ${fmName} from The Repo 🚀`));
    shell.exec(`git clone ${links.get(fmName)} ${fmName}`);
    shell.cd(`${path}/${fmName}`);
    console.log(chalk.green('🚀 Installing dependencies'));
}

export function cleaner() {
    shell.rm('-rf', '.git');
    shell.rm('-rf', '.github');
    shell.cd(`..`);
}

export function backendInstaller(fmName) {
    if (fmName === 'Fastify' || fmName === 'ExpressJs' || fmName === 'NestJs' || fmName === 'AdonisJs') {
        mkdirAndClone(fmName);
        shell.exec(`npm i`);
        cleaner();
    } else if (fmName === 'Laravel') {
        mkdirAndClone(fmName);
        shell.exec(`composer install`);
        shell.exec(`npm i`);
        cleaner();

    } else if ( fmName === "Django" ) {
        mkdirAndClone(fmName);
        shell.exec(`python -m venv venv`);
        shell.exec(`source venv/bin/activate`);
        shell.exec(`pip install -r requirements.txt`);
        shell.exec(`python manage.py migrate`);
        cleaner()
    } else if ( fmName === "Spring Boot" ) {
        mkdirAndClone(fmName);
        shell.exec(`mvn clean install`);
        cleaner()
    } else if ( fmName === "DotNet" ) {
        mkdirAndClone(fmName);
        cleaner()
    } else {
        console.log(chalk.yellow("You look like you have a backend framework installed already"));
    }

}

export function frontEndInstaller(fmName) {
    mkdirAndClone(fmName);
    shell.exec(`npm i`);
    messages.goodBye();
    cleaner();
}

export function mobileInstaller(fmName) {
    mkdirAndClone(fmName);
    messages.goodBye();
    cleaner()
}