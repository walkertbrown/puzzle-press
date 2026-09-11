// The three type pages, live: they serve, every internal link resolves, the
// figures they quote match the code, and "Make a book free" lands on the tool
// with that type already selected.
// Run: node test/typepages.mjs [baseUrl]
import { chromium } from "playwright";
import { planPages, solutionsPerPageFor, solutionsThatFit } from "../src/pdf/layout.js";
import { pageGeometry } from "../src/pdf/kdp.js";
import { printingCost } from "../src/pdf/kdp-cost.js";

const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const slugs = { "word-search-book-generator": "wordsearch", "sudoku-book-generator": "sudoku", "maze-book-generator": "maze" };
let failed = 0;
const check = (ok, msg) => { console.log(`${ok ? "ok  " : "FAIL"} ${msg}`); if (!ok) failed++; };

const fits = solutionsThatFit(pageGeometry({ trim: "6x9", bleed: false }));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });

for (const [slug, kind] of Object.entries(slugs)) {
  const res = await page.goto(`${base}/${slug}`, { waitUntil: "networkidle" });
  check(res.status() === 200, `${slug} serves 200`);
  const html = await page.content();
  for (const n of [20, 50, 100]) {
    const pages = planPages(n, solutionsPerPageFor(n, fits)).total;
    const cost = printingCost({ trim: "6x9", pages, ink: "black" }).cost.toFixed(2);
    check(html.includes(`<td>${n}</td><td>${pages}</td><td>$${cost}</td>`), `${slug}: ${n} puzzles → ${pages} pages, $${cost}`);
  }
  const links = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => a.getAttribute("href")))]);
  for (const href of links) {
    const url = href.split("#")[0];
    if (!url) continue;
    const r = await page.request.get(`${base}${url}`);
    check(r.status() === 200, `${slug}: link ${href} → ${r.status()}`);
  }
  const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth);
  check(wide, `${slug}: no horizontal overflow`);

  // The button lands on the tool with the type chosen.
  await page.click("main .actions a.btn");
  // The select exists before the module runs; wait for the preview meta,
  // which is written only after the kind has been applied.
  await page.waitForFunction(() => document.querySelector("#meta")?.textContent.length > 0);
  const selected = await page.$eval("#kind", (el) => el.value);
  check(selected === kind, `${slug}: tool opens with kind=${selected}`);
  const title = await page.$eval("#title", (el) => el.value);
  check(title.length > 0, `${slug}: default title for that type ("${title}")`);
}

// Phone width, one page.
await page.setViewportSize({ width: 390, height: 800 });
await page.goto(`${base}/maze-book-generator`, { waitUntil: "networkidle" });
check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "maze page: no overflow at 390px");

await browser.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("type pages OK");
