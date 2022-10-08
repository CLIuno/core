import chalk from 'chalk';
export function goodBye() {
    console.log(chalk.green('📦 Successfully installed all the required dependencies\nHappy hacking 🚀'));
    console.log(chalk.green('\nMade with ❤️  by @ru44'));
    console.log(chalk.bgGreen("Please donate to the project if you like it ❤️ ."));
}

export function withoutDepend() {
    console.log(chalk.red('📦 No dependencies to install\nHappy hacking 🚀'));
    console.log(chalk.green('\nMade with ❤️  by @ru44'));
    console.log(chalk.bgGreen("Please donate to the project if you like it ❤️ ."));
}