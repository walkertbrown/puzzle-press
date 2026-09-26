// The three rungs with money on them.
//
// Added 2026-09-23, the same night the beacons were. Until then the funnel
// stopped at "the free file came out": every stage this site could draw
// described somebody getting closer to a *free* book, and nothing at all
// described somebody trying to pay. Stripe only reports sessions that complete,
// so an opened-and-abandoned checkout is invisible from this side — which made
// "nobody bought" and "nobody ever opened the price" print as the same silence.
// They are not the same problem and they do not have the same fix.
//
//   /px/pay       pressed the price link and read the dialog
//   /px/checkout  clicked through to Stripe (keepalive — this is a navigation)
//   /px/unlock    a returning buyer opening "Already paid?" — a support signal
//   /px/coverpay  the same dialog, opened BY the page after a free cover
//                 (2026-09-26: until then it fired /px/pay, so a visitor who
//                 took a free cover read as one who asked the price)
//
// Instrumentation that nothing tests rots silently, and this kind rots in the
// worst direction: the number keeps printing, it just goes quietly to zero and
// reads as "nobody is interested". Two live traps it must survive:
//
//   * A programmatic click must not count. `isTrusted` guards the checkout
//     beacon for the same reason it guards `touched` — a handoff that assigns
//     `.value` and dispatches an event would otherwise report engagement.
//   * A beacon must fire at most once per page load, or the "people" counts in
//     traffic.mjs start drifting and nobody notices.
//
// Serves a LOCAL copy of public/ with a stand-in PAY_URL, and aborts every
// off-origin request, so the Buy link can be pressed for real without ever
// touching the live Payment Link. See test/livecheckout.mjs for the one test
// that is allowed to open that, and why it tags what it creates.
//
// Usage: node test/buyrung.mjs [engine]
import * as playwright from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const engine = process.argv[2] || "chromium";
const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
// Deliberately not a stripe.com URL of any shape: the safety here should not
// depend on the route-abort below also being correct.
const PAY = "https://pay.invalid.example/stand-in";

const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "buyrung-"));
fs.cpSync(PUBLIC, ROOT, { recursive: true });
fs.writeFileSync(path.join(ROOT, "config.js"), `window.PUZZLE_PRESS_PAY_URL = ${JSON.stringify(PAY)};\n`);

