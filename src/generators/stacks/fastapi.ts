import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";
import { ruffFormat } from "./shared";

// Stubs mirror the template's todo resource: src/routers/todos.py (`_success`, `_todo_dict`,
// `CurrentUser` / `DbSession`, owner-or-admin checks), the Todo model in src/models/models.py,
// the Todo* schemas in src/schemas/schemas.py and tests/test_todos.py. Double quotes, 100 cols,
// isort-sorted imports (ruff "I" is enforced by the template).

const SA_TYPE: Record<FieldType, string> = {
    string: "String(255)",
    text: "Text",
    int: "Integer",
    number: "Float",
    boolean: "Boolean",
    date: "DateTime",
    json: "JSON",
};

const SA_IMPORT: Record<FieldType, string> = {
    string: "String",
    text: "Text",
    int: "Integer",
    number: "Float",
    boolean: "Boolean",
    date: "DateTime",
    json: "JSON",
};

const PY: Record<FieldType, string> = {
    string: "str",
    text: "str",
    int: "int",
    number: "float",
    boolean: "bool",
    date: "datetime",
    json: "dict",
};

function column(f: Field): string {
    const py = f.nullable ? `${PY[f.type]} | None` : PY[f.type];
    const opts = f.nullable
        ? "nullable=True"
        : f.type === "boolean"
          ? "default=False"
          : "nullable=False";
    return `    ${f.snake}: Mapped[${py}] = mapped_column(${SA_TYPE[f.type]}, ${opts})`;
}

/** `from sqlalchemy import …` members in isort's order-by-type order: CONSTANTS, Classes, functions. */
function sqlalchemyImports(fields: Field[]): string {
    const names = new Set(["DateTime", "ForeignKey", "String"]);
    for (const f of fields) names.add(SA_IMPORT[f.type]);
    const constants = [...names].filter((n) => n === n.toUpperCase()).sort();
    const classes = [...names].filter((n) => n !== n.toUpperCase()).sort();
    return [...constants, ...classes, "func"].join(", ");
}

/** Sample JSON literals for tests (double-quoted Python). */
function sample(f: Field): { create: string; updated: string } {
    switch (f.type) {
        case "string":
        case "text":
            return { create: `"Test ${f.snake}"`, updated: `"Updated ${f.snake}"` };
        case "int":
            return { create: "1", updated: "2" };
        case "number":
            return { create: "1.5", updated: "2.5" };
        case "boolean":
            return { create: "False", updated: "True" };
        case "date":
            return { create: '"2026-01-01T00:00:00"', updated: '"2026-02-01T00:00:00"' };
        case "json":
            return { create: '{"key": "value"}', updated: '{"key": "updated"}' };
    }
}

function required(fields: Field[]): Field[] {
    return fields.filter((f) => !f.nullable && f.type !== "boolean");
}

function model(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    return {
        path: `src/models/${names.snake}.py`,
        content: `import uuid
from datetime import datetime

from sqlalchemy import ${sqlalchemyImports(fields)}
from sqlalchemy.orm import Mapped, mapped_column, relationship

from src.database import Base
from src.models.models import User


class ${names.pascal}(Base):
    __tablename__ = "${names.plural.snake}"

    id: Mapped[str] = mapped_column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
${fields.map(column).join("\n")}
    user_id: Mapped[str] = mapped_column(String(36), ForeignKey("users.id"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime, server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(
        DateTime, server_default=func.now(), onupdate=func.now()
    )

    user: Mapped[User] = relationship("User")
`,
    };
}

function schema(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const createField = (f: Field) =>
        f.nullable
            ? `    ${f.snake}: ${PY[f.type]} | None = None`
            : f.type === "boolean"
              ? `    ${f.snake}: bool = False`
              : `    ${f.snake}: ${PY[f.type]}`;
    const updateField = (f: Field) => `    ${f.snake}: ${PY[f.type]} | None = None`;
    const outField = (f: Field) =>
        f.nullable
            ? `    ${f.snake}: ${PY[f.type]} | None = None`
            : `    ${f.snake}: ${PY[f.type]}`;
    return {
        path: `src/schemas/${names.snake}.py`,
        content: `from datetime import datetime

from pydantic import BaseModel


class ${P}Create(BaseModel):
${fields.map(createField).join("\n")}


class ${P}Update(BaseModel):
${fields.map(updateField).join("\n")}


class ${P}Out(BaseModel):
    id: str
${fields.map(outField).join("\n")}
    user_id: str
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}
`,
    };
}

