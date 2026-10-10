import type { Generator } from "../types";
import type { StackId } from "../detect";
import { express } from "./express";
import { fastify } from "./fastify";
import { nest } from "./nest";
import { adonis } from "./adonis";
import { django } from "./django";
import { fastapi } from "./fastapi";
import { laravel } from "./laravel";
import { tallstack } from "./tallstack";
import { rails } from "./rails";
import { spring } from "./spring";
import { aspnet } from "./aspnet";
import { drogon } from "./drogon";
import { axum } from "./axum";
import { react } from "./react";
import { next } from "./next";
import { vue } from "./vue";
import { nuxt } from "./nuxt";
import { svelte } from "./svelte";
import { solid } from "./solid";
import { angular } from "./angular";
import { flutter } from "./flutter";
import { reactnative } from "./reactnative";

export const generators: Record<StackId, Generator> = {
    express,
    fastify,
    nest,
    adonis,
    django,
    fastapi,
    laravel,
    tallstack,
    rails,
    spring,
    aspnet,
    drogon,
    axum,
    react,
    next,
    vue,
    nuxt,
    svelte,
    solid,
    angular,
    flutter,
    reactnative,
};
