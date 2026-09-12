// The margin calculator, live: its figures equal the PDF engine's for a
// spread of trims, page counts and bleed settings; links resolve; no overflow.
// Run: node test/margin.mjs [baseUrl]
import { chromium } from "playwright";
import { TRIMS, PT, pageGeometry } from "../src/pdf/kdp.js";

const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };
const inch = (n) => `${(Math.round(n * 1000) / 1000).toString()}"`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const errors = [];
page.on("pageerror", (e) => errors.push(String(e)));
const res = await page.goto(`${base}/margin-calculator`, { waitUntil: "networkidle" });
check(res.status() === 200, "serves 200");

for (const trim of Object.keys(TRIMS)) {
  for (const pages of [24, 150, 151, 300, 301, 500, 501, 700, 701, 828]) {
    for (const bleed of [false, true]) {
      await page.selectOption("#trim", trim);
      await page.fill("#pages", String(pages));
      if ((await page.isChecked("#bleed")) !== bleed) await page.click("#bleed");
      await page.waitForTimeout(20);
      const g = pageGeometry({ trim, bleed, pageCount: pages });
      const want = {
        pageSize: `${inch(g.width / PT)} × ${inch(g.height / PT)}`,
        inside: inch(g.margin.inner / PT), outside: inch(g.margin.outer / PT), topBottom: inch(g.margin.top / PT),
      };
      for (const [id, v] of Object.entries(want)) {
        const got = await page.$eval(`#${id}`, (el) => el.textContent);
        check(got === v, `${trim} ${pages}p bleed=${bleed}: #${id} = ${got}, want ${v}`);
      }
    }
  }
}
const links = await page.$$eval("a[href^='/']", (as) => [...new Set(as.map((a) => a.getAttribute("href").split("#")[0]).filter(Boolean))]);
for (const href of links) {
  const r = await page.request.get(`${base}${href}`);
  check(r.status() === 200, `link ${href} → ${r.status()}`);
}
check(errors.length === 0, `page errors: ${errors.join("; ")}`);
check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no overflow at 1200");
await page.setViewportSize({ width: 390, height: 800 });
await page.reload({ waitUntil: "networkidle" });
check(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), "no overflow at 390");
await browser.close();
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log(`margin calculator OK — ${Object.keys(TRIMS).length * 10 * 2} combinations match the PDF engine`);
