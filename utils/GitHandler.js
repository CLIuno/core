import shell from 'shelljs';

const path = process.cwd();
import chalk from 'chalk';
import * as messages from '../utils/messages.js';
import { links } from './links.js';

export function mkdirAndClone(fmName) {
    console.log(chalk.green(`cloning ${fmName} from The Repo 🚀`));
    shell.exec(`git clone ${links.get(fmName)} ${fmName}_project`);
    shell.cd(`${path}/${fmName}_project`);
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
    } else if (fmName === 'Django') {
        mkdirAndClone(fmName);
        shell.exec(`pip3 install Poetry`);
        shell.exec(`cd ${path}/${fmName}_project && Poetry init && Poetry add Django`);
        cleaner();
    } else if (fmName === 'Spring Boot') {
        mkdirAndClone(fmName);
        shell.exec(`mvn clean install`);
        cleaner();
    } else if (fmName === 'ASP.NET') {
        mkdirAndClone(fmName);
        cleaner();
    } else {
        console.log(chalk.yellow('You look like you have a backend framework installed already'));
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
    cleaner();
}
