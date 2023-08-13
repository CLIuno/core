import chalk from 'chalk'

export function goodBye() {
    console.log(chalk.green('📦 Successfully installed all the required dependencies \n Happy hacking 🚀'))
    console.log(chalk.green('\n Made with ❤️  by @ru44'))
    console.log(chalk.bgGreen('\n Please donate to the project if you like it ❤️ .'))
}

export function withoutDepend() {
    console.log(chalk.red('📦 No dependencies to install \n Happy hacking 🚀'))
    console.log(chalk.green('\n Made with ❤️  by @ru44'))
}
