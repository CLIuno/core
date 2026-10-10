export interface CaseSet {
    pascal: string;
    camel: string;
    kebab: string;
    snake: string;
    title: string;
}

export interface Names extends CaseSet {
    raw: string;
    plural: CaseSet;
}

const IRREGULAR: Record<string, string> = {
    person: "people",
    child: "children",
    man: "men",
    woman: "women",
    mouse: "mice",
    foot: "feet",
    tooth: "teeth",
    goose: "geese",
};

const UNCOUNTABLE = new Set([
    "news",
    "series",
    "species",
    "sheep",
    "fish",
    "deer",
    "equipment",
    "information",
    "media",
    "data",
]);

export function pluralize(word: string): string {
    const lower = word.toLowerCase();
    if (UNCOUNTABLE.has(lower)) return word;
    if (IRREGULAR[lower]) return matchCase(word, IRREGULAR[lower] as string);
    if (/(s|x|z|ch|sh)$/i.test(word)) return `${word}es`;
    if (/[^aeiou]y$/i.test(word)) return `${word.slice(0, -1)}ies`;
    if (/(?:fe|[^f]f)$/i.test(word)) return word.replace(/fe?$/i, "ves");
    return `${word}s`;
}

export function singularize(word: string): string {
    const lower = word.toLowerCase();
    if (UNCOUNTABLE.has(lower)) return word;
    for (const [singular, plural] of Object.entries(IRREGULAR)) {
        if (lower === plural) return matchCase(word, singular);
    }
    if (/ies$/i.test(word) && word.length > 4) return `${word.slice(0, -3)}y`;
    if (/(ss|us|is)$/i.test(word)) return word;
    if (/(ches|shes|xes|zes|sses|uses)$/i.test(word)) return word.slice(0, -2);
    if (/ves$/i.test(word) && word.length > 4) return `${word.slice(0, -3)}f`;
    if (/s$/i.test(word) && word.length > 2) return word.slice(0, -1);
    return word;
}

function matchCase(source: string, target: string): string {
    if (source[0] && source[0] === source[0].toUpperCase()) {
        return target[0]!.toUpperCase() + target.slice(1);
    }
    return target;
}

function words(raw: string): string[] {
    return raw
        .trim()
        .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
        .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((w) => w.toLowerCase());
}

function caseSet(parts: string[]): CaseSet {
    const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
    const pascal = parts.map(cap).join("");
    return {
        pascal,
        camel: pascal.charAt(0).toLowerCase() + pascal.slice(1),
        kebab: parts.join("-"),
        snake: parts.join("_"),
        title: parts.map(cap).join(" "),
    };
}

export function isValidName(raw: string): boolean {
    return /^[A-Za-z][A-Za-z0-9_ -]*$/.test(raw.trim());
}

/** Normalise any spelling/plurality of a resource name to one consistent set of cases. */
export function buildNames(raw: string): Names {
    if (!isValidName(raw)) {
        throw new Error(
            `Invalid name "${raw}": use letters, digits, "-" or "_" and start with a letter.`,
        );
    }
    const parts = words(raw);
    const last = parts[parts.length - 1] as string;
    const singularParts = [...parts.slice(0, -1), singularize(last)];
    const pluralParts = [
        ...singularParts.slice(0, -1),
        pluralize(singularParts[singularParts.length - 1] as string),
    ];
    return { raw, ...caseSet(singularParts), plural: caseSet(pluralParts) };
}
