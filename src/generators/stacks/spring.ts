import fs from "node:fs";
import path from "node:path";
import type { Ctx, FileSpec, Generator } from "../types";
import type { Field, FieldType } from "../fields";

// Stubs mirror CLIuno-Spring-template: public-field JPA entities, Spring Data repositories,
// controllers that call auth.require(request) and build the {status, message, data} envelope
// with Api.ok/created + Api.data("<camel>", …). Component scan registers everything — no patch.

const DEFAULT_PACKAGE = "com.cliuno.api";

const JAVA: Record<FieldType, string> = {
    string: "String",
    text: "String",
    int: "Integer",
    number: "Double",
    boolean: "Boolean",
    date: "Instant",
    json: "String",
};

/** Locals every handler already declares — a field with one of these names gets a suffix. */
const RESERVED = new Set(["request", "body", "user", "id", "mapper", "auth"]);

/** Spring Boot 4 ships Jackson 3 (`tools.jackson.*`); Boot 3 ships Jackson 2. Annotations stay in com.fasterxml. */
function jacksonFlavor(ctx: Ctx): 2 | 3 {
    try {
        const pom = fs.readFileSync(path.join(ctx.cwd, "pom.xml"), "utf8");
        const m = pom.match(
            /<artifactId>spring-boot-starter-parent<\/artifactId>\s*<version>(\d+)\./,
        );
        if (m) return Number(m[1]) >= 4 ? 3 : 2;
    } catch {
        // no pom (dry-run outside a checkout): assume the current template (Boot 4)
    }
    return 3;
}

function javaType(f: Field): string {
    if (f.type === "boolean" && !f.nullable) return "boolean";
    return JAVA[f.type];
}

function local(f: Field, names: Ctx["names"]): string {
    return RESERVED.has(f.camel) || f.camel === names.camel ? `${f.camel}Field` : f.camel;
}

/** `body.get("title")`, or the camelCase key with a snake_case fallback for multi-word names. */
function read(f: Field): string {
    return f.camel === f.snake
        ? `body.get("${f.camel}")`
        : `body.getOrDefault("${f.camel}", body.get("${f.snake}"))`;
}

/** Find the package that holds *Application.java (falls back to the template's). */
function basePackage(cwd: string): string {
    const root = path.join(cwd, "src", "main", "java");
    const queue = [root];
    let depth = 0;
    try {
        while (queue.length > 0 && depth < 8) {
            const next: string[] = [];
            for (const dir of queue) {
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                if (entries.some((e) => e.isFile() && e.name.endsWith("Application.java"))) {
                    return path.relative(root, dir).split(path.sep).join(".") || DEFAULT_PACKAGE;
                }
                for (const e of entries) if (e.isDirectory()) next.push(path.join(dir, e.name));
            }
            queue.splice(0, queue.length, ...next);
            depth++;
        }
    } catch {
        /* not a Spring tree (dry-run from elsewhere) — use the template package */
    }
    return DEFAULT_PACKAGE;
}

function pkgDir(pkg: string): string {
    return path.posix.join("src/main/java", ...pkg.split("."));
}

function entityField(f: Field): string {
    const annotations: string[] = [];
    if (f.type === "json") annotations.push("@JsonRawValue");
    const column: string[] = [];
    if (!f.nullable && f.type !== "boolean") column.push("nullable = false");
    if (f.type === "text" || f.type === "json") column.push('columnDefinition = "TEXT"');
    if (column.length > 0) annotations.push(`@Column(${column.join(", ")})`);
    const init = f.type === "boolean" && !f.nullable ? " = false" : "";
    const lines = annotations.map((a) => `    ${a}`);
    lines.push(`    public ${javaType(f)} ${f.camel}${init};`);
    return lines.join("\n");
}

function entity(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const pkg = basePackage(ctx.cwd);
    const imports = ["jakarta.persistence.*", "java.time.Instant"];
    if (fields.some((f) => f.type === "json"))
        imports.push("com.fasterxml.jackson.annotation.JsonRawValue");
    return {
        path: `${pkgDir(pkg)}/entity/${names.pascal}.java`,
        content: `package ${pkg}.entity;

${imports
    .sort()
    .map((i) => `import ${i};`)
    .join("\n")}

@Entity
@Table(name = "${names.plural.snake}")
public class ${names.pascal} {
    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    public Long id;

${fields.map(entityField).join("\n\n")}

    public Instant createdAt = Instant.now();
    public Instant updatedAt = Instant.now();

    @ManyToOne(optional = false)
    @JoinColumn(name = "user_id")
    public User user;
}
`,
    };
}