function router(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    const one = names.snake;
    const many = names.plural.snake;
    const key = names.camel;
    const keys = names.plural.camel;
    const title = names.title;
    const titles = names.plural.title;
    const idParam = `${one}_id`;
    const lookup = `    ${one} = db.query(${P}).filter(${P}.id == ${idParam}).first()
    if not ${one}:
        raise HTTPException(status_code=404, detail="${title} not found")`;
    const ownerOrAdmin = `    if ${one}.user_id != current_user.id and current_user.role.name != "admin":
        raise HTTPException(status_code=403, detail="Not authorized")`;

    return {
        path: `src/routers/${many}.py`,
        content: `from fastapi import APIRouter, HTTPException, status

from src.dependencies.auth import CurrentUser, DbSession
from src.models.${one} import ${P}
from src.schemas.${one} import ${P}Create, ${P}Out, ${P}Update

router = APIRouter(prefix="/${names.plural.kebab}", tags=["${titles}"])


def _success(message: str, data=None):
    return {"status": "success", "message": message, "data": data}


def _${one}_dict(${one}: ${P}) -> dict:
    return ${P}Out.model_validate(${one}).model_dump(mode="json")


@router.get("")
def list_${many}(current_user: CurrentUser, db: DbSession):
    ${many} = db.query(${P}).all()
    return _success("${titles} retrieved", {"${keys}": [_${one}_dict(item) for item in ${many}]})


@router.get("/current-user")
def current_user_${many}(current_user: CurrentUser, db: DbSession):
    ${many} = db.query(${P}).filter(${P}.user_id == current_user.id).all()
    return _success("User ${many} retrieved", {"${keys}": [_${one}_dict(item) for item in ${many}]})


@router.post("", status_code=status.HTTP_201_CREATED)
def create_${one}(body: ${P}Create, current_user: CurrentUser, db: DbSession):
    ${one} = ${P}(**body.model_dump(), user_id=current_user.id)
    db.add(${one})
    db.commit()
    db.refresh(${one})
    return _success("${title} created successfully", {"${key}": _${one}_dict(${one})})


@router.get("/{${idParam}}")
def get_${one}(${idParam}: str, current_user: CurrentUser, db: DbSession):
${lookup}
    return _success("${title} retrieved", {"${key}": _${one}_dict(${one})})


@router.patch("/{${idParam}}")
def update_${one}(${idParam}: str, body: ${P}Update, current_user: CurrentUser, db: DbSession):
${lookup}
${ownerOrAdmin}
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(${one}, field, value)
    db.commit()
    db.refresh(${one})
    return _success("${title} updated successfully", {"${key}": _${one}_dict(${one})})


@router.delete("/{${idParam}}")
def delete_${one}(${idParam}: str, current_user: CurrentUser, db: DbSession):
${lookup}
${ownerOrAdmin}
    db.delete(${one})
    db.commit()
    return _success("${title} deleted successfully")
`,
    };
}

