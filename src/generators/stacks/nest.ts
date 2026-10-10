import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { oxfmt } from "./shared";

const TS: Record<FieldType, string> = {
    string: "string",
    text: "string",
    int: "number",
    number: "number",
    boolean: "boolean",
    date: "Date",
    json: "Record<string, unknown>",
};

const DTO_TS: Record<FieldType, string> = { ...TS, date: "string" };

const VALIDATOR: Record<FieldType, string> = {
    string: "IsString",
    text: "IsString",
    int: "IsInt",
    number: "IsNumber",
    boolean: "IsBoolean",
    date: "IsDateString",
    json: "IsObject",
};

function column(f: Field): string {
    const opts: string[] = [];
    let type = "";
    if (f.type === "int") type = "'integer'";
    if (f.type === "number") type = "'real'";
    if (f.type === "date") opts.push("type: 'datetime'");
    if (f.type === "json") type = "'simple-json'";
    if (f.nullable) opts.push("nullable: true");
    else if (f.type === "boolean") opts.push("default: false");
    else if (f.type === "text") opts.push("default: ''");
    const args = [type, opts.length ? `{ ${opts.join(", ")} }` : ""].filter(Boolean).join(", ");
    return `  @Column(${args})\n  ${f.camel}: ${TS[f.type]}${f.nullable ? " | null" : ""}\n`;
}

function entity(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: `src/entities/${names.kebab}.entity.ts`,
        content: `import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
} from 'typeorm'
import { User } from './user.entity'

@Entity('${names.plural.snake}')
export class ${names.pascal} {
  @PrimaryGeneratedColumn('uuid')
  id: string

${fields.map(column).join("\n")}
  @CreateDateColumn()
  createdAt: Date

  @UpdateDateColumn()
  updatedAt: Date

  @ManyToOne(() => User)
  @JoinColumn()
  user: User
}
`,
    };
}

function dtoField(f: Field, forceOptional: boolean): string {
    const optional = forceOptional || f.nullable;
    const decorators = [`  @${VALIDATOR[f.type]}()`];
    if (optional) decorators.push("  @IsOptional()");
    else if (f.type === "string" || f.type === "text") decorators.push("  @IsNotEmpty()");
    return `${decorators.join("\n")}\n  ${f.camel}${optional ? "?" : ""}: ${DTO_TS[f.type]}`;
}

function dto(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const used = new Set<string>(["IsOptional"]);
    for (const f of fields) used.add(VALIDATOR[f.type]);
    if (fields.some((f) => !f.nullable && (f.type === "string" || f.type === "text")))
        used.add("IsNotEmpty");
    return {
        path: `src/dto/${names.kebab}.dto.ts`,
        content: `import { ${[...used].sort().join(", ")} } from 'class-validator'

export class Create${names.pascal}Dto {
${fields.map((f) => dtoField(f, false)).join("\n\n")}
}

export class Update${names.pascal}Dto {
${fields.map((f) => dtoField(f, true)).join("\n\n")}
}
`,
    };
}

