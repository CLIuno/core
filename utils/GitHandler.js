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

export function backendInstall(fmName) {
    if (fmName === 'Fastify' || fmName === 'ExpressJs' || fmName === 'NestJs' || fmName === 'AdonisJs') {
        mkdirAndClone(fmName);
        shell.exec(`npm i`);
        messages.goodBye();
        shell.rm('-rf', '.git');
        shell.rm('-rf', '.github');
        shell.cd(`..`);
    } else if (fmName === 'Laravel') {
        mkdirAndClone(fmName);
        shell.exec(`composer install`);
        messages.goodBye();
        shell.rm('-rf', '.git');
        shell.rm('-rf', '.github');
        shell.cd(`..`);
    } else {
        console.log(chalk.red('🚧 This feature is not available yet 🚧'));
    }

}

export function frontEndInstall(fmName) {
    mkdirAndClone(fmName);
    shell.exec(`npm i`);
    messages.goodBye();
    shell.rm('-rf', '.git');
    shell.rm('-rf', '.github');
    shell.cd(`..`);
}