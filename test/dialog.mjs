// What the unlock dialog says, per entry point.
//
// Written 2026-09-15 alongside the change it guards. Three different people open
// this dialog — somebody who wants to buy, somebody who already paid, and
// somebody who just paid — and until this morning all three got the same screen:
// the heading "Unlock full books", the purchase as a text link, and the cursor
// in an email box. That is a login form, and the live Stripe account agreed:
// zero real checkout sessions in its entire history, while people were making
// whole books. Nobody bailed at the card form. Nobody reached the card form.
//
// The regression this exists to catch is the quiet one — the Buy link losing its
// button styling, or the focus drifting back to the email box, either of which
// restores the old screen without breaking a single other test.
//
// It serves a LOCAL copy of public/ and NEVER clicks the Buy link: loading that
// URL creates a real Checkout Session in the live account. It only reads the
// anchor's attributes. See test/livecheckout.mjs for the one test that is
// allowed to open it, and why it tags what it creates.
//
// Usage: node test/dialog.mjs [payUrl]
//   With no argument it uses a harmless stand-in, because every assertion here
//   is about markup and focus, not about the URL.
import { chromium } from "playwright";
import http from "node:http";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const PUBLIC = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public");
const PAY = process.argv[2] || "https://buy.stripe.com/example-not-loaded";

// A copy, so the served config.js never touches the checked-in one.
const ROOT = fs.mkdtempSync(path.join(os.tmpdir(), "dialogcheck-"));
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

const browser = await chromium.launch();
const p = await browser.newPage();
await p.goto(base + "/", { waitUntil: "networkidle" });

const read = async (label) => {
  await p.waitForSelector("#unlockDialog[open]", { timeout: 10000 });
  const s = await p.evaluate(() => {
    const a = document.querySelector("#buyLine a");
    const f = document.activeElement;
    const lead = document.getElementById("paidLead");
    const email = document.getElementById("email");
    return {
      title: document.getElementById("dialogTitle").textContent,
      lede: document.getElementById("dialogLede").textContent,
      buy: a ? a.textContent.trim() : null,
      buyClass: a ? a.className : null,
      target: a ? a.getAttribute("target") : null,
      rel: a ? a.getAttribute("rel") : null,
      paidLead: lead.hidden ? "(hidden)" : lead.textContent,
      emailVisible: email.getClientRects().length > 0,
      focus: f ? (f.id || f.className || f.tagName) : "(none)",
    };
  });
  console.log(`\n### ${label}`);
  console.log(`  title        ${s.title}`);
  console.log(`  lede         ${s.lede}`);
  console.log(`  buy          ${s.buy}   [class=${s.buyClass || "-"} target=${s.target} rel=${s.rel}]`);
  console.log(`  already-paid ${s.paidLead}`);
  console.log(`  email box    ${s.emailVisible ? "visible" : "NOT VISIBLE  <-- regression"}`);
  console.log(`  FOCUS        ${s.focus}`);
  await p.click("#closeDialog");
  return s;
};

await p.click("#unlockLink");
const buy = await read('tier line: "Remove both — $19 one-time"');
await p.click("#alreadyPaid");
const paid = await read('tier line: "Already paid? Unlock"');
await p.click("#buyNow");
const pricing = await read("pricing block: Buy button");

const fail = [];
if (buy.buyClass !== "buybtn") fail.push("buy intent did not render the button-styled Buy link");
if (buy.focus !== "buybtn") fail.push(`buy intent focused "${buy.focus}" — it must be the Buy link, not a text field`);
if (/unlock full books/i.test(buy.title)) fail.push("buy intent still says 'Unlock full books' — that reads as a login");
if (paid.focus !== "email") fail.push(`already-paid intent focused "${paid.focus}", not the email box`);
if (paid.paidLead !== "(hidden)") fail.push("already-paid intent should not show the 'Already paid?' lead-in");
if (pricing.buyClass !== "buybtn") fail.push("the pricing block's Buy button did not open in buy intent");
for (const [name, s] of [["buy", buy], ["already-paid", paid], ["pricing", pricing]]) {
  // purchase.mjs, privacy.mjs and nostorage.mjs all type into #email from
  // whichever entry point they used. Hiding it anywhere breaks them.
  if (!s.emailVisible) fail.push(`${name}: email box is hidden`);
  if (s.target !== "_blank" || !/noopener/.test(s.rel ?? "")) fail.push(`${name}: Buy link lost target=_blank or rel=noopener`);
}

console.log(fail.length ? `\nFAIL:\n  ${fail.map((f) => "- " + f).join("\n  ")}\n` : "\nAll dialog assertions passed.\n");
await browser.close();
server.close();
fs.rmSync(ROOT, { recursive: true, force: true });
process.exit(fail.length ? 1 : 0);
