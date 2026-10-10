import { test } from "node:test";
import assert from "node:assert/strict";
import { labelField, mapType, parseFields } from "./fields";

test("defaults when omitted", () => {
    const f = parseFields(undefined);
    assert.deepEqual(
        f.map((x) => [x.name, x.type, x.nullable]),
        [
            ["title", "string", false],
            ["description", "text", true],
        ],
    );
    assert.deepEqual(parseFields("  "), f);
});

test("tolerates spaces and trailing comma, maps aliases, marks nullable", () => {
    const f = parseFields(" name:string , price:float?, qty : integer, ");
    assert.deepEqual(
        f.map((x) => [x.name, x.type, x.nullable]),
        [
            ["name", "string", false],
            ["price", "number", true],
            ["qty", "int", false],
        ],
    );
});

test("unknown type lists the valid ones", () => {
    assert.throws(
        () => parseFields("price:money"),
        /string, text, int, number, boolean, date, json/,
    );
});

test("duplicates and malformed entries fail", () => {
    assert.throws(() => parseFields("a:string,a:text"), /Duplicate/);
    assert.throws(() => parseFields("justname"), /expected name:type/);
    assert.throws(() => parseFields("1x:string"), /Invalid field name/);
});

test("case variants of a field", () => {
    const [f] = parseFields("dueDate:date");
    assert.equal(f!.snake, "due_date");
    assert.equal(f!.camel, "dueDate");
    assert.equal(f!.pascal, "DueDate");
    assert.equal(
        mapType(f!, { string: 1, text: 2, int: 3, number: 4, boolean: 5, date: 6, json: 7 }),
        6,
    );
    assert.equal(labelField(parseFields("done:boolean,name:string")).name, "name");
});
