import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { oxfmt } from "./shared";

// The Fastify template keeps every TypeORM entity in src/entities.ts and lists them in
// src/db.ts, so "model" is a pair of patches rather than a new file. Routes are one plugin
// per resource in src/routes/<plural>.routes.ts, registered in src/app.ts.

const COLUMN: Record<FieldType, string> = {
    string: "text",
    text: "text",
    int: "integer",
    number: "real",
    boolean: "boolean",
    date: "datetime",
    json: "simple-json",
};

const TS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "number",
    number: "number",
    boolean: "boolean",
    date: "Date",
    json: "Record<string, unknown>",
};

/** Wire type of a field in a request body (dates travel as ISO strings). */
const BODY: Record<FieldType, string> = { ...TS, date: "string" };

/** "due_date" → "Due date" for messages. */
function human(f: Field): string {
    const words = f.snake.replace(/_/g, " ");
    return words.charAt(0).toUpperCase() + words.slice(1);
}

function column(f: Field): string {
    const type = f.nullable ? `${TS[f.type]} | null` : TS[f.type];
    if (f.type === "boolean") {
        const opts = f.nullable ? "nullable: true" : "default: false";
        return `    @Column({ type: 'boolean', ${opts} })\n    ${f.snake}: ${type}\n`;
    }
    const opts = f.nullable ? ", { nullable: true }" : "";
    return `    @Column('${COLUMN[f.type]}'${opts})\n    ${f.snake}: ${type}\n`;
}

function entityClass(ctx: Ctx): string {
    const { names, fields } = ctx;
    return `@Entity('${names.plural.pascal}')
export class ${names.pascal} {
    @PrimaryGeneratedColumn('uuid')
    id: string

${fields.map(column).join("\n")}
    @CreateDateColumn()
    createdAt: Date

    @UpdateDateColumn()
    updatedAt: Date

    @ManyToOne(() => User, { nullable: false })
    @JoinColumn({ name: 'user_id' })
    user: User
}`;
}

function requiredGuard(f: Field): string {
    const check =
        f.type === "string" || f.type === "text"
            ? `!${f.snake}`
            : `${f.snake} === undefined || ${f.snake} === null`;
    return `        if (${check}) {
            return reply.status(400).send({ status: 'error', message: '${human(f)} is required' })
        }`;
}

function createValue(f: Field): string {
    if (f.type === "date") {
        return f.nullable ? `${f.snake} ? new Date(${f.snake}) : null` : `new Date(${f.snake})`;
    }
    if (f.type === "boolean" && !f.nullable) return `${f.snake} ?? false`;
    return f.nullable ? `${f.snake} ?? null` : f.snake;
}

function updateLine(f: Field, one: string): string {
    const value =
        f.type === "date"
            ? f.nullable
                ? `${f.snake} ? new Date(${f.snake}) : null`
                : `new Date(${f.snake})`
            : f.snake;
    return `        if (${f.snake} !== undefined) ${one}.${f.snake} = ${value}`;
}

function routes(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    const plain = names.plural.kebab.replace(/-/g, " ");
    const destructure = fields.map((f) => f.snake).join(", ");
    const bodyType = fields
        .map((f) => `    ${f.snake}?: ${BODY[f.type]}${f.nullable ? " | null" : ""}`)
        .join("\n");
    const guards = fields
        .filter((f) => !f.nullable && f.type !== "boolean")
        .map(requiredGuard)
        .join("\n");
    const assign = fields.map((f) => `            ${f.snake}: ${createValue(f)},`).join("\n");
    const updates = fields.map((f) => updateLine(f, one)).join("\n");

    return {
        path: `src/routes/${names.plural.kebab}.routes.ts`,
        content: `import type { FastifyInstance } from 'fastify'

import { authenticate } from '../auth'
import { db } from '../db'
import { ${P}, User } from '../entities'

type ${P}Body = {
${bodyType}
}

export default async function ${one}Routes(app: FastifyInstance) {
    const ${many} = () => db.getRepository(${P})
    app.addHook('preHandler', authenticate)

    app.get('/', async (_request, reply) => {
        const all = await ${many}().find({ relations: ['user'], order: { createdAt: 'DESC' } })
        return reply.send({ status: 'success', data: { ${many}: all } })
    })

    app.get('/current-user', async (request, reply) => {
        const mine = await ${many}().find({
            where: { user: { id: request.user.id } },
            relations: ['user'],
            order: { createdAt: 'DESC' },
        })
        return reply.send({ status: 'success', data: { ${many}: mine } })
    })

    app.post('/', async (request, reply) => {
        const { ${destructure} } = (request.body ?? {}) as ${P}Body
${guards ? `${guards}\n` : ""}        const user = await db.getRepository(User).findOneBy({ id: request.user.id })
        if (!user) {
            return reply.status(404).send({ status: 'error', message: 'User not found' })
        }

        const ${one} = ${many}().create({
${assign}
            user,
        })
        const saved = await ${many}().save(${one})
        return reply.status(201).send({
            status: 'success',
            message: '${title} created successfully',
            data: { ${one}: saved },
        })
    })

    app.get('/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const ${one} = await ${many}().findOne({ where: { id }, relations: ['user'] })
        if (!${one}) {
            return reply.status(404).send({ status: 'error', message: '${title} not found' })
        }
        return reply.send({ status: 'success', data: { ${one} } })
    })

    app.patch('/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const ${one} = await ${many}().findOne({ where: { id }, relations: ['user'] })
        if (!${one}) {
            return reply.status(404).send({ status: 'error', message: '${title} not found' })
        }
        if (${one}.user.id !== request.user.id) {
            return reply
                .status(403)
                .send({ status: 'error', message: 'You can only update your own ${plain}' })
        }
        const { ${destructure} } = (request.body ?? {}) as ${P}Body
${updates}
        await ${many}().save(${one})
        return reply.send({ status: 'success', message: '${title} updated', data: { ${one} } })
    })

    app.delete('/:id', async (request, reply) => {
        const { id } = request.params as { id: string }
        const ${one} = await ${many}().findOne({ where: { id }, relations: ['user'] })
        if (!${one}) {
            return reply.status(404).send({ status: 'error', message: '${title} not found' })
        }
        if (${one}.user.id !== request.user.id) {
            return reply
                .status(403)
                .send({ status: 'error', message: 'You can only delete your own ${plain}' })
        }
        await ${many}().remove(${one})
        return reply.send({ status: 'success', message: '${title} deleted successfully' })
    })
}
`,
    };
}

