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

const base = process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev";
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

// Unlock on the real site with the email that paid.
const site = redirectedBack ? checkout : page;
if (!redirectedBack) {
  await page.bringToFront();
  await page.reload({ waitUntil: "networkidle" });
}
await site.waitForSelector(".grid div", { timeout: 60000 });
if (!(await site.$("#unlockDialog[open]"))) {
  await site.click("#unlockLink");
  await site.waitForSelector("#unlockDialog[open]");
}
await site.fill("#email", email);
await site.click("#verify");
await site.waitForFunction(
  () => !document.getElementById("unlockDialog").open || document.getElementById("unlockErr").textContent.length > 0,
  { timeout: 60000 },
);
const err = await site.textContent("#unlockErr");
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

// The watermark is drawn as text; a licensed book must not contain it.
const raw = (await readFile(path)).toString("latin1");
if (raw.includes("free preview")) throw new Error("watermark present in a paid book");

// Survives a cold reload (licence persisted, not just in memory).
await site.reload({ waitUntil: "networkidle" });
await site.waitForSelector(".grid div");
if (!(await site.textContent("#tier")).includes("Unlocked")) throw new Error("licence did not survive reload");

await browser.close();
console.log("PURCHASE FLOW OK — paid, unlocked, downloaded unwatermarked, persisted");
