// Google shows about 155 characters of a meta description. Past that the end
// is cut off, and the end is where "free" and the price sit.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync } from "node:fs";

const pub = new URL("../public/", import.meta.url);
const files = [
  ...readdirSync(pub).filter((f) => f.endsWith(".html")),
  ...readdirSync(new URL("word-lists/", pub)).filter((f) => f.endsWith(".html")).map((f) => `word-lists/${f}`),
];
const unescape = (s) => s.replace(/&amp;/g, "&").replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

test("every description fits in a Google result", () => {
  assert.ok(files.length > 90);
  for (const f of files) {
    const d = readFileSync(new URL(f, pub), "utf8").match(/name="description" content="([^"]*)"/)?.[1];
    if (d === undefined) continue;
    assert.ok(unescape(d).length <= 155, `${f}: ${unescape(d).length} characters`);
  }
});