function sample(f: Field, variant: 0 | 1): string {
    const label = f.snake.replace(/_/g, " ");
    const values: Record<FieldType, [string, string]> = {
        string: [`'Sample ${label}'`, `'Updated ${label}'`],
        text: [`'Sample ${label}'`, `'Updated ${label}'`],
        int: ["1", "2"],
        number: ["1.5", "2.5"],
        boolean: ["false", "true"],
        date: ["'2026-01-01T00:00:00.000Z'", "'2026-02-01T00:00:00.000Z'"],
        json: ["{ key: 'value' }", "{ key: 'updated' }"],
    };
    return values[f.type][variant];
}

function test(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const prefix = `/api/v1/${names.plural.kebab}`;
    const payload = fields.map((f) => `        ${f.snake}: ${sample(f, 0)},`).join("\n");
    // Compare a scalar field after the update (dates and json round-trip differently).
    const scalar = fields.find((f) => f.type !== "date" && f.type !== "json");
    const updatePayload = scalar ? `{ ${scalar.snake}: ${sample(scalar, 1)} }` : "{}";
    const updateAssert = scalar
        ? `\n    assert.equal(updated.json().data.${one}.${scalar.snake}, ${sample(scalar, 1)})`
        : "";
    const createAssert = scalar
        ? `\n    assert.equal(${one}.${scalar.snake}, sample.${scalar.snake})`
        : "";

    return {
        path: `src/__tests__/${names.kebab}.test.ts`,
        content: `// Run with: DB_FILE=:memory: node --import tsx --test src/__tests__/${names.kebab}.test.ts
// (without DB_FILE it uses the dev db.sqlite and cleans up after itself)
import assert from 'node:assert/strict'
import { after, before, test } from 'node:test'
import Fastify from 'fastify'

import { signToken } from '../auth'
import { db } from '../db'
import { ${P}, User } from '../entities'
import ${one}Routes from '../routes/${names.plural.kebab}.routes'

const app = Fastify()
const stamp = Date.now()
let token = ''
let userId = ''

before(async () => {
    if (!db.isInitialized) await db.initialize()
    const users = db.getRepository(User)
    const user = await users.save(
        users.create({
            username: \`${names.kebab}-tester-\${stamp}\`,
            first_name: '${P}',
            last_name: 'Tester',
            email: \`${names.kebab}-tester-\${stamp}@example.com\`,
            password: 'not-a-real-hash',
        }),
    )
    userId = user.id
    token = signToken(user)
    await app.register(${one}Routes, { prefix: '${prefix}' })
    await app.ready()
})

after(async () => {
    await app.close()
    await db
        .getRepository(${P})
        .createQueryBuilder()
        .delete()
        .where('user_id = :userId', { userId })
        .execute()
    await db.getRepository(User).delete({ id: userId })
    await db.destroy()
})

test('${many}: create, list, read, update, delete', async () => {
    const headers = { authorization: \`Bearer \${token}\` }
    const sample = {
${payload}
    }

    const created = await app.inject({ method: 'POST', url: '${prefix}', headers, payload: sample })
    assert.equal(created.statusCode, 201)
    const { ${one} } = created.json().data
    assert.ok(${one}.id)${createAssert}

    const listed = await app.inject({ method: 'GET', url: '${prefix}/current-user', headers })
    assert.equal(listed.statusCode, 200)
    assert.ok(listed.json().data.${many}.some((item: { id: string }) => item.id === ${one}.id))

    const fetched = await app.inject({ method: 'GET', url: \`${prefix}/\${${one}.id}\`, headers })
    assert.equal(fetched.statusCode, 200)
    assert.equal(fetched.json().data.${one}.id, ${one}.id)

    const updated = await app.inject({
        method: 'PATCH',
        url: \`${prefix}/\${${one}.id}\`,
        headers,
        payload: ${updatePayload},
    })
    assert.equal(updated.statusCode, 200)${updateAssert}

    const removed = await app.inject({ method: 'DELETE', url: \`${prefix}/\${${one}.id}\`, headers })
    assert.equal(removed.statusCode, 200)

    const gone = await app.inject({ method: 'GET', url: \`${prefix}/\${${one}.id}\`, headers })
    assert.equal(gone.statusCode, 404)
})

test('${many}: rejects requests without a Bearer token', async () => {
    const response = await app.inject({ method: 'GET', url: '${prefix}' })
    assert.equal(response.statusCode, 401)
})
`,
    };
}