function service(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    const titles = names.plural.title;
    const lowerPlural = names.plural.title.toLowerCase();
    const required = fields.filter(
        (f) => !f.nullable && (f.type === "string" || f.type === "text"),
    );
    const guards = required
        .map(
            (f) =>
                `    if (!dto.${f.camel}) throw new BadRequestException('${f.pascal} is required')`,
        )
        .join("\n");
    const value = (f: Field) =>
        f.type === "date"
            ? f.nullable
                ? `dto.${f.camel} ? new Date(dto.${f.camel}) : null`
                : `new Date(dto.${f.camel})`
            : `dto.${f.camel}${f.nullable ? " ?? null" : ""}`;
    const assign = fields.map((f) => `      ${f.camel}: ${value(f)},`).join("\n");
    const updates = fields
        .map((f) => `    if (dto.${f.camel} !== undefined) ${one}.${f.camel} = ${value(f)}`)
        .join("\n");
    return {
        path: `src/services/${names.kebab}.service.ts`,
        content: `import {
  Injectable,
  NotFoundException,
  ForbiddenException,${required.length ? "\n  BadRequestException," : ""}
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'

import { ${P} } from '../entities/${names.kebab}.entity'
import { User } from '../entities/user.entity'
import { Create${P}Dto, Update${P}Dto } from '../dto/${names.kebab}.dto'

@Injectable()
export class ${P}Service {
  constructor(
    @InjectRepository(${P}) private readonly ${one}Repository: Repository<${P}>,
    @InjectRepository(User) private readonly userRepository: Repository<User>,
  ) {}

  async getAll() {
    const ${many} = await this.${one}Repository.find({
      relations: { user: true },
      order: { createdAt: 'DESC' },
    })
    return { status: 'success', message: '${titles} fetched successfully', data: { ${many} } }
  }

  async getById(id: string) {
    const ${one} = await this.${one}Repository.findOne({
      where: { id },
      relations: { user: true },
    })
    if (!${one}) throw new NotFoundException('${title} not found')
    return { status: 'success', message: '${title} fetched successfully', data: { ${one} } }
  }

  async getCurrentUser${names.plural.pascal}(userId: string) {
    const ${many} = await this.${one}Repository.find({
      where: { user: { id: userId } },
      relations: { user: true },
      order: { createdAt: 'DESC' },
    })
    return { status: 'success', message: '${titles} fetched successfully', data: { ${many} } }
  }

  async create(userId: string, dto: Create${P}Dto) {
${guards ? `${guards}\n\n` : ""}    const user = await this.userRepository.findOneBy({ id: userId })
    if (!user) throw new NotFoundException('User not found')

    const ${one} = this.${one}Repository.create({
${assign}
      user,
    })
    const result = await this.${one}Repository.save(${one})
    return { status: 'success', message: '${title} created successfully', data: { ${one}: result } }
  }

  async update(userId: string, id: string, dto: Update${P}Dto) {
    const ${one} = await this.${one}Repository.findOne({ where: { id }, relations: { user: true } })
    if (!${one}) throw new NotFoundException('${title} not found')
    if (${one}.user.id !== userId) throw new ForbiddenException('You can only update your own ${lowerPlural}')

${updates}

    await this.${one}Repository.save(${one})
    return { status: 'success', message: '${title} updated successfully', data: { ${one} } }
  }

  async delete(userId: string, id: string) {
    const ${one} = await this.${one}Repository.findOne({ where: { id }, relations: { user: true } })
    if (!${one}) throw new NotFoundException('${title} not found')
    if (${one}.user.id !== userId) throw new ForbiddenException('You can only delete your own ${lowerPlural}')

    await this.${one}Repository.remove(${one})
    return { status: 'success', message: '${title} deleted successfully' }
  }
}
`,
    };
}

function controller(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    const one = names.camel;
    return {
        path: `src/controllers/${names.kebab}.controller.ts`,
        content: `import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  UseGuards,
  Request,
} from '@nestjs/common'
import { ${P}Service } from '../services/${names.kebab}.service'
import { JwtAuthGuard } from '../guards/jwt-auth.guard'
import { Create${P}Dto, Update${P}Dto } from '../dto/${names.kebab}.dto'

@Controller('api/v1/${names.plural.kebab}')
@UseGuards(JwtAuthGuard)
export class ${P}Controller {
  constructor(private readonly ${one}Service: ${P}Service) {}

  @Get('current-user')
  async getCurrentUser${names.plural.pascal}(@Request() req) {
    return this.${one}Service.getCurrentUser${names.plural.pascal}(req.user.id)
  }

  @Get()
  async getAll() {
    return this.${one}Service.getAll()
  }

  @Get(':id')
  async getById(@Param('id') id: string) {
    return this.${one}Service.getById(id)
  }

  @Post()
  async create(@Request() req, @Body() dto: Create${P}Dto) {
    return this.${one}Service.create(req.user.id, dto)
  }

  @Patch(':id')
  async update(@Request() req, @Param('id') id: string, @Body() dto: Update${P}Dto) {
    return this.${one}Service.update(req.user.id, id, dto)
  }

  @Delete(':id')
  async delete(@Request() req, @Param('id') id: string) {
    return this.${one}Service.delete(req.user.id, id)
  }
}
`,
    };
}

