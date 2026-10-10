import type { Ctx, FileSpec, Generator, NativeCall, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { oxfmt } from "./shared";

const TS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "number",
    number: "number",
    boolean: "boolean",
    date: "DateTime",
    json: "Record<string, unknown>",
};

const KNEX: Record<FieldType, string> = {
    string: "string",
    text: "text",
    int: "integer",
    number: "float",
    boolean: "boolean",
    date: "timestamp",
    json: "json",
};

const VINE: Record<FieldType, string> = {
    string: "vine.string().trim()",
    text: "vine.string().trim()",
    int: "vine.number().withoutDecimals()",
    number: "vine.number()",
    boolean: "vine.boolean()",
    date: "vine.date()",
    json: "vine.object({}).allowUnknownProperties()",
};

function modelColumn(f: Field): string {
    const type = `${TS[f.type]}${f.nullable ? " | null" : ""}`;
    if (f.type === "date") return `  @column.dateTime()\n  declare ${f.snake}: ${type}`;
    if (f.type === "json") {
        return `  @column({
    prepare: (value: unknown) => JSON.stringify(value),
    consume: (value: unknown) => (typeof value === 'string' ? JSON.parse(value) : value),
  })
  declare ${f.snake}: ${type}`;
    }
    return `  @column()\n  declare ${f.snake}: ${type}`;
}

function model(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: `app/models/${names.snake}.ts`,
        content: `import { DateTime } from 'luxon'
import { BaseModel, belongsTo, column } from '@adonisjs/lucid/orm'
import type { BelongsTo } from '@adonisjs/lucid/types/relations'
import User from '#models/user'

export default class ${names.pascal} extends BaseModel {
  @column({ isPrimary: true })
  declare id: number

${fields.map(modelColumn).join("\n\n")}

  @column()
  declare user_id: number

  @column.dateTime({ autoCreate: true })
  declare createdAt: DateTime

  @column.dateTime({ autoCreate: true, autoUpdate: true })
  declare updatedAt: DateTime | null

  @belongsTo(() => User, { foreignKey: 'user_id' })
  declare user: BelongsTo<typeof User>
}
`,
    };
}

function migrationColumn(f: Field): string {
    let line = `      table.${KNEX[f.type]}('${f.snake}')`;
    line += f.nullable ? ".nullable()" : ".notNullable()";
    if (f.type === "boolean" && !f.nullable) line += ".defaultTo(false)";
    return line;
}

function migration(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: `database/migrations/${Date.now()}_create_${names.plural.snake}_table.ts`,
        content: `import { BaseSchema } from '@adonisjs/lucid/schema'

export default class extends BaseSchema {
  protected tableName = '${names.plural.snake}'

  async up() {
    this.schema.createTable(this.tableName, (table) => {
      table.increments('id').notNullable()
${fields.map(migrationColumn).join("\n")}
      table
        .integer('user_id')
        .unsigned()
        .notNullable()
        .references('id')
        .inTable('users')
        .onDelete('CASCADE')

      table.timestamp('created_at').notNullable()
      table.timestamp('updated_at').nullable()
    })
  }

  async down() {
    this.schema.dropTable(this.tableName)
  }
}
`,
    };
}

function controller(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    const keys = fields.map((f) => `'${f.snake}'`).join(", ");
    const required = fields.filter(
        (f) => !f.nullable && (f.type === "string" || f.type === "text"),
    );
    const guards = required
        .map(
            (f) => `    if (!payload.${f.snake}) {
      return response.badRequest({ status: 'error', message: '${f.pascal} is required' })
    }`,
        )
        .join("\n");
    return {
        path: `app/controllers/${names.plural.snake}_controller.ts`,
        content: `import type { HttpContext } from '@adonisjs/core/http'

import ${P} from '#models/${names.snake}'

export default class ${names.plural.pascal}Controller {
  async index({ response }: HttpContext) {
    const ${many} = await ${P}.query().preload('user').orderBy('created_at', 'desc')
    return response.ok({ status: 'success', data: { ${many} } })
  }

  async currentUser({ auth, response }: HttpContext) {
    const ${many} = await ${P}.query()
      .where('user_id', auth.getUserOrFail().id)
      .preload('user')
      .orderBy('created_at', 'desc')
    return response.ok({ status: 'success', data: { ${many} } })
  }

  async store({ auth, request, response }: HttpContext) {
    const payload = request.only([${keys}])
${guards ? `${guards}\n` : ""}
    const ${one} = await ${P}.create({
      ...payload,
      user_id: auth.getUserOrFail().id,
    })
    await ${one}.load('user')
    return response.created({
      status: 'success',
      message: '${title} created successfully',
      data: { ${one} },
    })
  }

  async show({ params, response }: HttpContext) {
    const ${one} = await ${P}.query().where('id', params.id).preload('user').first()
    if (!${one}) {
      return response.notFound({ status: 'error', message: '${title} not found' })
    }
    return response.ok({ status: 'success', data: { ${one} } })
  }

  async update({ auth, params, request, response }: HttpContext) {
    const ${one} = await ${P}.query().where('id', params.id).preload('user').first()
    if (!${one}) {
      return response.notFound({ status: 'error', message: '${title} not found' })
    }
    if (${one}.user_id !== auth.getUserOrFail().id) {
      return response.forbidden({ status: 'error', message: 'You can only update your own ${names.plural.title.toLowerCase()}' })
    }
    ${one}.merge(request.only([${keys}]))
    await ${one}.save()
    return response.ok({ status: 'success', message: '${title} updated', data: { ${one} } })
  }

  async destroy({ auth, params, response }: HttpContext) {
    const ${one} = await ${P}.find(params.id)
    if (!${one}) {
      return response.notFound({ status: 'error', message: '${title} not found' })
    }
    if (${one}.user_id !== auth.getUserOrFail().id) {
      return response.forbidden({ status: 'error', message: 'You can only delete your own ${names.plural.title.toLowerCase()}' })
    }
    await ${one}.delete()
    return response.ok({ status: 'success', message: '${title} deleted successfully' })
  }
}
`,
    };
}

