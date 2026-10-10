import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { oxfmt } from "./shared";

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

function column(f: Field): string {
    const opts: string[] = [];
    if (f.nullable) opts.push("nullable: true");
    if (f.type === "boolean" && !f.nullable) opts.push("default: false");
    const options = opts.length ? `, { ${opts.join(", ")} }` : "";
    return `    @Column('${COLUMN[f.type]}'${options})\n    ${f.camel}: ${TS[f.type]}\n`;
}

function entity(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: `src/entities/${names.kebab}.entity.ts`,
        content: `import {
    Entity,
    Column,
    PrimaryGeneratedColumn,
    ManyToOne,
    JoinColumn,
    CreateDateColumn,
    UpdateDateColumn,
} from 'typeorm'

import { User } from './user.entity'

@Entity('${names.plural.pascal}')
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
}
`,
    };
}

function controller(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const required = fields.filter((f) => !f.nullable);
    const label = labelField(fields);
    const destructure = fields.map((f) => f.camel).join(", ");
    const requiredGuard = required
        .map(
            (
                f,
            ) => `            if (${f.camel} === undefined || ${f.camel} === null${f.type === "string" || f.type === "text" ? ` || ${f.camel} === ''` : ""}) {
                res.status(400).json({ status: 'error', message: '${f.pascal} is required' })
                return
            }`,
        )
        .join("\n");
    const assign = fields.map((f) => `                ${f.camel},`).join("\n");
    const updates = fields
        .map(
            (f) =>
                `            if (${f.camel} !== undefined) ${names.camel}.${f.camel} = ${f.camel}`,
        )
        .join("\n");
    const one = names.camel;
    const many = names.plural.camel;
    const P = names.pascal;
    const title = names.title;
    const titles = names.plural.title;

    return {
        path: `src/controllers/${names.kebab}.controller.ts`,
        content: `import { Request, Response } from 'express'

import { myDataSource } from '@/database/app-data-source'
import { ${P} } from '@/entities/${names.kebab}.entity'
import { User } from '@/entities/user.entity'
import logThisError from '@/helpers/error-logger'

export const ${P}Controller = {
    getAll: async (req: Request, res: Response): Promise<void> => {
        try {
            const ${many} = await myDataSource.getRepository(${P}).find({
                relations: { user: true },
                order: { createdAt: 'DESC' },
            })
            res.status(200).json({
                status: 'success',
                message: '${titles} fetched successfully',
                data: { ${many} },
            })
        } catch (error) {
            logThisError(error)
            res.status(500).json({ status: 'error', message: 'Internal server error' })
        }
    },

    getById: async (req: Request, res: Response): Promise<void> => {
        try {
            const ${one} = await myDataSource.getRepository(${P}).findOne({
                where: { id: req.params.id as string },
                relations: { user: true },
            })
            if (!${one}) {
                res.status(404).json({ status: 'error', message: '${title} not found' })
                return
            }
            res.status(200).json({
                status: 'success',
                message: '${title} fetched successfully',
                data: { ${one} },
            })
        } catch (error) {
            logThisError(error)
            res.status(500).json({ status: 'error', message: 'Internal server error' })
        }
    },

    getCurrentUser${names.plural.pascal}: async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = (req as any).user.id
            const ${many} = await myDataSource.getRepository(${P}).find({
                where: { user: { id: userId } },
                relations: { user: true },
                order: { createdAt: 'DESC' },
            })
            res.status(200).json({
                status: 'success',
                message: '${titles} fetched successfully',
                data: { ${many} },
            })
        } catch (error) {
            logThisError(error)
            res.status(500).json({ status: 'error', message: 'Internal server error' })
        }
    },

    create: async (req: Request, res: Response): Promise<void> => {
        try {
            const { ${destructure} } = req.body
            const userId = (req as any).user.id

${requiredGuard}

            const user = await myDataSource.getRepository(User).findOneBy({ id: userId })
            if (!user) {
                res.status(404).json({ status: 'error', message: 'User not found' })
                return
            }

            const ${one} = myDataSource.getRepository(${P}).create({
${assign}
                user,
            })
            const result = await myDataSource.getRepository(${P}).save(${one})

            res.status(201).json({
                status: 'success',
                message: '${title} created successfully',
                data: { ${one}: result },
            })
        } catch (error) {
            logThisError(error)
            res.status(500).json({ status: 'error', message: 'Internal server error' })
        }
    },

    update: async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = (req as any).user.id
            const ${one} = await myDataSource.getRepository(${P}).findOne({
                where: { id: req.params.id as string },
                relations: { user: true },
            })

            if (!${one}) {
                res.status(404).json({ status: 'error', message: '${title} not found' })
                return
            }

            if (${one}.user.id !== userId) {
                res.status(403).json({
                    status: 'error',
                    message: 'You can only update your own ${names.plural.kebab.replace(/-/g, " ")}',
                })
                return
            }

            const { ${destructure} } = req.body
${updates}

            await myDataSource.getRepository(${P}).save(${one})
            res.status(200).json({
                status: 'success',
                message: '${title} updated successfully',
                data: { ${one} },
            })
        } catch (error) {
            logThisError(error)
            res.status(500).json({ status: 'error', message: 'Internal server error' })
        }
    },

    delete: async (req: Request, res: Response): Promise<void> => {
        try {
            const userId = (req as any).user.id
            const ${one} = await myDataSource.getRepository(${P}).findOne({
                where: { id: req.params.id as string },
                relations: { user: true },
            })

            if (!${one}) {
                res.status(404).json({ status: 'error', message: '${title} not found' })
                return
            }

            if (${one}.user.id !== userId) {
                res.status(403).json({
                    status: 'error',
                    message: 'You can only delete your own ${names.plural.kebab.replace(/-/g, " ")}',
                })
                return
            }

            await myDataSource.getRepository(${P}).remove(${one})
            res.status(200).json({ status: 'success', message: '${title} deleted successfully' })
        } catch (error) {
            logThisError(error)
            res.status(500).json({ status: 'error', message: 'Internal server error' })
        }
    },
}
// ${label.camel} is the display field used by the frontends' list pages.
`,
    };
}

