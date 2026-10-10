import type { Ctx, FileSpec, Generator, Patch } from "../types";
import type { Field, FieldType } from "../fields";
import { labelField } from "../fields";

// Stubs mirror the template's todo resource: src/views/todo_views.py, src/serializers/
// todo_serializers.py, src/urls/todo_urls.py, src/tests/test_todos.py and the Todo model in
// src/models.py — DRF function views, `{status, message, data}` envelope, single quotes.
// No post-write formatter on purpose: the template is hand-formatted (single quotes, hanging
// indents) and `ruff format` would rewrite the patched src/models.py wholesale.

const MODEL_FIELD: Record<FieldType, string> = {
    string: "CharField",
    text: "TextField",
    int: "IntegerField",
    number: "FloatField",
    boolean: "BooleanField",
    date: "DateTimeField",
    json: "JSONField",
};

/** Field types whose JSON round-trip equals the Python literal (dates don't). */
const COMPARABLE = new Set<FieldType>(["string", "text", "int", "number", "boolean", "json"]);

function modelField(f: Field): string {
    const opts: string[] = [];
    if (f.type === "string") opts.push("max_length=255");
    if (f.nullable) opts.push("blank=True", "null=True");
    else if (f.type === "boolean") opts.push("default=False");
    return `    ${f.snake} = models.${MODEL_FIELD[f.type]}(${opts.join(", ")})`;
}

/** Sample literals for tests: ORM create value, JSON create payload value, JSON update value. */
function sample(f: Field): { orm: string; api: string; updated: string } {
    switch (f.type) {
        case "string":
        case "text":
            return {
                orm: `'Test ${f.snake}'`,
                api: `'New ${f.snake}'`,
                updated: `'Updated ${f.snake}'`,
            };
        case "int":
            return { orm: "1", api: "2", updated: "3" };
        case "number":
            return { orm: "1.5", api: "2.5", updated: "3.5" };
        case "boolean":
            return { orm: "False", api: "True", updated: "True" };
        case "date":
            return {
                orm: "timezone.now()",
                api: "'2026-01-01T00:00:00Z'",
                updated: "'2026-02-01T00:00:00Z'",
            };
        case "json":
            return {
                orm: "{'key': 'value'}",
                api: "{'key': 'new'}",
                updated: "{'key': 'updated'}",
            };
    }
}

function required(fields: Field[]): Field[] {
    return fields.filter((f) => !f.nullable && f.type !== "boolean");
}

/** `[a, b]` on one line when it fits in 99 columns, else one item per line. */
function pyList(items: string[], indent: number, prefixLength: number): string {
    const inline = `[${items.join(", ")}]`;
    if (indent + prefixLength + inline.length <= 99) return inline;
    const pad = " ".repeat(indent);
    return `[\n${items.map((item) => `${pad}    ${item},`).join("\n")}\n${pad}]`;
}

function pyDict(pairs: string[], indent: number): string {
    const inline = `{${pairs.join(", ")}}`;
    if (indent + inline.length + 1 <= 99) return inline;
    const pad = " ".repeat(indent);
    return `{\n${pairs.map((pair) => `${pad}    ${pair},`).join("\n")}\n${pad}}`;
}

function modelClass(ctx: Ctx): string {
    const { names, fields } = ctx;
    const label = labelField(fields);
    const str =
        (label.type === "string" || label.type === "text") && !label.nullable
            ? `self.${label.snake}`
            : `str(self.${label.snake})`;
    return `class ${names.pascal}(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
${fields.map(modelField).join("\n")}
    user = models.ForeignKey(
        User, on_delete=models.CASCADE, related_name='${names.plural.snake}')
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = '${names.plural.snake}'
        ordering = ['-created_at']

    def __str__(self):
        return ${str}
`;
}

