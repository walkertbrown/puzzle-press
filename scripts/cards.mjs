// 1200×630 share cards for the pages that were using a portrait pin as their
// og:image (which X, Facebook and Slack crop badly). One per page, from the
// same real book images the pins use. Written to public/cards/.
//
// Usage: node scripts/cards.mjs
import { mkdirSync, readFileSync } from "node:fs";
import { chromium } from "playwright";
import { THEMES } from "../src/generator/wordlists.js";

const out = new URL("../public/cards/", import.meta.url).pathname;
mkdirSync(out, { recursive: true });
const pub = (p) => new URL(`../public/${p}`, import.meta.url).pathname;
const data = (p) => `data:image/png;base64,${readFileSync(pub(p)).toString("base64")}`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
const css = `
  *{box-sizing:border-box} body{margin:0;width:1200px;height:630px;display:flex;overflow:hidden;
    font-family:system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;background:#1d3557;color:#fff}
  .l{flex:1;padding:64px 56px 56px;display:flex;flex-direction:column;justify-content:space-between}
  .k{font-size:22px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:#a9b8d4}
  h1{font-size:58px;line-height:1.08;letter-spacing:-.02em;margin:18px 0 0}
  p{font-size:26px;line-height:1.35;color:#c9d3e6;margin:16px 0 0}
  .u{font-size:22px;color:#a9b8d4}
  .r{width:440px;position:relative;background:#e8eef8;overflow:hidden;flex:0 0 440px}
  /* The pins are 1000×1500 with a headline across the top; scale and offset so
     the page (roughly the middle 56% × 66% of the pin) fills the panel. */
  .r img{position:absolute;width:640px;height:auto;left:-100px;top:-225px}
`;
const card = async (file, { kicker, title, body, img }) => {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}</style>
    <div class="l"><div><div class="k">${kicker}</div><h1>${title}</h1><p>${body}</p></div><div class="u">puzzlepress.bananafest-destiny.com</div></div>
    <div class="r"><img src="${img}"></div>`);
  await page.waitForTimeout(150);
  await page.screenshot({ path: `${out}${file}` });
};

// The pin images are 1000×1500 with a headline on top; crop to the book image
// by showing them object-fit: cover from the top — the page is what shows.
await card("word-search-book-generator.png", { kicker: "Puzzle Press", title: "Word search book generator for Amazon KDP", body: "32 themes or your own list. Every word once, checked. Interior and cover, print-ready. Free to use.", img: data("pins/03-word-search.png") });
await card("sudoku-book-generator.png", { kicker: "Puzzle Press", title: "Sudoku book generator for Amazon KDP", body: "Every puzzle verified to have exactly one solution. Graded easy to expert. Free to use.", img: data("pins/04-sudoku.png") });
await card("maze-book-generator.png", { kicker: "Puzzle Press", title: "Maze book generator for Amazon KDP", body: "Perfect mazes, 15×15 to 39×39, one route each, solutions at the back. Free to use.", img: data("pins/05-mazes.png") });
await card("compare.png", { kicker: "Compared", title: "Four ways to make a KDP puzzle book", body: "Subscription suites, free generators, by hand, and Puzzle Press — what each costs and produces.", img: data("pins/01-puzzle-press.png") });
await card("margin-calculator.png", { kicker: "Free tool", title: "KDP margin calculator", body: "Page size, gutter, outside, top and bottom — for any trim, page count and bleed setting.", img: data("pins/02-spine.png") });
await card("word-lists.png", { kicker: "Free word lists", title: "32 themed word search lists", body: "1,660 words, each list sized for a 15×15 grid. Free to use in books you sell.", img: data("pins/03-word-search.png") });
for (const [id, t] of Object.entries(THEMES)) {
  await card(`word-list-${id}.png`, { kicker: "Free word list", title: `${t.title} word search words`, body: `${t.words.length} words, sized for a 15×15 grid. Free to use in any puzzle, including ones you sell.`, img: data("pins/03-word-search.png") });
}
await browser.close();
console.log(`wrote public/cards/ — ${6 + Object.keys(THEMES).length} cards`);
