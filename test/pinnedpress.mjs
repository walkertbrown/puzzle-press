// Pressing the button people actually press.
//
// `test/coldjourney.mjs` proves a PDF lands, and it has run green for days. It
// finds the button with `getByRole("button", {name:/download/}).first()`, which
// in document order is `#download` — the in-flow one at the bottom of the form,
// measured 2026-09-23 at 2.98 screens below the fold on desktop and 6.42 on a
// phone. Almost nobody presses that one.
//
// The button a real visitor reaches is pinned: `#previewDownload` rides the
// sticky preview header on desktop and is on screen the instant the tool is;
// `#thumbDownload` rides the fixed thumb bar on a phone and arrives 0.6 screens
// later. Both are shims — they call `real.click()` on the in-flow button — and
// neither had ever been pressed by a test.
//
// That shim is not free of risk. `download()` is async and awaits several times
// (fonts, the pdf-lib chunk, page layout) before it reaches
// `a.click()` on the blob URL, so by then the user-gesture context that began
// with the tap is long gone. Safari is the strict one about programmatic
// downloads. It works from the in-flow button; this asserts it also works
// through the shim, which is one more hop from the gesture.
//
// Usage: node test/pinnedpress.mjs [engine] [device]
import * as playwright from "playwright";
import { devices } from "playwright";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const BASE = process.env.BASE || "https://puzzlepress.bananafest-destiny.com";
const engine = process.argv[2] || "chromium";
const deviceName = process.argv[3];
const WHICH = deviceName ? "thumbDownload" : "previewDownload";

const browser = await playwright[engine].launch();
const ctx = await browser.newContext({
  ...(deviceName ? devices[deviceName] : { viewport: { width: 1280, height: 900 } }),
  acceptDownloads: true,
});
const page = await ctx.newPage();
await page.route("https://static.cloudflareinsights.com/**", (route) => route.abort());

const px = [];
page.on("request", (r) => {
  const m = r.url().match(/\/px\/([a-z]+)\.gif/);
  if (m) px.push(m[1]);
});

const label = `${engine} / ${deviceName || "desktop 1280x900"}  →  #${WHICH}`;
console.log(`\n${"=".repeat(70)}\nPRESSING THE PINNED BUTTON — ${label}\n${"=".repeat(70)}\n`);

await page.goto(BASE, { waitUntil: "domcontentloaded" });
await page.waitForSelector("#tier:not(:empty)", { timeout: 20000 });

// Get to where a person would be when the pinned button is available: the tool
// on screen. Scroll the way a person does, not with an anchor jump.
await page.evaluate(() => {
  const t = document.getElementById("tool");
  scrollTo(0, t.getBoundingClientRect().top + scrollY - innerHeight * 0.3);
});
await page.waitForTimeout(500);

const btn = page.locator(`#${WHICH}`);
await btn.waitFor({ state: "visible", timeout: 10000 });
const box = await btn.boundingBox();
const vh = page.viewportSize().height;
console.log(`  the button is on screen at y=${Math.round(box.y)} of ${vh}, ${Math.round(box.width)}x${Math.round(box.height)}`);

const fails = [];
const check = (ok, what) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) fails.push(what);
};

const t0 = Date.now();
const waitDl = page.waitForEvent("download", { timeout: 180000 });
// A real tap, at the button's real position, through the real input pipeline.
await btn.click();
let file = null, kb = 0;
try {
  const dl = await waitDl;
  const tmp = mkdtempSync(join(tmpdir(), "pinned-"));
  file = join(tmp, dl.suggestedFilename());
  await dl.saveAs(file);
  const { statSync } = await import("node:fs");
  kb = Math.round(statSync(file).size / 1024);
} catch {}
const secs = ((Date.now() - t0) / 1000).toFixed(1);

const status = await page.locator("#status").textContent();
console.log(`\n  after ${secs}s   status: ${status.trim() || "(empty)"}`);
console.log(`  beacons: ${px.join(" ") || "(none)"}\n`);

check(!!file, `a PDF actually arrived through the pinned button${file ? ` (${kb} KB in ${secs}s)` : " — nothing was delivered"}`);
check(kb > 50, `the file is a real book, not a stub (${kb} KB)`);
// The shim fires the handler, so the funnel must see it. If this ever broke,
// `/px/click` would read zero while people were pressing — which is exactly the
// number the 2026-09-22 dashboard reported, and the reason this is asserted.
check(px.includes("click"), `pressing the pinned button fires /px/click (got: ${px.join(" ") || "none"})`);
check(px.includes("made"), `and /px/made once the file is out (got: ${px.join(" ") || "none"})`);

await browser.close();
if (fails.length) {
  console.log(`\nPINNED PRESS FAILED — ${label}: ${fails.length} problem(s)`);
  process.exit(1);
}
console.log(`\nPINNED PRESS OK — ${label}: the button people actually reach delivers a book`);
