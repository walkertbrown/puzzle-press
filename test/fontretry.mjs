// One dropped font request must not break every later Download.
//
// The app fetches its two fonts once and keeps the promise. Until 2026-09-26
// it kept a failed one too, so a single network blip on the font fetch made
// every Download press after it fail with the same error until the visitor
// reloaded — which a visitor who has just typed a title and fifty clues does
// not think to do. This aborts the first font request, then presses Download
// at most twice: the second press has to produce a real PDF.
//
// Run: node test/fontretry.mjs [baseUrl]
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "https://puzzlepress.bananafest-destiny.com";
const browser = await chromium.launch();
const page = await browser.newPage({ acceptDownloads: true });
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
let aborted = 0;
await page.route("**/fonts/LiberationSans-*.ttf", (route) => {
  if (aborted++ === 0) return route.abort("connectionreset");
  return route.continue();
});

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div");

let pdf = null;
for (let press = 1; press <= 2 && !pdf; press++) {
  const dl = page.waitForEvent("download", { timeout: 60000 }).catch(() => null);
  await page.click("#download");
  // Either a file arrives, or the status line reports the failure.
  const first = await Promise.race([
    dl,
    page.waitForFunction(() => document.querySelector("#status")?.textContent.startsWith("Something went wrong"), null, { timeout: 60000 }).then(() => null),
  ]);
  console.log(`press ${press}: ${first ? "downloaded" : `failed — ${await page.textContent("#status")}`}`);
  if (first) pdf = await PDFDocument.load(readFileSync(await first.path()));
  else await page.evaluate(() => { document.querySelector("#status").textContent = ""; });
}
await browser.close();

if (!aborted) { console.log("FAIL the font request was never intercepted, so this proved nothing"); process.exit(1); }
if (!pdf) { console.log("FAIL two presses of Download after one dropped font request, and no book"); process.exit(1); }
console.log(`FONT RETRY OK — one font request dropped, the next press made a ${pdf.getPageCount()}-page PDF`);
