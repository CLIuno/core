import { test } from "node:test";
import assert from "node:assert/strict";
import { buildNames, pluralize, singularize } from "./names";

test("every spelling normalises to the same set", () => {
    for (const raw of [
        "post",
        "Posts",
        "blog-post",
        "BlogPost",
        "blog_posts",
        "Blog Posts",
        "blogPosts",
    ]) {
        const n = buildNames(raw);
        const expectPascal = raw.toLowerCase().includes("blog") ? "BlogPost" : "Post";
        assert.equal(n.pascal, expectPascal, raw);
        assert.equal(n.plural.pascal, `${expectPascal}s`, raw);
    }
    const n = buildNames("blog-post");
    assert.deepEqual(
        [n.pascal, n.camel, n.kebab, n.snake, n.title],
        ["BlogPost", "blogPost", "blog-post", "blog_post", "Blog Post"],
    );
    assert.deepEqual(
        [n.plural.pascal, n.plural.camel, n.plural.kebab, n.plural.snake],
        ["BlogPosts", "blogPosts", "blog-posts", "blog_posts"],
    );
});

test("plural rules", () => {
    assert.equal(pluralize("category"), "categories");
    assert.equal(pluralize("box"), "boxes");
    assert.equal(pluralize("person"), "people");
    assert.equal(pluralize("status"), "statuses");
    assert.equal(pluralize("day"), "days");
    assert.equal(pluralize("leaf"), "leaves");
    assert.equal(singularize("categories"), "category");
    assert.equal(singularize("statuses"), "status");
    assert.equal(singularize("people"), "person");
    assert.equal(singularize("todos"), "todo");
    assert.equal(singularize("address"), "address");
});

test("invalid names are rejected", () => {
    assert.throws(() => buildNames("1abc"), /Invalid name/);
    assert.throws(() => buildNames("a/b"), /Invalid name/);
});
