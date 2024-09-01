import shell from 'shelljs'
import chalk from 'chalk'
import * as messages from './messages'
import { links } from './links'

const PATH = process.cwd()

function runCommands(commands: string[]) {
    commands.forEach((command) => shell.exec(command))
}

export function mkdirAndClone(frameworkName: string) {
    shell.exec(`mkdir ${frameworkName}`)
    console.log(chalk.green(`cloning ${frameworkName} from The Repo 🚀`))
    shell.exec(`git clone ${links.get(frameworkName)} ${frameworkName}`)
    shell.cd(`${PATH}/${frameworkName}`)
    console.log(chalk.green('🚀 Installing dependencies'))
}

export function cleaner() {
    shell.rm('-rf', '.git')
    shell.rm('-rf', '.github')
    shell.cd(`..`)
}

const backendCommands: { [key: string]: string[] } = {
    Fastify: ['npm i'],
    ExpressJs: ['npm i'],
    NestJs: ['npm i'],
    AdonisJs: ['npm i'],
    Laravel: ['composer install', 'npm i'],
    Django: [
        'python -m venv venv',
        'source venv/bin/activate',
        'pip install -r requirements.txt',
        'python manage.py migrate'
    ],
    'Spring Boot': ['mvn clean install'],
    'ASP.NET': []
}

export function backendInstaller(frameworkName: string) {
    if (backendCommands[frameworkName]) {
        mkdirAndClone(frameworkName)
        runCommands(backendCommands[frameworkName])
        cleaner()
    } else {
        console.log(chalk.yellow('You look like you have a backend framework installed already'))
    }
}

export function frontEndInstaller(frameworkName: string) {
    mkdirAndClone(frameworkName)
    shell.exec(`npm i`)
    messages.goodBye()
    cleaner()
}

export function mobileInstaller(frameworkName: string) {
    mkdirAndClone(frameworkName)
    messages.goodBye()
    cleaner()
}
