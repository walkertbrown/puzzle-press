// The cold visitor's journey. Click "Make a book free" — the one thing the
// page invites you to do — and then do nothing clever: accept every default,
// press the most obvious button, and see whether a PDF lands.
//
// The rule is that this script may not use any knowledge I have from building
// the app. It finds controls by their visible text, the way a stranger does.
// If a rename ever makes the download button unfindable by an obvious word,
// this test goes red — which is the correct answer, because a stranger would
// also be stuck.
//
// Usage: node test/coldjourney.mjs [engine] [device]
import * as playwright from "playwright";
import { devices } from "playwright";
import { mkdtempSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const engine = process.argv[2] || "chromium";
const deviceName = process.argv[3];
const tmp = mkdtempSync(join(tmpdir(), "pp-cold-"));

const browser = await playwright[engine].launch();
const ctx = await browser.newContext({
  ...(deviceName ? devices[deviceName] : { viewport: { width: 1280, height: 800 } }),
  acceptDownloads: true,
});
const page = await ctx.newPage();
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));

const t0 = Date.now();
const at = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
const step = (s) => console.log(`  ${at().padStart(6)}  ${s}`);
const label = `${engine}${deviceName ? " / " + deviceName : " / desktop"}`;

console.log(`\n=== cold journey: ${label} ===`);
await page.goto(`${BASE}/?ref=producthunt`, { waitUntil: "domcontentloaded" });
step("landed");

// The invitation.
const cta = page.getByRole("button", { name: /make a book free/i }).or(page.getByRole("link", { name: /make a book free/i })).first();
await cta.click();
step(`clicked "Make a book free"`);
await page.waitForTimeout(1200);

// What does a stranger now see? Report the nearest actionable things.
const visible = await page.evaluate(() => {
  const vh = innerHeight;
  return [...document.querySelectorAll("button, select, a[href], input")]
    .map((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (st.display === "none" || st.visibility === "hidden" || r.width === 0) return null;
      if (r.bottom < 0 || r.top > vh) return null;
      const t = (el.innerText || el.value || el.getAttribute("aria-label") || "").trim().replace(/\s+/g, " ");
      return t ? `${t.slice(0, 50)}` : null;
    })
    .filter(Boolean);
});
step(`now on screen: ${visible.slice(0, 12).join(" | ")}`);

// The most obvious next move for somebody who wants the book: a download.
const dl = page.getByRole("button", { name: /download|get the book|make the book/i }).first();
if (!(await dl.count())) {
  step("NO obvious download button found — a stranger is now stuck");
  await browser.close();
  process.exit(1);
}
const name = (await dl.innerText()).trim().replace(/\s+/g, " ");
step(`found the next obvious button: "${name}"`);

const waitDl = page.waitForEvent("download", { timeout: 180000 });
await dl.click();
step("pressed it, accepting every default");
const download = await waitDl;
const file = join(tmp, download.suggestedFilename());
await download.saveAs(file);
const kb = Math.round(statSync(file).size / 1024);
step(`PDF landed: ${download.suggestedFilename()} (${kb} KB)`);

await browser.close();

// A PDF that lands but is 4 KB is not a book. The real suites check the
// contents; here we only insist it is plausibly a whole one.
const fails = [];
if (kb < 100) fails.push(`the PDF is only ${kb} KB — too small to be a book`);
if (errs.length) fails.push(`page errors: ${errs.join("; ")}`);
if (fails.length) {
  console.log(`\nCOLD JOURNEY FAILED — ${label}: ${fails.join(" / ")}`);
  process.exit(1);
}
console.log(`\nCOLD JOURNEY OK — ${label}: landing to a finished book in ${at()}, accepting every default, no page errors`);
