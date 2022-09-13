const questions = [
    {
        type: 'list',
        name: 'Design Pattern',
        message: 'Choose the Design Pattern you want to use:',
        choices: ['MVC', 'RESTful API'],
    },
    {
        type: 'list',
        name: 'frontend',
        message: 'Choose the front framework which you want to use:',
        choices: ['VueJs', 'NuxtJS', 'React', 'NextJS', 'Angular', 'Svelte'],
    }, {
        type: 'list',
        name: 'packageManager',
        message: 'Choose the package manager which you are using:',
        choices: ['npm', 'yarn'],
    },
    {
        type: 'list',
        name: 'backend',
        message: 'Choose the backend framework which you want to use:',
        choices: ['Express', 'NestJS', 'AdonisJS', 'Fastify', 'Django', 'Laravel', 'Spring Boot', 'Dotnet Core',],
    },
    {
        type: 'list',
        name: 'database',
        message: 'Choose the database which you want to use:',
        choices: ['MongoDB', 'MySQL', 'PostgreSQL', 'SQLite', 'MariaDB'],
    }
];

const questionsTs = [
    {
        type: 'list',
        name: 'typescript',
        message: 'Do you want to use typescript?',
        choices: ['Yes', 'No'],
    }
];

const _questions = questions;
export { _questions as questions };
const _questionsTs = questionsTs;
export { _questionsTs as questionsTs };
