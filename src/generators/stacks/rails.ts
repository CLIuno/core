import fs from "node:fs";
import path from "node:path";
import type { Ctx, FileSpec, Generator, NativeCall, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";

/*
 * Stubs mirror CLIuno-Rails-template's todo resource: string (uuid) primary keys, `Api::V1::`
 * controllers guarded by `before_action :authenticate_user!`, the render_success/render_error
 * envelope helpers from ApplicationController, `current_user.<plural>` ownership, minitest
 * controller + model tests with fixtures, and `resources :<plural>` in the api/v1 namespace.
 * Style: rubocop-rails-omakase (2-space, double quotes, %i[] arrays).
 */

const COLUMN: Record<FieldType, string> = {
    string: "string",
    text: "text",
    int: "integer",
    number: "float",
    boolean: "boolean",
    date: "datetime",
    json: "json",
};

/** Ruby literal for request params / model attributes in tests. */
const SAMPLE: Record<FieldType, (f: Field) => string> = {
    string: (f) => `"Sample ${f.snake.replace(/_/g, " ")}"`,
    text: (f) => `"Sample ${f.snake.replace(/_/g, " ")} text"`,
    int: () => "1",
    number: () => "1.5",
    boolean: () => "false",
    date: () => '"2026-01-01T00:00:00Z"',
    json: () => '{ key: "value" }',
};

const UPDATED: Record<FieldType, (f: Field) => string> = {
    string: (f) => `"Updated ${f.snake.replace(/_/g, " ")}"`,
    text: (f) => `"Updated ${f.snake.replace(/_/g, " ")} text"`,
    int: () => "2",
    number: () => "2.5",
    boolean: () => "true",
    date: () => '"2026-02-02T00:00:00Z"',
    json: () => '{ key: "updated" }',
};

/** YAML fixture values (two records so "length >= 2" style assertions hold). */
const FIXTURE: Record<FieldType, (f: Field, n: number) => string> = {
    string: (f, n) => `${n === 1 ? "First" : "Second"} ${f.snake.replace(/_/g, " ")}`,
    text: (f, n) => `${n === 1 ? "First" : "Second"} ${f.snake.replace(/_/g, " ")} text`,
    int: (_f, n) => String(n),
    number: (_f, n) => `${n}.5`,
    boolean: (_f, n) => (n === 1 ? "false" : "true"),
    date: (_f, n) => `2026-0${n}-0${n} 00:00:00`,
    json: () => "{}",
};

function presenceValidated(f: Field): boolean {
    return !f.nullable && f.type !== "boolean" && f.type !== "json";
}

function validation(f: Field): string | null {
    const rules: string[] = [];
    if (presenceValidated(f)) rules.push("presence: true");
    if (f.type === "int") {
        rules.push(
            f.nullable
                ? "numericality: { only_integer: true, allow_nil: true }"
                : "numericality: { only_integer: true }",
        );
    } else if (f.type === "number") {
        rules.push(f.nullable ? "numericality: { allow_nil: true }" : "numericality: true");
    }
    return rules.length ? `  validates :${f.snake}, ${rules.join(", ")}` : null;
}

function column(f: Field): string {
    let line = `      t.${COLUMN[f.type]} :${f.snake}`;
    if (f.type === "boolean") line += ", default: false";
    else if (!f.nullable) line += ", null: false";
    return line;
}

function utcStamp(): string {
    const d = new Date();
    const p = (n: number) => String(n).padStart(2, "0");
    return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}`;
}

function migrateDir(ctx: Ctx): string[] {
    try {
        return fs.readdirSync(path.join(ctx.cwd, "db", "migrate"));
    } catch {
        return [];
    }
}

/** Reuse an existing create_<plural> migration so a second run is a no-op. */
function migrationPath(ctx: Ctx): string {
    const suffix = `create_${ctx.names.plural.snake}.rb`;
    const existing = migrateDir(ctx).find((f) => f.endsWith(`_${suffix}`));
    return `db/migrate/${existing ?? `${utcStamp()}_${suffix}`}`;
}

/** `ActiveRecord::Migration[x.y]` version used by the template's own migrations. */
function migrationVersion(ctx: Ctx): string {
    for (const file of migrateDir(ctx).sort().reverse()) {
        try {
            const m = /Migration\[(\d+\.\d+)\]/.exec(
                fs.readFileSync(path.join(ctx.cwd, "db", "migrate", file), "utf8"),
            );
            if (m) return m[1] as string;
        } catch {
            // unreadable entry — try the next one
        }
    }
    return "8.1";
}

/** Permit scalars as symbols; json columns need the `key: {}` hash form (must come last). */
function permitList(fields: Field[]): string {
    const scalars = fields.filter((f) => f.type !== "json").map((f) => `:${f.snake}`);
    const hashes = fields.filter((f) => f.type === "json").map((f) => `${f.snake}: {}`);
    return [...scalars, ...hashes].join(", ");
}

function rubyHash(fields: Field[], values: Record<FieldType, (f: Field) => string>): string {
    if (fields.length === 0) return "{}";
    return `{ ${fields.map((f) => `${f.snake}: ${values[f.type](f)}`).join(", ")} }`;
}

export function model(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const validations = fields.map(validation).filter((v): v is string => v !== null);
    return {
        path: `app/models/${names.snake}.rb`,
        content: `class ${names.pascal} < ApplicationRecord
  belongs_to :user
${validations.length ? `\n${validations.join("\n")}\n` : ""}end
`,
    };
}

export function migration(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: migrationPath(ctx),
        content: `class Create${names.plural.pascal} < ActiveRecord::Migration[${migrationVersion(ctx)}]
  def change
    create_table :${names.plural.snake}, id: :string do |t|
${fields.map(column).join("\n")}
      t.references :user, type: :string, null: false, foreign_key: true

      t.timestamps
    end
  end
end
`,
    };
}

export function controller(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const Pp = names.plural.pascal;
    const s = names.snake;
    const sp = names.plural.snake;
    const kp = names.plural.kebab;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    const withUser = "as_json(include: { user: { except: %i[password_digest refresh_token] } })";
    return {
        path: `app/controllers/api/v1/${sp}_controller.rb`,
        content: `class Api::V1::${Pp}Controller < ApplicationController
  before_action :authenticate_user!
  before_action :set_${s}, only: %i[show update destroy]
  before_action :authorize_owner!, only: %i[update destroy]

  # GET /api/v1/${kp}
  def index
    ${sp} = ${P}.includes(:user).order(created_at: :desc)
    render_success({ ${many}: ${sp}.${withUser} })
  end

  # GET /api/v1/${kp}/current-user
  def current_user_${sp}
    ${sp} = current_user.${sp}.order(created_at: :desc)
    render_success({ ${many}: ${sp} })
  end

  # GET /api/v1/${kp}/:id
  def show
    render_success({ ${one}: @${s}.${withUser} })
  end

  # POST /api/v1/${kp}
  def create
    ${s} = current_user.${sp}.build(${s}_params)

    if ${s}.save
      render_success({ ${one}: ${s} }, "${title} created successfully", :created)
    else
      render_error("${title} creation failed", :unprocessable_entity, ${s}.errors.full_messages)
    end
  end

  # PATCH /api/v1/${kp}/:id
  def update
    if @${s}.update(${s}_params)
      render_success({ ${one}: @${s} }, "${title} updated successfully")
    else
      render_error("${title} update failed", :unprocessable_entity, @${s}.errors.full_messages)
    end
  end

  # DELETE /api/v1/${kp}/:id
  def destroy
    @${s}.destroy!
    render_success({}, "${title} deleted successfully")
  end

  private

  def set_${s}
    @${s} = ${P}.find_by(id: params[:id])
    render_not_found("${title} not found") unless @${s}
  end

  def authorize_owner!
    return if @${s}.user_id == current_user.id

    render_forbidden("You can only modify your own ${names.plural.title.toLowerCase()}")
  end

  def ${s}_params
    params.permit(${permitList(fields)})
  end
end
`,
    };
}

export function fixture(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const record = (n: number) =>
        [
            `  id: "${names.kebab}-${n === 1 ? "one" : "two"}-id-000${n}"`,
            ...fields.map((f) => `  ${f.snake}: ${FIXTURE[f.type](f, n)}`),
            `  user_id: "user-regular-id-0002"`,
        ].join("\n");
    return {
        path: `test/fixtures/${names.plural.snake}.yml`,
        content: `one:
${record(1)}

two:
${record(2)}
`,
    };
}

export function controllerTest(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const Pp = names.plural.pascal;
    const s = names.snake;
    const sp = names.plural.snake;
    const one = names.camel;
    const many = names.plural.camel;
    const label = labelField(fields);
    const comparable = ["string", "text", "int", "number", "boolean"].includes(label.type);
    const required = presenceValidated(label);
    const human = names.title.toLowerCase();
    const humans = names.plural.title.toLowerCase();
    const createParams = rubyHash(fields, SAMPLE);
    const updateParams = `{ ${label.snake}: ${UPDATED[label.type](label)} }`;
    const withoutLabel = rubyHash(
        fields.filter((f) => f !== label),
        SAMPLE,
    );
    const showAssert = comparable
        ? `
    assert_equal @${s}.${label.snake}, json["data"]["${one}"]["${label.snake}"]`
        : `
    assert_equal @${s}.id, json["data"]["${one}"]["id"]`;
    const updateAssert = comparable
        ? `
    @${s}.reload
    assert_equal ${UPDATED[label.type](label)}, @${s}.${label.snake}`
        : "";
    const requiredTest = required
        ? `

  test "should not create ${human} without ${label.snake.replace(/_/g, " ")}" do
    assert_no_difference("${P}.count") do
      post api_v1_${sp}_url, params: ${withoutLabel},
           headers: auth_headers_for(@user), as: :json
    end

    assert_response :unprocessable_entity
  end`
        : "";

    return {
        path: `test/controllers/api/v1/${sp}_controller_test.rb`,
        content: `require "test_helper"

class Api::V1::${Pp}ControllerTest < ActionDispatch::IntegrationTest
  setup do
    @user = users(:regular)
    @${s} = ${sp}(:one)
  end

  test "should get all ${humans}" do
    get api_v1_${sp}_url, headers: auth_headers_for(@user), as: :json

    assert_response :success
    json = JSON.parse(response.body)
    assert json["data"]["${many}"].length >= 2
  end

  test "should get current user ${humans}" do
    get api_v1_${sp}_current_user_url, headers: auth_headers_for(@user), as: :json

    assert_response :success
  end

  test "should get ${human} by id" do
    get api_v1_${s}_url(@${s}), headers: auth_headers_for(@user), as: :json

    assert_response :success
    json = JSON.parse(response.body)${showAssert}
  end

  test "should create ${human}" do
    assert_difference("${P}.count") do
      post api_v1_${sp}_url, params: ${createParams},
           headers: auth_headers_for(@user), as: :json
    end

    assert_response :created
  end

  test "should update ${human}" do
    patch api_v1_${s}_url(@${s}), params: ${updateParams},
          headers: auth_headers_for(@user), as: :json

    assert_response :success${updateAssert}
  end

  test "should delete ${human}" do
    assert_difference("${P}.count", -1) do
      delete api_v1_${s}_url(@${s}), headers: auth_headers_for(@user), as: :json
    end

    assert_response :success
  end

  test "should require authentication" do
    get api_v1_${sp}_url, as: :json

    assert_response :unauthorized
  end${requiredTest}
end
`,
    };
}

export function modelTest(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const s = names.snake;
    const sp = names.plural.snake;
    const label = labelField(fields);
    const human = names.title.toLowerCase();
    const others = fields.filter((f) => f !== label).map((f) => `${f.snake}: ${SAMPLE[f.type](f)}`);
    const requiredTest = presenceValidated(label)
        ? `  test "should not save ${human} without ${label.snake.replace(/_/g, " ")}" do
    ${s} = ${P}.new(${[...others, "user: users(:regular)"].join(", ")})
    assert_not ${s}.save
  end

`
        : "";
    return {
        path: `test/models/${s}_test.rb`,
        content: `require "test_helper"

class ${P}Test < ActiveSupport::TestCase
${requiredTest}  test "should belong to user" do
    ${s} = ${sp}(:one)
    assert_not_nil ${s}.user
  end

  test "should save a valid ${human}" do
    ${s} = ${P}.new(${[...fields.map((f) => `${f.snake}: ${SAMPLE[f.type](f)}`), "user: users(:regular)"].join(", ")})
    assert ${s}.save
  end
end
`,
    };
}

export function routePatch(ctx: Ctx): Patch {
    const { names } = ctx;
    const sp = names.plural.snake;
    const kp = names.plural.kebab;
    const pathOpt = sp === kp ? "" : `, path: "${kp}"`;
    return {
        path: "config/routes.rb",
        anchor: "    namespace :v1 do",
        where: "after",
        insert: `
      # ${names.plural.title}
      get "${kp}/current-user", to: "${sp}#current_user_${sp}"
      resources :${sp}${pathOpt}, only: %i[index show create update destroy]
`,
        skipIf: `resources :${sp}`,
        describe: `register resources :${sp} in the api/v1 namespace`,
    };
}

/** `has_many :<plural>, dependent: :destroy` after the last single-line has_many on User. */
export function userRelationPatch(ctx: Ctx): Patch {
    const { names } = ctx;
    const sp = names.plural.snake;
    return {
        path: "app/models/user.rb",
        anchor: /^  has_many :\w+, dependent: :destroy$/m,
        where: "after",
        insert: `\n  has_many :${sp}, dependent: :destroy`,
        skipIf: `has_many :${sp},`,
        describe: `add has_many :${sp} to User`,
    };
}

function railsG(...args: string[]): NativeCall[] {
    return [{ bin: "bin/rails", args: ["generate", ...args] }];
}

function fieldArgs(fields: Field[]): string[] {
    return fields.map((f) => `${f.snake}:${COLUMN[f.type]}`);
}

export const rails: Generator = {
    id: "rails",
    label: "Rails",
    kind: "backend",
    commands: {
        resource: {
            describe:
                "model + migration + Api::V1 controller + routes + minitest controller/model tests + fixture",
            files: (ctx) => [
                model(ctx),
                migration(ctx),
                controller(ctx),
                fixture(ctx),
                controllerTest(ctx),
                modelTest(ctx),
            ],
            patches: (ctx) => [routePatch(ctx), userRelationPatch(ctx)],
            notes: (ctx) => [
                `bin/rails db:migrate — creates the ${ctx.names.plural.snake} table (and refreshes db/schema.rb).`,
                `Edit ${ctx.names.snake}_params / validations in app/models/${ctx.names.snake}.rb for business rules; the frontends destructure data.${ctx.names.plural.camel} / data.${ctx.names.camel}.`,
            ],
        },
        model: {
            describe: "ActiveRecord model + migration via the Rails generator",
            native: (ctx) =>
                railsG("model", ctx.names.pascal, ...fieldArgs(ctx.fields), "user:references"),
            files: (ctx) => [model(ctx), migration(ctx)],
        },
        controller: {
            describe: "Api::V1 controller via the Rails generator (routes left to you)",
            native: (ctx) =>
                railsG("controller", `api/v1/${ctx.names.plural.snake}`, "--skip-routes"),
            files: (ctx) => [controller(ctx)],
        },
        migration: {
            describe: "create_<plural> migration via the Rails generator",
            native: (ctx) =>
                railsG("migration", `Create${ctx.names.plural.pascal}`, ...fieldArgs(ctx.fields)),
            files: (ctx) => [migration(ctx)],
        },
        test: {
            describe: "minitest controller + model tests and a fixture",
            files: (ctx) => [fixture(ctx), controllerTest(ctx), modelTest(ctx)],
        },
    },
};