function module(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    return {
        path: `src/modules/${names.kebab}.module.ts`,
        content: `import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'

import { ${P}Controller } from '../controllers/${names.kebab}.controller'
import { ${P}Service } from '../services/${names.kebab}.service'
import { ${P} } from '../entities/${names.kebab}.entity'
import { User } from '../entities/user.entity'

@Module({
  imports: [TypeOrmModule.forFeature([${P}, User])],
  controllers: [${P}Controller],
  providers: [${P}Service],
  exports: [${P}Service],
})
export class ${P}Module {}
`,
    };
}

function spec(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    return {
        path: `src/services/${names.kebab}.service.spec.ts`,
        content: `import { NotFoundException } from '@nestjs/common'
import { ${P}Service } from './${names.kebab}.service'

describe('${P}Service', () => {
  const ${one}Repository = {
    find: jest.fn(),
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    remove: jest.fn(),
  }
  const userRepository = { findOneBy: jest.fn() }
  const service = new ${P}Service(${one}Repository as never, userRepository as never)

  it('lists ${many} in the contract envelope', async () => {
    ${one}Repository.find.mockResolvedValue([])
    await expect(service.getAll()).resolves.toEqual({
      status: 'success',
      message: '${names.plural.title} fetched successfully',
      data: { ${many}: [] },
    })
  })

  it('throws 404 for a missing ${names.title.toLowerCase()}', async () => {
    ${one}Repository.findOne.mockResolvedValue(null)
    await expect(service.getById('missing')).rejects.toBeInstanceOf(NotFoundException)
  })
})
`,
    };
}

function registerModule(ctx: Ctx): Patch[] {
    const { names } = ctx;
    const P = names.pascal;
    return [
        {
            path: "src/modules/app.module.ts",
            anchor: /^import \{ \w+Module \} from '\.\/[\w-]+\.module'$/m,
            where: "after",
            insert: `\nimport { ${P}Module } from './${names.kebab}.module'`,
            skipIf: `./${names.kebab}.module`,
            describe: `import ${P}Module`,
        },
        {
            path: "src/modules/app.module.ts",
            anchor: /^import \{ \w+ \} from '\.\.\/entities\/[\w.-]+\.entity'$/m,
            where: "after",
            insert: `\nimport { ${P} } from '../entities/${names.kebab}.entity'`,
            skipIf: `../entities/${names.kebab}.entity`,
            describe: `import the ${P} entity`,
        },
        {
            path: "src/modules/app.module.ts",
            anchor: "entities: [",
            where: "after",
            insert: `${P}, `,
            skipIf: `entities: [${P}, `,
            describe: `add ${P} to TypeOrmModule entities`,
        },
        {
            path: "src/modules/app.module.ts",
            anchor: /^  \],\n  controllers: \[/m,
            where: "before",
            insert: `    ${P}Module,\n`,
            skipIf: `    ${P}Module,`,
            describe: `add ${P}Module to the AppModule imports`,
        },
    ];
}

export const nest: Generator = {
    id: "nest",
    label: "NestJS",
    kind: "backend",
    format: oxfmt,
    commands: {
        resource: {
            describe:
                "entity + DTOs + service + controller (api/v1/<plural>) + module + jest spec, wired into AppModule",
            files: (ctx) => [
                entity(ctx),
                dto(ctx),
                service(ctx),
                controller(ctx),
                module(ctx),
                spec(ctx),
            ],
            patches: registerModule,
            notes: (ctx) => [
                `TypeORM synchronize is on — restart the dev server and the ${ctx.names.plural.snake} table appears.`,
            ],
        },
        model: { describe: "TypeORM entity in src/entities/", files: (ctx) => [entity(ctx)] },
        dto: {
            describe: "Create/Update DTOs with class-validator in src/dto/",
            files: (ctx) => [dto(ctx)],
        },
        service: {
            describe: "service in src/services/ using the {status, message, data} envelope",
            files: (ctx) => [service(ctx)],
        },
        controller: {
            describe: "controller in src/controllers/ guarded by JwtAuthGuard",
            files: (ctx) => [controller(ctx)],
        },
        test: { describe: "jest spec for the service", files: (ctx) => [spec(ctx)] },
    },
};
