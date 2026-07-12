export const questions = {
    DesignPattern: {
        message: "Choose the Design Pattern you want to use:",
        choices: [
            { name: "MVC", value: "MVC" },
            { name: "RESTful API", value: "RESTful API" },
            { name: "Doctor 🩺", value: "Doctor 🩺" },
        ],
    },
    Run: {
        message: "Do you want to run the project?",
    },
    MVC: {
        message: "Choose the MVC framework which you want to use:",
        choices: [
            { name: "TallStack", value: "TallStack" },
            { name: "DjangoMTV", value: "DjangoMTV" },
        ],
    },

    RestApiWebsite: {
        message: "Choose the front framework which you want to use:",
        choices: [
            { name: "VueJs", value: "VueJs" },
            { name: "NuxtJs", value: "NuxtJs" },
            { name: "ReactJs", value: "ReactJs" },
            { name: "NextJs", value: "NextJs" },
            { name: "Angular", value: "Angular" },
            { name: "Svelte", value: "Svelte" },
            { name: "SolidJs", value: "SolidJs" },
        ],
    },

    RestApiMobile: {
        message: "( Only Flutter is available for now ):",
        choices: [{ name: "Flutter", value: "Flutter" }],
    },

    RestApiFrontend: {
        message: "is it a mobile App or Website:",
        choices: [
            { name: "Website", value: "Website" },
            { name: "Mobile", value: "Mobile" },
            { name: "Without Frontend", value: "Without Frontend" },
        ],
    },

    RestApiBackend: {
        message: "Choose the backend framework which you want to use:",
        choices: [
            { name: "ExpressJs", value: "ExpressJs" },
            { name: "NestJs", value: "NestJs" },
            { name: "AdonisJs", value: "AdonisJs" },
            { name: "Fastify", value: "Fastify" },
            { name: "Django", value: "Django" },
            { name: "FastAPI", value: "FastAPI" },
            { name: "Rails", value: "Rails" },
            { name: "Laravel", value: "Laravel" },
            { name: "Spring Boot", value: "Spring Boot" },
            { name: "ASP.NET", value: "ASP.NET" },
            { name: "Without Backend", value: "Without Backend" },
        ],
    },

    PackageManager: {
        message: "Choose the package manager which you are using:",
        choices: [
            { name: "npm", value: "npm" },
            { name: "yarn", value: "yarn" },
            { name: "pnpm", value: "pnpm" },
            { name: "bun", value: "bun" },
            { name: "deno", value: "deno" },
        ],
    },

    Database: {
        message: "Choose the database which you want to use:",
        choices: [
            { name: "MongoDB", value: "MongoDB" },
            { name: "SQLite", value: "SQLite" },
        ],
    },
};
