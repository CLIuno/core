import shell from 'shelljs';
const path = process.cwd();
import chalk from 'chalk';
import { links } from '../utils/links.js';



export function frontEndInstall(fmName) {
    shell.exec(`mkdir ${fmName}`);
    console.log(chalk.green('cloning the backend project from GitHub 🚀'));
    shell.exec(`git clone ${links.get(fmName)} ${fmName}`);
    shell.cd(`${path}/${fmName}`);
    console.log(chalk.green('🚀 Installing dependencies'));
    shell.exec(`npm i`);
    console.log(chalk.green('📦 Successfully installed all the required dependencies\nHappy hacking 🚀'));
    console.log(chalk.green('\nMade with ❤️  by @ru44'));
    shell.rm('-rf', '.git');
    shell.rm('-rf', '.github');
    shell.cd(`..`);
}