/** Append the model class at the end of src/models.py (after the last non-blank character). */
function modelPatch(ctx: Ctx): Patch {
    return {
        path: "src/models.py",
        anchor: /\S\s*$/,
        where: "after",
        insert: `\n\n${modelClass(ctx)}`,
        skipIf: `class ${ctx.names.pascal}(models.Model):`,
        describe: `append the ${ctx.names.pascal} model`,
    };
}

function serializer(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const all = ["id", ...fields.map((f) => f.snake), "user", "created_at", "updated_at"].map(
        (f) => `'${f}'`,
    );
    return {
        path: `src/serializers/${names.snake}_serializers.py`,
        content: `from rest_framework import serializers

from src.models import ${names.pascal}


class ${names.pascal}Serializer(serializers.ModelSerializer):
    class Meta:
        model = ${names.pascal}
        fields = ${pyList(all, 8, "fields = ".length)}
        read_only_fields = ['id', 'user', 'created_at', 'updated_at']
`,
    };
}

function views(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const P = names.pascal;
    const one = names.snake;
    const many = names.plural.snake;
    const key = names.camel;
    const keys = names.plural.camel;
    const title = names.title;
    const titles = names.plural.title;
    const own = names.plural.kebab.replace(/-/g, " ");
    const notFound = `        return Response(
            {'status': 'error', 'message': '${title} not found'},
            status=status.HTTP_404_NOT_FOUND,
        )`;
    const invalid = `        return Response(
            {'status': 'error', 'message': serializer.errors},
            status=status.HTTP_400_BAD_REQUEST,
        )`;

    return {
        path: `src/views/${one}_views.py`,
        content: `from rest_framework import status
from rest_framework.decorators import api_view, permission_classes
from rest_framework.permissions import IsAuthenticated
from rest_framework.response import Response

from src.models import ${P}
from src.serializers.${one}_serializers import ${P}Serializer


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_current_user_${many}(request):
    ${many} = ${P}.objects.filter(user=request.user)
    return Response({
        'status': 'success',
        'message': '${titles} fetched successfully',
        'data': {'${keys}': ${P}Serializer(${many}, many=True).data},
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_all_${many}(request):
    ${many} = ${P}.objects.select_related('user').all()
    return Response({
        'status': 'success',
        'message': '${titles} fetched successfully',
        'data': {'${keys}': ${P}Serializer(${many}, many=True).data},
    })


@api_view(['GET'])
@permission_classes([IsAuthenticated])
def get_${one}_by_id(request, pk):
    try:
        ${one} = ${P}.objects.select_related('user').get(id=pk)
    except ${P}.DoesNotExist:
${notFound}
    return Response({
        'status': 'success',
        'message': '${title} fetched successfully',
        'data': {'${key}': ${P}Serializer(${one}).data},
    })


@api_view(['POST'])
@permission_classes([IsAuthenticated])
def create_${one}(request):
    serializer = ${P}Serializer(data=request.data)
    if not serializer.is_valid():
${invalid}

    ${one} = serializer.save(user=request.user)
    return Response({
        'status': 'success',
        'message': '${title} created successfully',
        'data': {'${key}': ${P}Serializer(${one}).data},
    }, status=status.HTTP_201_CREATED)


@api_view(['PATCH'])
@permission_classes([IsAuthenticated])
def update_${one}(request, pk):
    try:
        ${one} = ${P}.objects.select_related('user').get(id=pk)
    except ${P}.DoesNotExist:
${notFound}

    if ${one}.user.id != request.user.id:
        return Response(
            {'status': 'error', 'message': 'You can only update your own ${own}'},
            status=status.HTTP_403_FORBIDDEN,
        )

    serializer = ${P}Serializer(${one}, data=request.data, partial=True)
    if not serializer.is_valid():
${invalid}
    serializer.save()

    return Response({
        'status': 'success',
        'message': '${title} updated successfully',
        'data': {'${key}': ${P}Serializer(${one}).data},
    })


@api_view(['DELETE'])
@permission_classes([IsAuthenticated])
def delete_${one}(request, pk):
    try:
        ${one} = ${P}.objects.select_related('user').get(id=pk)
    except ${P}.DoesNotExist:
${notFound}

    if ${one}.user.id != request.user.id:
        return Response(
            {'status': 'error', 'message': 'You can only delete your own ${own}'},
            status=status.HTTP_403_FORBIDDEN,
        )

    ${one}.delete()
    return Response({'status': 'success', 'message': '${title} deleted successfully'})
`,
    };
}

