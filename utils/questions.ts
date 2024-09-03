export const questions = {
    DesignPattern: {
        type: 'list',
        name: 'Design Pattern',
        message: 'Choose the Design Pattern you want to use:',
        choices: ['MVC', 'RESTful API']
    },
    Run: {
        type: 'confirm',
        name: 'RunProject',
        message: 'Do you want to run the project?'
    },
    MVC: {
        type: 'list',
        name: 'MVC',
        message: 'Choose the MVC framework which you want to use:',
        choices: ['TallStack', 'DjangoMTV']
    },

    RestApiWebsite: {
        type: 'list',
        name: 'frontend',
        message: 'Choose the front framework which you want to use:',
        choices: ['VueJs', 'NuxtJs', 'ReactJs', 'NextJs', 'Angular', 'Svelte']
    },

    RestApiMobile: {
        type: 'list',
        name: 'mobile',
        message: '( Only Flutter is available for now ):',
        choices: ['Flutter']
    },

    RestApiFrontend: {
        type: 'list',
        name: 'typeOfFrontend',
        message: 'is it a mobile App or Website:',
        choices: ['Website', 'Mobile', 'Without Frontend']
    },

    RestApiBackend: {
        type: 'list',
        name: 'backend',
        message: 'Choose the backend framework which you want to use:',
        choices: [
            'ExpressJs',
            'NestJs',
            'AdonisJs',
            'Fastify',
            'Django',
            'Laravel',
            'Spring Boot',
            'ASP.NET',
            'Without Backend'
        ]
    },

    PackageManager: {
        type: 'list',
        name: 'packageManager',
        message: 'Choose the package manager which you are using:',
        choices: ['npm', 'yarn']
    },

    Database: {
        type: 'list',
        name: 'database',
        message: 'Choose the database which you want to use:',
        choices: ['MongoDB', 'SQLite']
    }
}