function test(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const one = names.snake;
    const many = names.plural.snake;
    const key = names.camel;
    const keys = names.plural.camel;
    const label = labelField(fields);
    const base = `/api/v1/${names.plural.kebab}`;
    const idParam = `${one}_id`;
    const payload = `{${fields.map((f) => `"${f.snake}": ${sample(f).create}`).join(", ")}}`;
    const missingRequired =
        required(fields).length > 0
            ? `
    def test_create_${one}_missing_required(self, client, user_token):
        res = client.post("${base}", json={}, headers=auth_header(user_token))
        assert res.status_code == 422
`
            : "";

    return {
        path: `tests/test_${many}.py`,
        content: `from tests.conftest import auth_header

PAYLOAD = ${payload}


def _create(client, token):
    return client.post("${base}", json=PAYLOAD, headers=auth_header(token))


class Test${names.plural.pascal}:
    def test_create_${one}(self, client, user_token):
        res = _create(client, user_token)
        assert res.status_code == 201
        assert res.json()["data"]["${key}"]["${label.snake}"] == ${sample(label).create}
${missingRequired}
    def test_list_${many}(self, client, user_token):
        _create(client, user_token)
        _create(client, user_token)
        res = client.get("${base}", headers=auth_header(user_token))
        assert res.status_code == 200
        assert len(res.json()["data"]["${keys}"]) == 2

    def test_current_user_${many}(self, client, user_token, second_user_token):
        _create(client, user_token)
        _create(client, second_user_token)
        res = client.get("${base}/current-user", headers=auth_header(user_token))
        assert res.status_code == 200
        assert len(res.json()["data"]["${keys}"]) == 1

    def test_get_${one}(self, client, user_token):
        ${idParam} = _create(client, user_token).json()["data"]["${key}"]["id"]
        res = client.get(f"${base}/{${idParam}}", headers=auth_header(user_token))
        assert res.status_code == 200
        assert res.json()["data"]["${key}"]["id"] == ${idParam}

    def test_get_${one}_not_found(self, client, user_token):
        res = client.get("${base}/nonexistent", headers=auth_header(user_token))
        assert res.status_code == 404

    def test_update_${one}(self, client, user_token):
        ${idParam} = _create(client, user_token).json()["data"]["${key}"]["id"]
        res = client.patch(
            f"${base}/{${idParam}}",
            json={"${label.snake}": ${sample(label).updated}},
            headers=auth_header(user_token),
        )
        assert res.status_code == 200
        assert res.json()["data"]["${key}"]["${label.snake}"] == ${sample(label).updated}

    def test_update_${one}_forbidden(self, client, user_token, second_user_token):
        ${idParam} = _create(client, user_token).json()["data"]["${key}"]["id"]
        res = client.patch(
            f"${base}/{${idParam}}",
            json={"${label.snake}": ${sample(label).updated}},
            headers=auth_header(second_user_token),
        )
        assert res.status_code == 403

    def test_delete_${one}(self, client, user_token):
        ${idParam} = _create(client, user_token).json()["data"]["${key}"]["id"]
        res = client.delete(f"${base}/{${idParam}}", headers=auth_header(user_token))
        assert res.status_code == 200
        assert client.get(f"${base}/{${idParam}}", headers=auth_header(user_token)).status_code == 404

    def test_delete_${one}_forbidden(self, client, user_token, second_user_token):
        ${idParam} = _create(client, user_token).json()["data"]["${key}"]["id"]
        res = client.delete(f"${base}/{${idParam}}", headers=auth_header(second_user_token))
        assert res.status_code == 403
`,
    };
}

/** Merge `mod` into the `from src.routers import …` statement, kept sorted (ruff isort) and wrapped like ruff format. */
export function mergeRouterImport(statement: string, mod: string): string {
    const body = statement.replace(/^from src\.routers import\s*/, "").replace(/[()]/g, "");
    const names = [
        ...new Set([...body.split(",").map((n) => n.trim()), mod].filter(Boolean)),
    ].sort();
    const oneLine = `from src.routers import ${names.join(", ")}`;
    if (oneLine.length <= 100) return oneLine;
    return `from src.routers import (\n${names.map((n) => `    ${n},`).join("\n")}\n)`;
}

function register(ctx: Ctx): Patch[] {
    const mod = ctx.names.plural.snake;
    return [
        {
            path: "src/app.py",
            // Matches both the one-line and the parenthesised form, however many routers came before.
            anchor: /^from src\.routers import (?:\([^)]*\)|.+)$/m,
            where: "after",
            insert: `from src.routers import ${mod}`,
            skipIf: `__never__${mod}`,
            replace: (statement) => mergeRouterImport(statement, mod),
            describe: `import the ${mod} router`,
        },
        {
            path: "src/app.py",
            anchor: /^app\.include_router\(.*\)$/m,
            where: "after",
            insert: `\napp.include_router(${mod}.router, prefix="/api/v1")`,
            skipIf: `${mod}.router`,
            describe: `include the ${mod} router`,
        },
    ];
}

export const fastapi: Generator = {
    id: "fastapi",
    label: "FastAPI",
    kind: "backend",
    format: ruffFormat,
    commands: {
        resource: {
            describe:
                "SQLAlchemy model + pydantic schemas + router (included under /api/v1/<plural>) + pytest",
            files: (ctx) => [model(ctx), schema(ctx), router(ctx), test(ctx)],
            patches: register,
            notes: (ctx) => [
                `Tables come from Base.metadata.create_all at startup — restart the dev server and the ${ctx.names.plural.snake} table appears.`,
            ],
        },
        model: { describe: "SQLAlchemy model in src/models/", files: (ctx) => [model(ctx)] },
        controller: {
            describe: "APIRouter in src/routers/ using the {status, message, data} envelope",
            files: (ctx) => [router(ctx)],
        },
        dto: {
            describe: "pydantic Create/Update/Out schemas in src/schemas/",
            files: (ctx) => [schema(ctx)],
        },
        validator: {
            describe: "pydantic Create/Update/Out schemas in src/schemas/ (alias of make:dto)",
            files: (ctx) => [schema(ctx)],
        },
        test: { describe: "pytest module in tests/", files: (ctx) => [test(ctx)] },
    },
};
