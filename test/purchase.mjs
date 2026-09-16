// Proves the whole money path in Stripe TEST mode: click Buy, pay with the
// 4242 test card, come back, unlock with the purchase email, and download a
// full-size book with no watermark.
//
// Run: node test/purchase.mjs [baseUrl]
// Nothing here touches live mode; the Worker's PAY_URL must be a test link.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { mkdirSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { pdfText, WATERMARK } from "./pdftext.mjs";

const base = process.argv[2] || "https://puzzlepress.bananafest-destiny.com";
const email = `pp-test-${Date.now()}@bananafest-destiny.com`;
const out = new URL("../samples/browser/", import.meta.url);
mkdirSync(out, { recursive: true });

const browser = await chromium.launch({
  args: process.env.HOST_MAP ? [`--host-resolver-rules=MAP ${process.env.HOST_MAP}`] : [],
});
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();

await page.goto(base, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div");

const payUrl = await page.evaluate(() => window.PUZZLE_PRESS_PAY_URL || "");
if (!payUrl) throw new Error("No PAY_URL on the page — nothing to buy.");
if (!payUrl.includes("/test_")) throw new Error(`Refusing to run: PAY_URL is not a test link (${payUrl})`);
console.log("pay url:", payUrl);
console.log("buying as:", email);

// Buy — the link opens in a new tab.
await page.click("#unlockLink");
await page.waitForSelector("#unlockDialog[open]");
const [checkout] = await Promise.all([ctx.waitForEvent("page"), page.click("#buyLine a")]);
await checkout.waitForLoadState("networkidle");
console.log("checkout page:", (await checkout.title()).slice(0, 60));

// Card fields live behind the first payment-method accordion item and are
// only mounted once it is expanded.
const methods = await checkout.$$("input[name='payment-method-accordion-item-title']");
if (methods.length) await methods[0].click({ force: true });
await checkout.waitForSelector("#cardNumber", { timeout: 60000 });

await checkout.fill("#email", email);
await checkout.fill("#cardNumber", "4242424242424242");
await checkout.fill("#cardExpiry", "12/34");
await checkout.fill("#cardCvc", "123");
await checkout.fill("#billingName", "Puzzle Press Test");
// The address line offers Google suggestions in an overlay that covers the
// city and ZIP fields; dismiss it before filling the rest.
await checkout.fill("#billingAddressLine1", "500 Test Street");
await checkout.keyboard.press("Escape");
await checkout.waitForTimeout(500);
for (const [sel, val] of [["#billingLocality", "San Francisco"], ["#billingPostalCode", "94103"], ["#phoneNumber", "2015550123"]]) {
  const f = await checkout.$(sel);
  if (f) await f.fill(val);
}
// Don't opt into saving details with Link — it adds a one-time code step.
const savePass = await checkout.$("#enableStripePass");
if (savePass && (await savePass.isChecked())) await savePass.uncheck({ force: true });
const stateSel = await checkout.$("#billingAdministrativeArea");
if (stateSel) await stateSel.selectOption("CA").catch(() => {});

await checkout.waitForTimeout(1500);
const payBtn = checkout.locator(".SubmitButton").first();
await payBtn.waitFor({ state: "visible", timeout: 30000 });
await payBtn.click();
// Stripe shows "Processing…" then either redirects or renders a result.
await checkout
  .waitForFunction(() => !/Pay$/.test(document.querySelector(".SubmitButton")?.textContent?.trim() || ""), { timeout: 30000 })
  .catch(() => console.log("note: pay button text never changed"));
await checkout.waitForTimeout(12000);
await checkout.screenshot({ path: new URL("checkout-after-submit.png", out).pathname, fullPage: true });
const fieldErrors = await checkout.evaluate(() =>
  [...document.querySelectorAll("[role='alert'], .FieldError, .Error, [data-testid*='error']")]
    .map((e) => e.textContent.trim()).filter(Boolean).slice(0, 6));
if (fieldErrors.length) console.log("checkout errors:", fieldErrors.join(" | "));
// Either Stripe redirects back to us, or it lands on its own receipt page.
await checkout.waitForURL((u) => !u.host.includes("stripe.com") || /payment|success|receipt/.test(u.href), { timeout: 120000 }).catch(() => {});
await checkout.waitForTimeout(4000);
const landed = checkout.url();
console.log("after payment, landed on:", landed.slice(0, 90));
const redirectedBack = !landed.includes("stripe.com");
console.log("redirect-back configured on the payment link:", redirectedBack);

// Unlock on the real site with the email that paid. Stripe's redirect goes to
// the real production custom domain — that is what the payment link is
// actually configured with, and there is no way to make Stripe send it to
// 127.0.0.1 instead. Simply following it (the original design here) silently
// tested PRODUCTION's already-deployed code against a live-mode Stripe key
// that can never see a test-mode session — every run looked like a real
// failure and was actually testing the wrong server entirely. Confirmed live:
// the unlock dialog showed copy that does not exist anywhere in this
// session's edited source, only in a much older committed version, which
// only makes sense if it was never talking to this local worker at all.
// Once the redirect has proven its path+query are right, replay that same
// path+query against the LOCAL worker under test instead of trusting the
// live navigation.
const site = page;
await checkout.close().catch(() => {});
if (redirectedBack) {
  const u = new URL(landed);
  await page.bringToFront();
  await page.goto(`${base}${u.pathname}${u.search}`, { waitUntil: "networkidle" });
} else {
  await page.bringToFront();
  await page.reload({ waitUntil: "networkidle" });
}
await site.waitForSelector(".grid div", { timeout: 60000 });
if (!(await site.$("#unlockDialog[open]"))) {
  await site.click("#unlockLink");
  await site.waitForSelector("#unlockDialog[open]");
}
// 2026-09-16: a real test-mode payment took Stripe's own list endpoint over
// 230s to surface a session a direct lookup confirmed was already paid — so
// main.js now retries the "not recorded yet" case itself in the background
// (AUTO_RETRY_CEILING_MS, 5 minutes) instead of asking a human to click
// Unlock again. This test now matches that: one click, then wait out
// whatever the page's own retry loop takes, with margin over the ceiling.
site.on("console", (msg) => {
  if (msg.type() === "error") console.log("  [page console error]", msg.text().slice(0, 200));
});
site.on("pageerror", (e) => console.log("  [page exception]", String(e).slice(0, 200)));

await site.fill("#email", email);
const verifyStart = Date.now();
await site.click("#verify");
// Polling and logging instead of one blind wait: a prior run timed out the
// full 330s with the cause invisible, so this trades a single waitForFunction
// for visibility into how the message actually evolves.
let dialogClosed = false;
let err = "";
let lastSeen = "";
const deadline = Date.now() + 330000;
while (Date.now() < deadline) {
  dialogClosed = !(await site.$("#unlockDialog[open]"));
  if (dialogClosed) break;
  err = (await site.textContent("#unlockErr")) || "";
  if (err.trim() !== lastSeen) {
    lastSeen = err.trim();
    console.log(`  +${((Date.now() - verifyStart) / 1000).toFixed(1)}s: ${lastSeen.slice(0, 120)}`);
  }
  if (/support@/i.test(err)) break;
  await site.waitForTimeout(3000);
}
console.log(`  resolved at +${((Date.now() - verifyStart) / 1000).toFixed(1)}s: ${dialogClosed ? "unlocked" : err.trim().slice(0, 90)}`);
if (!dialogClosed && !/support@/i.test(err)) throw new Error("Timed out waiting for unlock or a support-email message: " + err);
if (err.trim()) throw new Error("Unlock refused after a real test payment: " + err);
const tier = await site.textContent("#tier");
console.log("tier now:", tier.trim());
if (!tier.includes("Unlocked")) throw new Error("Tier did not flip to Unlocked");

// A licensed download: more than the free cap, and no watermark line.
await site.fill("#count", "30");
const [dl] = await Promise.all([site.waitForEvent("download", { timeout: 180000 }), site.click("#download")]);
const path = new URL("purchased.pdf", out).pathname;
await dl.saveAs(path);
const pdf = await PDFDocument.load(await readFile(path));
console.log("purchased book:", dl.suggestedFilename(), "pages", pdf.getPageCount(), "|", await site.textContent("#status"));
if (pdf.getPageCount() < 30) throw new Error("licensed book is too short — cap still applied");

// A licensed book must not carry the watermark. This used to grep the file's
// bytes for "free preview" and therefore passed on every book ever made,
// watermarked or not — pdf-lib subsets the font, so the words are glyph ids in
// a compressed stream and that string is never in the file. Extract the text.
const text = await pdfText(path);
if (text.includes(WATERMARK)) throw new Error("watermark present in a paid book");
if (!/puzzle/i.test(text)) throw new Error("the extractor read nothing, so 'no watermark' means nothing");

// Survives a cold reload (licence persisted, not just in memory).
await site.reload({ waitUntil: "networkidle" });
await site.waitForSelector(".grid div");
if (!(await site.textContent("#tier")).includes("Unlocked")) throw new Error("licence did not survive reload");

await browser.close();
console.log("PURCHASE FLOW OK — paid, unlocked, downloaded unwatermarked, persisted");