function repository(ctx: Ctx): FileSpec {
    const { names } = ctx;
    const pkg = basePackage(ctx.cwd);
    const P = names.pascal;
    return {
        path: `${pkgDir(pkg)}/repo/${P}Repository.java`,
        content: `package ${pkg}.repo;

import ${pkg}.entity.${P};
import java.util.List;
import org.springframework.data.jpa.repository.JpaRepository;

public interface ${P}Repository extends JpaRepository<${P}, Long> {
    List<${P}> findByUserIdOrderByCreatedAtDesc(Long userId);

    List<${P}> findAllByOrderByCreatedAtDesc();
}
`,
    };
}

/** `Type name = <read> instanceof X nameValue ? … : null;` for the store handler. */
function storeRead(f: Field, name: string): string {
    const v = `${name}Value`;
    const src = read(f);
    switch (f.type) {
        case "string":
        case "text":
            return `String ${name} = ${src} instanceof String ${v} ? ${v} : null;`;
        case "int":
            return `Integer ${name} = ${src} instanceof Number ${v} ? ${v}.intValue() : null;`;
        case "number":
            return `Double ${name} = ${src} instanceof Number ${v} ? ${v}.doubleValue() : null;`;
        case "boolean":
            return f.nullable
                ? `Boolean ${name} = ${src} instanceof Boolean ${v} ? ${v} : null;`
                : `boolean ${name} = ${src} instanceof Boolean ${v} ? ${v} : false;`;
        case "date":
            return `Instant ${name} = ${src} instanceof String ${v} ? parseInstant("${f.camel}", ${v}) : null;`;
        case "json":
            return `String ${name} = ${src} == null ? null : json("${f.camel}", ${src});`;
    }
}

function requiredGuard(f: Field, name: string): string | null {
    if (f.nullable || f.type === "boolean") return null;
    const check =
        f.type === "string" || f.type === "text"
            ? `${name} == null || ${name}.isBlank()`
            : `${name} == null`;
    return `        if (${check}) {
            throw new ApiException(400, "${f.pascal} is required");
        }`;
}

function updateAssign(f: Field, one: string, names: Ctx["names"]): string {
    const v = local(f, names);
    const src = read(f);
    const clear = f.nullable
        ? `
        } else if (body.containsKey("${f.camel}") && body.get("${f.camel}") == null) {
            ${one}.${f.camel} = null;
        }`
        : `
        }`;
    switch (f.type) {
        case "string":
        case "text":
            return `        if (${src} instanceof String ${v}) {
            ${one}.${f.camel} = ${v};${clear}`;
        case "int":
            return `        if (${src} instanceof Number ${v}) {
            ${one}.${f.camel} = ${v}.intValue();${clear}`;
        case "number":
            return `        if (${src} instanceof Number ${v}) {
            ${one}.${f.camel} = ${v}.doubleValue();${clear}`;
        case "boolean":
            return `        if (${src} instanceof Boolean ${v}) {
            ${one}.${f.camel} = ${v};${clear}`;
        case "date":
            return `        if (${src} instanceof String ${v}) {
            ${one}.${f.camel} = parseInstant("${f.camel}", ${v});${clear}`;
        case "json":
            return `        if (${src} != null) {
            ${one}.${f.camel} = json("${f.camel}", ${src});${clear}`;
    }
}

