// The spine table on /spine-calculator is written by scripts/spine-table.mjs
// from the same formula the calculator and the PDFs use. If a paper thickness
// changes and nobody reruns the script, the page would show two answers for
// the same book, the calculator's and the table's. This catches that.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { tableHtml, current, PAGE } from "../scripts/spine-table.mjs";

test("spine table on the calculator page matches the formula", () => {
  assert.equal(current(readFileSync(PAGE, "utf8")), tableHtml(), "run: node scripts/spine-table.mjs");
});
