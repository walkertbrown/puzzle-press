// The word-list pages, live: index + every theme serves, each page lists
// exactly the words the product has for that theme, the sample grid really
// contains every listed word, and the button opens the tool with that theme
// — and only that theme — ticked.
// Run: node test/wordlists.mjs [baseUrl]
import { chromium } from "playwright";
import { THEMES } from "../src/generator/wordlists.js";
import { findOccurrences } from "../src/generator/wordsearch.js";

const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });

const idx = await page.goto(`${base}/word-lists/`, { waitUntil: "networkidle" });
check(idx.status() === 200, "index serves");
const indexLinks = await page.$$eval(".all a", (as) => as.map((a) => a.getAttribute("href")));
check(indexLinks.length === Object.keys(THEMES).length, `index lists ${indexLinks.length} themes`);

for (const [id, t] of Object.entries(THEMES)) {
  const res = await page.goto(`${base}/word-lists/${id}`, { waitUntil: "networkidle" });
  check(res.status() === 200, `${id} serves`);
  const listed = await page.$$eval(".words li", (lis) => lis.map((li) => li.textContent.trim().toLowerCase()));
  const expected = t.words.map((w) => w.toLowerCase()).sort();
  check(JSON.stringify(listed) === JSON.stringify(expected), `${id}: page list equals the product's list (${listed.length}/${expected.length})`);

  // The sample grid: every word under it occurs in it exactly once.
  const grid = await page.$$eval(".puzzle svg text", (ts) => ts.map((x) => x.textContent));
  const n = Math.round(Math.sqrt(grid.length));
  const rows = Array.from({ length: n }, (_, r) => grid.slice(r * n, r * n + n));
  const words = await page.$$eval(".puzzle .wl li", (lis) => lis.map((li) => li.textContent.trim()));
  check(words.length > 0, `${id}: sample puzzle has words`);
  for (const w of words) {
    const hits = findOccurrences(rows, w, n).length;
    // A palindrome reads the same both ways over the same cells: two hits, one word.
    const want = w === w.split("").reverse().join("") ? 2 : 1;
    check(hits === want, `${id}: ${w} appears ${hits}× in the sample grid`);
  }
  check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${id}: no overflow`);
}

// One deep link, end to end.
const first = Object.keys(THEMES)[5];
await page.goto(`${base}/word-lists/${first}`, { waitUntil: "networkidle" });
await page.click("main .actions a.btn");
await page.waitForFunction(() => document.querySelector("#meta")?.textContent.length > 0);
const checked = await page.$$eval(".themes input:checked", (cbs) => cbs.map((c) => c.value));
check(JSON.stringify(checked) === JSON.stringify([first]), `deep link ticks exactly [${first}] (got ${checked})`);
const title = await page.$eval("#title", (el) => el.value);
check(title === `${THEMES[first].title} Word Search`, `deep link sets the title ("${title}")`);
const themeOnPage = await page.$eval("#page", (el) => el.textContent);
check(themeOnPage.includes(THEMES[first].title), "preview shows that theme");

// Phone width.
await page.setViewportSize({ width: 390, height: 800 });
await page.goto(`${base}/word-lists/halloween`, { waitUntil: "networkidle" });
check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "halloween: no overflow at 390px");

await browser.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`word lists OK — ${Object.keys(THEMES).length} pages, every listed word found exactly once in its sample grid`);