const TYPES = { ".html": "text/html", ".js": "text/javascript", ".css": "text/css", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".svg": "image/svg+xml", ".pdf": "application/pdf", ".woff2": "font/woff2", ".json": "application/json", ".xml": "application/xml", ".txt": "text/plain" };
const server = http.createServer((req, res) => {
  let p = decodeURIComponent(req.url.split("?")[0]);
  if (p.endsWith("/")) p += "index.html";
  const f = path.join(ROOT, p);
  if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end("no"); }
  res.writeHead(200, { "content-type": TYPES[path.extname(f)] ?? "application/octet-stream" });
  fs.createReadStream(f).pipe(res);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const base = `http://127.0.0.1:${server.address().port}`;

const browser = await playwright[engine].launch();
const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
// Belt and braces. Nothing in this test should ever leave the machine.
await ctx.route((url) => !url.href.startsWith(base), (route) => route.abort());

let px = [];
ctx.on("request", (r) => {
  const m = r.url().match(/\/px\/([a-z]+)\.gif/);
  if (m) px.push(m[1]);
});

const page = await ctx.newPage();
await page.goto(base + "/", { waitUntil: "networkidle" });
await page.waitForSelector("#tier:not(:empty)");

const fails = [];
const check = (ok, what) => {
  console.log(`  ${ok ? "ok  " : "FAIL"}  ${what}`);
  if (!ok) fails.push(what);
};
const since = () => { const was = px; px = []; return was; };
const money = (seen) => seen.filter((n) => ["pay", "coverpay", "checkout", "unlock"].includes(n));

console.log(`\n${"=".repeat(70)}\nTHE RUNGS WITH MONEY ON THEM — ${engine}\n${"=".repeat(70)}\n`);

// 1. A cold page must be silent on the money side. If any of these three ever
//    fires on load, every number built on them is an overcount from that deploy
//    onward, and it would look like the product suddenly started selling.
const onLoad = money(since());
check(onLoad.length === 0, `a cold page fires no money beacon (got: ${onLoad.join(" ") || "none"})`);

// 2. The price link.
await page.click("#unlockLink");
await page.waitForSelector("#unlockDialog[open]");
await page.waitForTimeout(300);
const opened = since();
check(opened.filter((n) => n === "pay").length === 1, `opening the price fires /px/pay exactly once (got: ${opened.join(" ") || "none"})`);
check(!opened.includes("unlock"), `and does not also fire /px/unlock — a buyer is not a returning customer`);

// 3. The last act before Stripe. The link is target=_blank, so the beacon rides
//    fetch(keepalive) rather than an Image() that the navigation would cancel.
const buy = page.locator("#buyLine a");
check(await buy.count() === 1, `the dialog has exactly one buy link`);
const href = await buy.getAttribute("href");
check(href === PAY, `it points at the configured pay URL, not a hard-coded one`);
await buy.click();
await page.waitForTimeout(500);
const clicked = since();
check(clicked.includes("checkout"), `pressing Buy fires /px/checkout (got: ${clicked.join(" ") || "none"})`);
check(clicked.filter((n) => n === "checkout").length === 1, `once, not twice`);

// 4. The returning buyer. A different act, a different rung: this one is a
//    support signal, not a sales one, and filing it under "opened the price"
//    would have me chasing a lead who is actually a customer locked out.
for (const p2 of ctx.pages().slice(1)) await p2.close().catch(() => {});
await page.click("#closeDialog").catch(() => {});
await page.waitForTimeout(200);
since();
await page.click("#alreadyPaid");
await page.waitForSelector("#unlockDialog[open]");
await page.waitForTimeout(300);
const back = money(since());
check(back.includes("unlock"), `"Already paid?" fires /px/unlock (got: ${back.join(" ") || "none"})`);
check(!back.includes("pay"), `and not /px/pay — the two are different problems`);

// 5. isTrusted. Same guard, same reason, as the `touched` rung: a synthetic
//    click from a handoff or a shim must not report buy intent. This is the one
//    assertion here that a working product could fail by accident, because the
//    obvious implementation — a bare addEventListener — passes every check
//    above and this one is what makes the number mean anything.
await page.click("#closeDialog").catch(() => {});
await page.waitForTimeout(200);
await page.click("#unlockLink");
await page.waitForSelector("#unlockDialog[open]");
await page.waitForTimeout(300);
since();
await page.evaluate(() => document.querySelector("#buyLine a").dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true })));
await page.waitForTimeout(400);
const fake = money(since());
check(!fake.includes("checkout"), `a scripted click on Buy fires nothing (got: ${fake.join(" ") || "none"})`);

// 6. Shown the price is not asking for it. A free cover opens the dialog by
//    itself when it is done; that has to report as /px/coverpay, never /px/pay.
await page.click("#closeDialog").catch(() => {});
await page.waitForTimeout(200);
since();
await page.click("#downloadCover");
await page.waitForSelector("#unlockDialog[open]", { timeout: 60000 });
await page.waitForTimeout(300);
const afterCover = money(since());
check(afterCover.filter((n) => n === "coverpay").length === 1, `a free cover's dialog fires /px/coverpay once (got: ${afterCover.join(" ") || "none"})`);
check(!afterCover.includes("pay"), `and not /px/pay — nobody asked`);

for (const p2 of ctx.pages().slice(1)) await p2.close().catch(() => {});
await browser.close();
server.close();
fs.rmSync(ROOT, { recursive: true, force: true });

if (fails.length) {
  console.log(`\nBUY RUNG FAILED — ${engine}: ${fails.length} problem(s)`);
  process.exit(1);
}
console.log(`\nBUY RUNG OK — ${engine}: the four acts on the money side each report themselves, once, and only when a person did them`);
