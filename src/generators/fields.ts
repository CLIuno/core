export const FIELD_TYPES = ["string", "text", "int", "number", "boolean", "date", "json"] as const;
export type FieldType = (typeof FIELD_TYPES)[number];

export interface Field {
    name: string;
    camel: string;
    snake: string;
    pascal: string;
    type: FieldType;
    nullable: boolean;
}

const ALIASES: Record<string, FieldType> = {
    str: "string",
    varchar: "string",
    longtext: "text",
    integer: "int",
    bigint: "int",
    float: "number",
    double: "number",
    decimal: "number",
    bool: "boolean",
    datetime: "date",
    timestamp: "date",
    object: "json",
    array: "json",
};

export const DEFAULT_FIELDS_SPEC = "title:string,description:text?";

function toParts(name: string): string[] {
    return name
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((w) => w.toLowerCase());
}

export function makeField(rawName: string, rawType: string, nullable: boolean): Field {
    const name = rawName.trim();
    if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) {
        throw new Error(
            `Invalid field name "${rawName}": use letters, digits or "_" and start with a letter.`,
        );
    }
    const typeKey = rawType.trim().toLowerCase();
    const type = (FIELD_TYPES as readonly string[]).includes(typeKey)
        ? (typeKey as FieldType)
        : ALIASES[typeKey];
    if (!type) {
        throw new Error(
            `Unknown field type "${rawType}" for "${name}". Valid types: ${FIELD_TYPES.join(", ")}.`,
        );
    }
    const parts = toParts(name);
    const pascal = parts.map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join("");
    return {
        name,
        camel: pascal.charAt(0).toLowerCase() + pascal.slice(1),
        snake: parts.join("_"),
        pascal,
        type,
        nullable,
    };
}

/** Parse `name:type?,other:type` — empty/undefined falls back to the default title/description pair. */
export function parseFields(spec?: string): Field[] {
    const source = spec && spec.trim() ? spec : DEFAULT_FIELDS_SPEC;
    const fields: Field[] = [];
    const seen = new Set<string>();
    for (const chunk of source.split(",")) {
        const item = chunk.trim();
        if (!item) continue;
        const [rawName, rawType] = item.split(":");
        if (!rawName || !rawType) {
            throw new Error(
                `Invalid field "${item}": expected name:type (e.g. title:string). Valid types: ${FIELD_TYPES.join(", ")}.`,
            );
        }
        const nullable = rawType.trim().endsWith("?");
        const field = makeField(
            rawName,
            nullable ? rawType.trim().slice(0, -1) : rawType,
            nullable,
        );
        if (seen.has(field.snake)) throw new Error(`Duplicate field "${field.name}".`);
        seen.add(field.snake);
        fields.push(field);
    }
    if (fields.length === 0) throw new Error("At least one field is required.");
    return fields;
}

export function mapType<T>(field: Field, map: Record<FieldType, T>): T {
    return map[field.type];
}

/** First string-ish field — used by stubs as the display/"title" column. */
export function labelField(fields: Field[]): Field {
    return (
        fields.find((f) => f.type === "string") ??
        fields.find((f) => f.type === "text") ??
        (fields[0] as Field)
    );
}