function controller(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const pkg = basePackage(ctx.cwd);
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const title = names.title;
    const titles = names.plural.title;
    const own = names.plural.kebab.replace(/-/g, " ");
    const hasDate = fields.some((f) => f.type === "date");
    const hasJson = fields.some((f) => f.type === "json");

    const imports = [
        `${pkg}.entity.${P}`,
        `${pkg}.entity.User`,
        `${pkg}.repo.*`,
        `${pkg}.support.Api`,
        `${pkg}.support.ApiException`,
        `${pkg}.support.AuthSupport`,
        "jakarta.servlet.http.HttpServletRequest",
        "java.time.Instant",
        "java.util.Map",
        "org.springframework.http.ResponseEntity",
        "org.springframework.web.bind.annotation.*",
    ];
    if (hasDate)
        imports.push(
            "java.time.LocalDate",
            "java.time.ZoneOffset",
            "java.time.format.DateTimeParseException",
        );
    const jackson = jacksonFlavor(ctx);
    if (hasJson)
        imports.push(
            jackson === 3
                ? "tools.jackson.core.JacksonException"
                : "com.fasterxml.jackson.core.JsonProcessingException",
            jackson === 3
                ? "tools.jackson.databind.ObjectMapper"
                : "com.fasterxml.jackson.databind.ObjectMapper",
        );

    const reads: string[] = [];
    const assigns: string[] = [];
    for (const f of fields) {
        const name = local(f, names);
        reads.push(`        ${storeRead(f, name)}`);
        const guard = requiredGuard(f, name);
        if (guard) reads.push(guard);
        assigns.push(`        ${one}.${f.camel} = ${name};`);
    }

    const mapperField = hasJson ? "\n    private final ObjectMapper mapper;" : "";
    const mapperParam = hasJson ? ", ObjectMapper mapper" : "";
    const mapperAssign = hasJson ? "\n        this.mapper = mapper;" : "";

    const helpers: string[] = [];
    if (hasDate)
        helpers.push(`
    private static Instant parseInstant(String field, String value) {
        try {
            return Instant.parse(value);
        } catch (DateTimeParseException e) {
            try {
                return LocalDate.parse(value).atStartOfDay(ZoneOffset.UTC).toInstant();
            } catch (DateTimeParseException ignored) {
                throw new ApiException(400, field + " must be an ISO-8601 date");
            }
        }
    }`);
    if (hasJson)
        helpers.push(`
    /** Store JSON columns as text; @JsonRawValue on the entity emits them as JSON again. */
    private String json(String field, Object value) {
        try {
            return value instanceof String raw
                    ? mapper.readTree(raw).toString()
                    : mapper.writeValueAsString(value);
        } catch (${jackson === 3 ? "JacksonException" : "JsonProcessingException"} e) {
            throw new ApiException(400, field + " must be valid JSON");
        }
    }`);

    return {
        path: `${pkgDir(pkg)}/controller/${P}Controller.java`,
        content: `package ${pkg}.controller;

${imports
    .sort()
    .map((i) => `import ${i};`)
    .join("\n")}

@RestController
@RequestMapping("/api/v1/${names.plural.kebab}")
public class ${P}Controller {
    private final ${P}Repository ${many};
    private final AuthSupport auth;${mapperField}

    public ${P}Controller(${P}Repository ${many}, AuthSupport auth${mapperParam}) {
        this.${many} = ${many};
        this.auth = auth;${mapperAssign}
    }

    private ${P} find(Long id) {
        return ${many}.findById(id).orElseThrow(() -> new ApiException(404, "${title} not found"));
    }

    @GetMapping
    public ResponseEntity<Map<String, Object>> index(HttpServletRequest request) {
        auth.require(request);
        return Api.ok("${titles}", Api.data("${many}", ${many}.findAllByOrderByCreatedAtDesc()));
    }

    @GetMapping("/current-user")
    public ResponseEntity<Map<String, Object>> currentUser(HttpServletRequest request) {
        User user = auth.require(request);
        return Api.ok("${titles}", Api.data("${many}", ${many}.findByUserIdOrderByCreatedAtDesc(user.id)));
    }

    @PostMapping
    public ResponseEntity<Map<String, Object>> store(
            HttpServletRequest request, @RequestBody Map<String, Object> body) {
        User user = auth.require(request);
${reads.join("\n")}

        ${P} ${one} = new ${P}();
${assigns.join("\n")}
        ${one}.user = user;
        ${many}.save(${one});
        return Api.created("${title} created successfully", Api.data("${one}", ${one}));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Map<String, Object>> show(
            HttpServletRequest request, @PathVariable Long id) {
        auth.require(request);
        return Api.ok("${title}", Api.data("${one}", find(id)));
    }

    @PatchMapping("/{id}")
    public ResponseEntity<Map<String, Object>> update(
            HttpServletRequest request, @PathVariable Long id, @RequestBody Map<String, Object> body) {
        User user = auth.require(request);
        ${P} ${one} = find(id);
        if (!${one}.user.id.equals(user.id)) {
            throw new ApiException(403, "You can only update your own ${own}");
        }
${fields.map((f) => updateAssign(f, one, names)).join("\n")}
        ${one}.updatedAt = Instant.now();
        ${many}.save(${one});
        return Api.ok("${title} updated", Api.data("${one}", ${one}));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Map<String, Object>> destroy(
            HttpServletRequest request, @PathVariable Long id) {
        User user = auth.require(request);
        ${P} ${one} = find(id);
        if (!${one}.user.id.equals(user.id)) {
            throw new ApiException(403, "You can only delete your own ${own}");
        }
        ${many}.delete(${one});
        return Api.ok("${title} deleted successfully", null);
    }${helpers.join("\n")}
}
`,
    };
}