function urls(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const one = names.snake;
    const many = names.plural.snake;
    const imported = [
        `create_${one}`,
        `delete_${one}`,
        `get_all_${many}`,
        `get_current_user_${many}`,
        `get_${one}_by_id`,
        `update_${one}`,
    ].sort();
    return {
        path: `src/urls/${one}_urls.py`,
        content: `from django.urls import path

from src.urls.dispatch import method_dispatch
from src.views.${one}_views import (
${imported.map((name) => `    ${name},`).join("\n")}
)

urlpatterns = [
    path('/current-user', get_current_user_${many}, name='${names.kebab}-current-user'),
    path('', method_dispatch(GET=get_all_${many}, POST=create_${one}), name='${names.kebab}-collection'),
    path('/<uuid:pk>',
         method_dispatch(GET=get_${one}_by_id, PATCH=update_${one}, DELETE=delete_${one}),
         name='${names.kebab}-detail'),
]
`,
    };
}

function urlPatch(ctx: Ctx): Patch {
    const { names } = ctx;
    return {
        path: "src/urls/__init__.py",
        anchor: /^ {4}path\('[^']*', include\('src\.urls\.\w+'\)\),$/m,
        where: "after",
        insert: `\n    path('${names.plural.kebab}', include('src.urls.${names.snake}_urls')),`,
        skipIf: `src.urls.${names.snake}_urls`,
        describe: `mount /${names.plural.kebab}`,
    };
}