function router(ctx: Ctx): FileSpec {
    const { names } = ctx;
    return {
        path: `src/routers/v1/${names.kebab}.router.ts`,
        content: `import { Router } from 'express'

import { ${names.pascal}Controller } from '@/controllers/${names.kebab}.controller'
import { ensureAuthenticated } from '@/middlewares/auth.middleware'

const router: Router = Router()

router.use(ensureAuthenticated)

// CRUD operations
router.get('/current-user', ${names.pascal}Controller.getCurrentUser${names.plural.pascal})
router.get('/', ${names.pascal}Controller.getAll)
router.get('/:id', ${names.pascal}Controller.getById)
router.post('/', ${names.pascal}Controller.create)
router.patch('/:id', ${names.pascal}Controller.update)
router.delete('/:id', ${names.pascal}Controller.delete)

export default router
`,
    };
}

function validator(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const JOI: Record<FieldType, string> = {
        string: "Joi.string()",
        text: "Joi.string().allow('')",
        int: "Joi.number().integer()",
        number: "Joi.number()",
        boolean: "Joi.boolean()",
        date: "Joi.date()",
        json: "Joi.object()",
    };
    const rules = fields
        .map((f) => `    ${f.camel}: ${JOI[f.type]}${f.nullable ? ".allow(null)" : ".required()"},`)
        .join("\n");
    return {
        path: `src/validators/${names.kebab}.validator.ts`,
        content: `import { Request } from 'express'
import Joi from 'joi'

const schema = Joi.object({
${rules}
})

export async function Validate${names.pascal}(req: Request) {
    try {
        await schema.validateAsync(req.body)
    } catch (error: any) {
        const statusCode = error.isJoi ? 400 : 500
        throw {
            statusCode,
            message: error.details ? error.details[0].message : 'Internal server error',
        }
    }
}
`,
    };
}

function spec(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const sample = fields
        .map((f) => {
            const value: Record<FieldType, string> = {
                string: `'Sample ${f.name}'`,
                text: `'Sample ${f.name}'`,
                int: "1",
                number: "1.5",
                boolean: "false",
                date: "new Date().toISOString()",
                json: "{}",
            };
            return `        ${f.camel}: ${value[f.type]},`;
        })
        .join("\n");
    return {
        path: `src/__tests__/${names.kebab}.spec.ts`,
        content: `import { ${names.pascal} } from '@/entities/${names.kebab}.entity'

describe('${names.pascal} entity', () => {
    test('has the generated fields', () => {
        const ${names.camel} = Object.assign(new ${names.pascal}(), {
${sample}
        })
${fields.map((f) => `        expect(${names.camel}.${f.camel}).toBeDefined()`).join("\n")}
    })
})
`,
    };
}

function registerRoute(ctx: Ctx): Patch[] {
    const { names } = ctx;
    return [
        {
            path: "src/routers/index.ts",
            anchor: /^import \w+ from '\.\/v1\/[\w.-]+'$/m,
            where: "after",
            insert: `\nimport ${names.camel}Router from './v1/${names.kebab}.router'`,
            skipIf: `./v1/${names.kebab}.router`,
            describe: `import the ${names.kebab} router`,
        },
        {
            path: "src/routers/index.ts",
            anchor: "// Export the main router",
            where: "before",
            insert: `// ${names.plural.title} Router\nrouter.use('/${names.plural.kebab}', ${names.camel}Router)\n\n`,
            skipIf: `router.use('/${names.plural.kebab}'`,
            describe: `mount /${names.plural.kebab}`,
        },
    ];
}

export const express: Generator = {
    id: "express",
    format: oxfmt,
    label: "Express",
    kind: "backend",
    commands: {
        resource: {
            describe:
                "entity + controller + router (mounted under /api/v1/<plural>) + validator + jest spec",
            files: (ctx) => [entity(ctx), controller(ctx), router(ctx), validator(ctx), spec(ctx)],
            patches: registerRoute,
            notes: (ctx) => [
                `TypeORM synchronize is on — restart the dev server and the ${names(ctx).plural.pascal} table appears.`,
                `Wire Validate${names(ctx).pascal} into the router if you want request validation (see auth.router.ts).`,
            ],
        },
        model: { describe: "TypeORM entity in src/entities/", files: (ctx) => [entity(ctx)] },
        controller: {
            describe: "controller in src/controllers/ using the {status, message, data} envelope",
            files: (ctx) => [controller(ctx)],
        },
        validator: {
            describe: "Joi validator in src/validators/",
            files: (ctx) => [validator(ctx)],
        },
        test: { describe: "jest spec in src/__tests__/", files: (ctx) => [spec(ctx)] },
    },
};

function names(ctx: Ctx) {
    return ctx.names;
}