function validator(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const rules = fields
        .map((f) => `    ${f.snake}: ${VINE[f.type]}${f.nullable ? ".nullable().optional()" : ""},`)
        .join("\n");
    return {
        path: `app/validators/${names.snake}.ts`,
        content: `import vine from '@vinejs/vine'

export const create${names.pascal}Validator = vine.compile(
  vine.object({
${rules}
  }),
)

export const update${names.pascal}Validator = vine.compile(
  vine.object({
${fields.map((f) => `    ${f.snake}: ${VINE[f.type]}.optional(),`).join("\n")}
  }),
)
`,
    };
}

function registerRoutes(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const C = `${names.plural.pascal}Controller`;
    const kp = names.plural.kebab;
    return [
        {
            path: "start/routes.ts",
            anchor: /^const \w+Controller = \(\) => import\('#controllers\/\w+'\)$/m,
            where: "after",
            insert: `\nconst ${C} = () => import('#controllers/${names.plural.snake}_controller')`,
            skipIf: `#controllers/${names.plural.snake}_controller`,
            describe: `lazy-import ${C}`,
        },
        {
            path: "start/routes.ts",
            anchor: "        // Uploads\n",
            where: "before",
            insert: `        // ${names.plural.title}
        router.get('/${kp}/current-user', [${C}, 'currentUser'])
        router.get('/${kp}', [${C}, 'index'])
        router.post('/${kp}', [${C}, 'store'])
        router.get('/${kp}/:id', [${C}, 'show'])
        router.patch('/${kp}/:id', [${C}, 'update'])
        router.delete('/${kp}/:id', [${C}, 'destroy'])

`,
            skipIf: `router.get('/${kp}'`,
            describe: `add the /${kp} routes inside the auth group`,
        },
    ];
}

const ace = (...args: string[]): NativeCall[] => [{ bin: "node", args: ["ace", ...args] }];

export const adonis: Generator = {
    id: "adonis",
    label: "AdonisJS",
    kind: "backend",
    format: oxfmt,
    commands: {
        resource: {
            describe:
                "Lucid model + migration + controller + VineJS validator, routed under /api/v1/<plural> in start/routes.ts",
            files: (ctx) => [model(ctx), migration(ctx), controller(ctx), validator(ctx)],
            patches: registerRoutes,
            notes: (ctx) => [
                `Run \`node ace migration:run\` to create the ${ctx.names.plural.snake} table.`,
                `Use create${ctx.names.pascal}Validator with request.validateUsing() in the controller if you want schema validation.`,
            ],
        },
        model: {
            describe: "Lucid model in app/models/",
            native: (ctx) => ace("make:model", ctx.names.pascal),
            files: (ctx) => [model(ctx)],
        },
        migration: {
            describe: "migration in database/migrations/",
            native: (ctx) => ace("make:migration", ctx.names.plural.snake),
            files: (ctx) => [migration(ctx)],
        },
        controller: {
            describe: "controller in app/controllers/",
            native: (ctx) => ace("make:controller", ctx.names.plural.snake),
            files: (ctx) => [controller(ctx)],
        },
        validator: {
            describe: "VineJS validator in app/validators/",
            native: (ctx) => ace("make:validator", ctx.names.snake),
            files: (ctx) => [validator(ctx)],
        },
    },
};