function test(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const P = names.pascal;
    const one = names.snake;
    const many = names.plural.snake;
    const key = names.camel;
    const keys = names.plural.camel;
    const label = labelField(fields);
    const base = `/api/v1/${names.plural.kebab}`;
    const hasDate = fields.some((f) => f.type === "date");
    const ormKwargs = (owner: string) =>
        [...fields.map((f) => `${f.snake}=${sample(f).orm}`), `user=${owner}`]
            .map((kw) => `            ${kw},`)
            .join("\n");
    const createPayload = pyDict(
        fields.map((f) => `'${f.snake}': ${sample(f).api}`),
        12,
    );
    const updatePayload = `{'${label.snake}': ${sample(label).updated}}`;
    const assertLabel = (expr: string, value: string) =>
        COMPARABLE.has(label.type)
            ? `self.assertEqual(${expr}['${label.snake}'], ${value})`
            : `self.assertIn('${label.snake}', ${expr})`;
    const assertUpdated = COMPARABLE.has(label.type)
        ? `\n        self.assertEqual(self.${one}.${label.snake}, ${sample(label).updated})`
        : "";
    const missingRequired =
        required(fields).length > 0
            ? `
    def test_create_${one}_missing_required(self):
        resp = self.client.post(
            '${base}',
            {},
            content_type='application/json',
            **self.auth_header(),
        )
        self.assertEqual(resp.status_code, 400)
`
            : "";

    return {
        path: `src/tests/test_${many}.py`,
        content: `import uuid
${hasDate ? "\nfrom django.utils import timezone\n" : ""}
from src.models import ${P}
from src.tests.base import BaseTestCase


class ${P}CRUDTest(BaseTestCase):
    def setUp(self):
        super().setUp()
        self.${one} = ${P}.objects.create(
${ormKwargs("self.user")}
        )

    def test_get_all_${many}(self):
        resp = self.client.get('${base}', **self.auth_header())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()['data']['${keys}']), 1)

    def test_get_${one}_by_id(self):
        resp = self.client.get(
            f'${base}/{self.${one}.id}', **self.auth_header()
        )
        self.assertEqual(resp.status_code, 200)
        ${assertLabel(`resp.json()['data']['${key}']`, sample(label).orm)}

    def test_get_${one}_not_found(self):
        resp = self.client.get(
            f'${base}/{uuid.uuid4()}', **self.auth_header()
        )
        self.assertEqual(resp.status_code, 404)

    def test_create_${one}(self):
        resp = self.client.post(
            '${base}',
            ${createPayload},
            content_type='application/json',
            **self.auth_header(),
        )
        self.assertEqual(resp.status_code, 201)
        ${assertLabel(`resp.json()['data']['${key}']`, sample(label).api)}
${missingRequired}
    def test_update_own_${one}(self):
        resp = self.client.patch(
            f'${base}/{self.${one}.id}',
            ${updatePayload},
            content_type='application/json',
            **self.auth_header(),
        )
        self.assertEqual(resp.status_code, 200)
        self.${one}.refresh_from_db()${assertUpdated}

    def test_cannot_update_others_${one}(self):
        other_${one} = ${P}.objects.create(
${ormKwargs("self.admin_user")}
        )
        resp = self.client.patch(
            f'${base}/{other_${one}.id}',
            ${updatePayload},
            content_type='application/json',
            **self.auth_header(),
        )
        self.assertEqual(resp.status_code, 403)

    def test_delete_own_${one}(self):
        resp = self.client.delete(
            f'${base}/{self.${one}.id}', **self.auth_header()
        )
        self.assertEqual(resp.status_code, 200)
        self.assertFalse(${P}.objects.filter(id=self.${one}.id).exists())

    def test_get_current_user_${many}(self):
        resp = self.client.get(
            '${base}/current-user', **self.auth_header())
        self.assertEqual(resp.status_code, 200)
        self.assertEqual(len(resp.json()['data']['${keys}']), 1)

    def test_no_auth(self):
        resp = self.client.get('${base}')
        self.assertEqual(resp.status_code, 401)
`,
    };
}

function migrateNote(ctx: Ctx): string {
    return `Create and apply the migration: uv run python manage.py makemigrations src && uv run python manage.py migrate (the ${ctx.names.plural.snake} table does not exist until then).`;
}

export const django: Generator = {
    id: "django",
    label: "Django",
    kind: "backend",
    commands: {
        resource: {
            describe:
                "model appended to src/models.py + serializer + DRF views + urls (mounted under /api/v1/<plural>) + TestCase",
            files: (ctx) => [serializer(ctx), views(ctx), urls(ctx), test(ctx)],
            patches: (ctx) => [modelPatch(ctx), urlPatch(ctx)],
            notes: (ctx) => [
                migrateNote(ctx),
                `Run the suite: uv run python manage.py test src.tests.test_${ctx.names.plural.snake}`,
            ],
        },
        model: {
            describe: "model class appended to src/models.py",
            patches: (ctx) => [modelPatch(ctx)],
            notes: (ctx) => [migrateNote(ctx)],
        },
        migration: {
            describe: "manage.py makemigrations src --name <snake> (after editing src/models.py)",
            native: (ctx) => [
                {
                    bin: "uv",
                    args: [
                        "run",
                        "python",
                        "manage.py",
                        "makemigrations",
                        "src",
                        "--name",
                        ctx.names.snake,
                    ],
                },
            ],
            notes: () => ["Apply it with: uv run python manage.py migrate"],
        },
        controller: {
            describe: "DRF function views in src/views/ using the {status, message, data} envelope",
            files: (ctx) => [views(ctx)],
        },
        validator: {
            describe: "ModelSerializer in src/serializers/",
            files: (ctx) => [serializer(ctx)],
        },
        test: { describe: "TestCase in src/tests/ (BaseTestCase)", files: (ctx) => [test(ctx)] },
    },
};