function registerEntity(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const P = names.pascal;
    return [
        {
            path: "src/entities.ts",
            // last top-level closing brace → append the class at the end of the file
            anchor: /^}$/m,
            where: "after",
            insert: `\n\n${entityClass(ctx)}`,
            skipIf: `export class ${P} {`,
            describe: `add the ${P} entity`,
        },
        {
            path: "src/db.ts",
            anchor: /^import \{[^}]*\} from '\.\/entities'$/m,
            where: "after",
            insert: `\nimport { ${P} } from './entities'`,
            skipIf: `{ ${P} }`,
            describe: `import ${P} into the data source`,
        },
        {
            path: "src/db.ts",
            anchor: "entities: [",
            where: "after",
            insert: `${P}, `,
            skipIf: `${P},`,
            describe: `register ${P} in the DataSource entities`,
        },
    ];
}

function registerRoutes(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const plugin = `${names.camel}Routes`;
    const file = `./routes/${names.plural.kebab}.routes`;
    return [
        {
            path: "src/app.ts",
            anchor: /^import \w+ from '\.\/routes\/[\w.-]+'$/m,
            where: "after",
            insert: `\nimport ${plugin} from '${file}'`,
            skipIf: `${file}'`,
            describe: `import the ${names.plural.kebab} routes`,
        },
        {
            path: "src/app.ts",
            anchor: /^ *await app\.register\(\w+, \{ prefix: `\$\{prefix\}\/[\w-]+` \}\)$/m,
            where: "after",
            insert: `\n    await app.register(${plugin}, { prefix: \`\${prefix}/${names.plural.kebab}\` })`,
            skipIf: `\${prefix}/${names.plural.kebab}\``,
            describe: `register /${names.plural.kebab}`,
        },
    ];
}

export const fastify: Generator = {
    id: "fastify",
    label: "Fastify",
    kind: "backend",
    format: oxfmt,
    commands: {
        resource: {
            describe:
                "entity (appended to src/entities.ts) + route plugin (mounted under /api/v1/<plural>) + node:test spec",
            files: (ctx) => [routes(ctx), test(ctx)],
            patches: (ctx) => [...registerEntity(ctx), ...registerRoutes(ctx)],
            notes: (ctx) => [
                `TypeORM synchronize is on — restart the dev server and the ${ctx.names.plural.pascal} table appears.`,
                `Run the test with: DB_FILE=:memory: node --import tsx --test src/__tests__/${ctx.names.kebab}.test.ts`,
            ],
        },
        model: {
            describe: "TypeORM entity appended to src/entities.ts and registered in src/db.ts",
            patches: registerEntity,
            notes: (ctx) => [
                `Import { ${ctx.names.pascal} } from '../entities' wherever you need the repository.`,
            ],
        },
        controller: {
            describe:
                "route plugin in src/routes/ using the {status, message, data} envelope (registered in src/app.ts)",
            files: (ctx) => [routes(ctx)],
            patches: registerRoutes,
            notes: (ctx) => [
                `The plugin expects a ${ctx.names.pascal} entity — run make:model ${ctx.names.pascal} if it does not exist yet.`,
            ],
        },
        test: {
            describe: "node:test spec in src/__tests__/ that drives the routes through app.inject",
            files: (ctx) => [test(ctx)],
            notes: (ctx) => [
                `Run with: DB_FILE=:memory: node --import tsx --test src/__tests__/${ctx.names.kebab}.test.ts`,
            ],
        },
    },
};
