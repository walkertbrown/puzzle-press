// Look at the thing.
//
// I have spent three days reasoning about this page out of markup, beacons and
// computed styles, and twice been wrong in ways a glance would have caught: a
// panel painted in the error palette, and a word describing the product as
// worse than it is. Both were visible. Neither was visible to grep.
//
// This takes the page at the moment a stranger meets the generator — the scroll
// position where /px/tool fires — and writes a PNG per device, cold, no
// licence, nothing typed. It asserts nothing. It exists so that "what does a
// visitor actually see" has an answer that is a picture.
//
// Usage: node test/lookat.mjs [outdir] [path]
//
// With a path other than "/" it takes the top and the fold of that page instead
// of the generator sequence — for the hundred-odd acquisition pages, where the
// only question is what a searcher meets and whether anything on screen tells
// them what to do next.
import * as playwright from "playwright";
import { devices } from "playwright";
import fs from "node:fs";
import path from "node:path";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const OUT = process.argv[2] || "/tmp/lookat";
const PATH = process.argv[3] || "/";
fs.mkdirSync(OUT, { recursive: true });

const SHOTS = [
  { name: "desktop", engine: "chromium", ctx: { viewport: { width: 1280, height: 900 } } },
  { name: "iphone13", engine: "webkit", ctx: devices["iPhone 13"] },
];

for (const s of SHOTS) {
  const browser = await playwright[s.engine].launch();
  const ctx = await browser.newContext(s.ctx);
  const page = await ctx.newPage();
  await page.route("https://static.cloudflareinsights.com/**", (r) => r.abort());
  await page.goto(BASE + PATH, { waitUntil: "domcontentloaded" });

  if (PATH !== "/") {
    // A static acquisition page. Two shots: what is above the fold, and what is
    // one screen down — the whole of the decision, for a searcher who arrived
    // on a phrase and is deciding in about four seconds whether to stay.
    await page.waitForTimeout(1200);
    await page.screenshot({ path: path.join(OUT, `${s.name}-1-top.png`) });
    await page.evaluate(() => scrollBy(0, innerHeight));
    await page.waitForTimeout(400);
    await page.screenshot({ path: path.join(OUT, `${s.name}-2-fold.png`) });
    console.log(`${s.name}: 2 shots of ${PATH}`);
    await browser.close();
    continue;
  }

  await page.waitForSelector("#tier:not(:empty)", { timeout: 20000 });
  // Let the preview draw. It is the thing being judged.
  await page.waitForTimeout(2500);

  // The top of the page first: what somebody decides on before scrolling.
  await page.screenshot({ path: path.join(OUT, `${s.name}-1-top.png`) });

  // Then the moment /px/tool fires: #tool's top edge at the bottom of the
  // viewport is the beacon's own threshold, but nobody stops reading there, so
  // take it where a person would stop — the tool filling the screen.
  await page.evaluate(() => {
    const t = document.getElementById("tool");
    scrollTo(0, t.getBoundingClientRect().top + scrollY - 8);
  });
  await page.waitForTimeout(800);
  await page.screenshot({ path: path.join(OUT, `${s.name}-2-tool.png`) });

  // And the decision point: the Download button with the tier line under it.
  await page.evaluate(() => {
    const d = document.getElementById("download");
    scrollTo(0, d.getBoundingClientRect().top + scrollY - innerHeight * 0.45);
  });
  await page.waitForTimeout(500);
  await page.screenshot({ path: path.join(OUT, `${s.name}-3-press.png`) });

  console.log(`${s.name}: 3 shots`);
  await browser.close();
}
console.log(`\nwrote to ${OUT}`);
