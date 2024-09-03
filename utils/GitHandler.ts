import shell from 'shelljs'
import chalk from 'chalk'
import * as messages from './messages'
import { links } from './links'

const PATH = process.cwd()

function runCommands(commands: string[]) {
    commands.forEach((command) => shell.exec(command))
}

export function mkdirAndClone(frameworkName: string) {
    console.log(chalk.green(`cloning ${frameworkName} from The Repo 🚀`))
    shell.exec(`git clone ${links.get(frameworkName)} ${frameworkName}_project`)
    shell.cd(`${PATH}/${frameworkName}_project`)
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
    Django: ['pip3 install Poetry', `cd ${PATH}/Django_project && Poetry init && Poetry add Django`],
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
