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
    shell.exec(`npm i`);
    shell.rm('-rf', '.git');
    shell.rm('-rf', '.github');
    shell.cd(`..`);
}

export function backendInstaller(fmName) {
    if (fmName === 'Fastify' || fmName === 'ExpressJs' || fmName === 'NestJs' || fmName === 'AdonisJs') {
        mkdirAndClone(fmName);
        cleaner();
    } else if (fmName === 'Laravel') {
        mkdirAndClone(fmName);
        shell.exec(`composer install`);
        cleaner();

    } else if ( fmName === "Django" ) {
        mkdirAndClone(fmName);
        shell.exec(`pip install -r requirements.txt`);
        cleaner()
    }
     else {
        console.log(chalk.red('🚧 This feature is not available yet 🚧'));
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