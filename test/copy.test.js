// Copy that has drifted from the product. Four times this week a number or a
// list on a page was true when it was written and false by the time anyone
// read it — the launch file, the pricing block, the demo caption, the home
// page's own <title>. A person re-reading everything after every change does
// not scale; a test does.
//
// Two rules, checked against every published page and every marketing file:
//   1. A claim with a number in it must equal the number the code uses.
//   2. A page that talks about the puzzle types at all must know about all
//      of them.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { THEMES } from "../src/generator/wordlists.js";
import { CLUES } from "../src/generator/clues.js";
import { MIN_PAGES, MAX_PAGES } from "../src/pdf/kdp.js";
import { SUDOKU_DIFFICULTY } from "../src/generator/sudoku.js";
import { MAZE_DIFFICULTY } from "../src/generator/maze.js";
import { PRICE_LABEL } from "../src/ui/license.js";

const ROOT = new URL("..", import.meta.url).pathname;
const files = [];
const walk = (dir, filter) => {
  for (const e of readdirSync(join(ROOT, dir), { withFileTypes: true })) {
    if (e.isDirectory()) walk(join(dir, e.name), filter);
    else if (filter(e.name)) files.push(join(dir, e.name));
  }
};
walk("public", (n) => n.endsWith(".html"));
walk("marketing", (n) => n.endsWith(".md"));

const TEXT = new Map(
  files.map((f) => {
    let s = readFileSync(join(ROOT, f), "utf8");
    s = s.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ");
    return [f, s];
  }),
);

// ---- 1. Numbers that must match the code.
const THEME_COUNT = Object.keys(THEMES).length;
const CLUE_COUNT = Object.keys(CLUES).length;
const PRICE = Number(PRICE_LABEL.match(/\$(\d+)/)[1]);

const numberClaims = [
  // [what it is, pattern with one capture, the true value]
  ["themes", /(\d+)\s+(?:built-in\s+)?(?:word[- ]search\s+)?themes/gi, THEME_COUNT],
  ["themed word lists", /(\d+)\s+themed\s+lists/gi, THEME_COUNT],
  // Four digits or a comma, so a sudoku's "26 clues" is not mistaken for the
  // size of the clue table.
  ["clue table", /\b(\d{1,3},\d{3}|\d{4,})\s+(?:\w+[- ])?clues\b/gi, CLUE_COUNT],
  ["price", /\$(\d+)\s+(?:once|one-time)/gi, PRICE],
  ["KDP page minimum", /KDP'?s?\s+(\d+)-page minimum/gi, MIN_PAGES],
  ["page range", /(\d+)\s*(?:–|-|to)\s*828\s+pages/gi, MIN_PAGES],
  ["max pages", /24\s*(?:–|-|to)\s*(\d+)\s+pages/gi, MAX_PAGES],
  ["sudoku expert clues", /expert[^.]{0,40}?\b(\d\d)\s+clues/gi, SUDOKU_DIFFICULTY.expert.givens],

];

// The maze range is quoted as a pair ("15×15 up to 39×39"), so check both
// ends of any such pair rather than every square grid mentioned anywhere.
test("the maze size range matches the code", () => {
  const wrong = [];
  for (const [file, text] of TEXT) {
    for (const m of text.matchAll(/(\d+)\s*×\s*\1\s*(?:up\s+)?to\s*(\d+)\s*×\s*\2/gi)) {
      if (Number(m[1]) !== MAZE_DIFFICULTY.easy.w || Number(m[2]) !== MAZE_DIFFICULTY.expert.w) {
        wrong.push(`${file}: maze range "${m[0]}" but the code is ${MAZE_DIFFICULTY.easy.w}×${MAZE_DIFFICULTY.easy.h} to ${MAZE_DIFFICULTY.expert.w}×${MAZE_DIFFICULTY.expert.h}`);
      }
    }
  }
  assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);
});

test("every number in the copy matches the number in the code", () => {
  const wrong = [];
  for (const [file, text] of TEXT) {
    for (const [what, re, truth] of numberClaims) {
      for (const m of text.matchAll(re)) {
        const found = Number(m[1].replace(/,/g, ""));
        if (found !== truth) wrong.push(`${file}: ${what} says ${found}, code says ${truth} — "${m[0].trim().slice(0, 70)}"`);
      }
    }
  }
  assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);
});

// ---- 2. Pages that discuss the types must know all of them.
const TYPES = {
  "word search": /word\s?search/i,
  sudoku: /sudoku/i,
  mazes: /\bmaze/i,
  "criss-cross": /criss-?cross|fill-?in/i,
  crosswords: /crossword/i,
};
// A page about one type, or a word list, is allowed to talk about its own
// subject without reciting the catalogue; the shared pages are not.
const MUST_KNOW_ALL = [
  "public/index.html",
  "public/compare.html",
  "public/how-to-make-a-puzzle-book.html",
  "marketing/product-hunt.md",
  "marketing/show-hn.md",
];

test("a page that lists the puzzle types lists all of them", () => {
  const gaps = [];
  for (const file of MUST_KNOW_ALL) {
    const text = TEXT.get(file);
    assert.ok(text, `${file} not found — rename it here too`);
    const missing = Object.entries(TYPES).filter(([, re]) => !re.test(text)).map(([name]) => name);
    if (missing.length) gaps.push(`${file} never mentions: ${missing.join(", ")}`);
  }
  assert.deepEqual(gaps, [], `\n${gaps.join("\n")}\n`);
});

test("no page still counts the types wrongly", () => {
  const total = Object.keys(TYPES).length;
  const words = { three: 3, four: 4, five: 5, six: 6 };
  const wrong = [];
  for (const [file, text] of TEXT) {
    // Only counts that are about the product: a note saying an old video
    // "shows three types" is describing the video, and is true.
    const patterns = [
      /\b(three|four|five|six|\d)\s+puzzle\s+types?\b/gi,
      /\ball\s+(three|four|five|six)\s+(?:also|puzzle|types)/gi,
      /\b(three|four|five|six)\s+kinds?\s+of\s+(?:KDP\s+)?puzzle\s+book/gi,
    ];
    for (const m of patterns.flatMap((re) => [...text.matchAll(re)])) {
      const n = words[m[1].toLowerCase()] ?? Number(m[1]);
      if (n !== total) wrong.push(`${file}: "${m[0]}" but there are ${total} types`);
    }
  }
  assert.deepEqual(wrong, [], `\n${wrong.join("\n")}\n`);
});