function sample(f: Field): string {
    const values: Record<FieldType, string> = {
        string: `"Sample ${f.name}"`,
        text: `"Sample ${f.name}"`,
        int: "1",
        number: "1.5",
        boolean: "false",
        date: "Instant.now()",
        json: '"{}"',
    };
    return values[f.type];
}

function test(ctx: Ctx): FileSpec {
    const { names, fields } = ctx;
    const pkg = basePackage(ctx.cwd);
    const P = names.pascal;
    const one = names.camel;
    const many = names.plural.camel;
    const imports = [
        `${pkg}.entity.${P}`,
        `${pkg}.entity.User`,
        `${pkg}.repo.${P}Repository`,
        `${pkg}.repo.UserRepository`,
        "org.junit.jupiter.api.Test",
        "org.springframework.beans.factory.annotation.Autowired",
        "org.springframework.boot.test.context.SpringBootTest",
    ];
    if (fields.some((f) => f.type === "date" && !f.nullable)) imports.push("java.time.Instant");
    const assigns = fields
        .filter((f) => !f.nullable)
        .map((f) => `        ${one}.${f.camel} = ${sample(f)};`)
        .join("\n");
    return {
        path: `src/test/java/${pkg.split(".").join("/")}/${P}Tests.java`,
        content: `package ${pkg};

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

${imports
    .sort()
    .map((i) => `import ${i};`)
    .join("\n")}

@SpringBootTest
class ${P}Tests {
    @Autowired
    private ${P}Repository ${many};

    @Autowired
    private UserRepository users;

    @Test
    void savesAndListsByOwner() {
        String stamp = String.valueOf(System.nanoTime());
        User user = new User();
        user.username = "${names.kebab}-" + stamp;
        user.firstName = "${names.title}";
        user.lastName = "Tester";
        user.email = "${names.kebab}-" + stamp + "@example.com";
        user.password = "secret";
        users.save(user);

        ${P} ${one} = new ${P}();
${assigns}
        ${one}.user = user;
        ${many}.save(${one});

        assertTrue(${many}.findById(${one}.id).isPresent());
        assertEquals(1, ${many}.findByUserIdOrderByCreatedAtDesc(user.id).size());

        ${many}.delete(${one});
        users.delete(user);
    }
}
`,
    };
}

export const spring: Generator = {
    id: "spring",
    label: "Spring Boot",
    kind: "backend",
    commands: {
        resource: {
            describe:
                "JPA entity + repository + controller under /api/v1/<plural> + @SpringBootTest (component scan registers it)",
            files: (ctx) => [entity(ctx), repository(ctx), controller(ctx), test(ctx)],
            notes: (ctx) => [
                `ddl-auto=update creates the ${ctx.names.plural.snake} table on the next boot (./mvnw spring-boot:run).`,
                `Component scan picks up ${ctx.names.pascal}Controller — routes live at /api/v1/${ctx.names.plural.kebab} (+ /current-user).`,
                "Responses serialise fields as snake_case (Jackson SNAKE_CASE); requests accept camelCase or snake_case keys.",
            ],
        },
        model: {
            describe: "JPA entity + Spring Data repository in entity/ and repo/",
            files: (ctx) => [entity(ctx), repository(ctx)],
        },
        controller: {
            describe:
                "@RestController using auth.require + the Api envelope (needs the entity + repository)",
            files: (ctx) => [controller(ctx)],
        },
        test: {
            describe: "@SpringBootTest that saves one row through the repository",
            files: (ctx) => [test(ctx)],
        },
    },
};
