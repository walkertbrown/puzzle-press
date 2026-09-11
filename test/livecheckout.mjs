// Walk the LIVE checkout in a real browser, right up to the Pay button, and
// stop. Nothing is charged. This exercises the path a real buyer takes:
// Buy link -> Stripe -> card form -> (redirect config read from the page).
import { chromium } from "playwright";
const base = process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev";
const b = await chromium.launch();
const ctx = await b.newContext({ viewport: { width: 1280, height: 1000 } });
const p = await ctx.newPage();
await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

// 1. From the pricing block, the way a visitor who scrolled would.
await p.click("#buyNow");
await p.waitForSelector("#unlockDialog[open]");
const href = await p.getAttribute("#buyLine a", "href");
console.log("Buy link:", href);
if (!href || href.includes("test_")) throw new Error("Buy link is missing or is a TEST link");

// 2. Follow it like a click would (new tab).
const [checkout] = await Promise.all([ctx.waitForEvent("page"), p.click("#buyLine a")]);
await checkout.waitForLoadState("domcontentloaded");
await checkout.waitForSelector("#email", { timeout: 60000 });
await checkout.waitForTimeout(1500);
const body = (await checkout.textContent("body")).replace(/\s+/g, " ");
const price = body.match(/\$\d+\.\d\d/)?.[0];
const product = body.match(/Puzzle Press[^$]{0,40}/)?.[0]?.trim();
console.log("checkout shows:", product, "|", price);
console.log("sandbox badge present:", /Sandbox|TEST MODE/i.test(body));
console.log("'per unlimited' still present:", /per unlimited/i.test(body));
if (price !== "$19.00") throw new Error(`expected $19.00, saw ${price}`);
if (/Sandbox|TEST MODE/i.test(body)) throw new Error("live link is showing a sandbox/test checkout");
if (/per unlimited/i.test(body)) throw new Error("unit label still reads 'per unlimited'");

// 3. The card form actually mounts (so a buyer can pay), then we stop.
const methods = await checkout.$$("input[name='payment-method-accordion-item-title']");
if (methods.length) await methods[0].click({ force: true });
await checkout.waitForSelector("#cardNumber", { timeout: 60000 });
console.log("card form mounted: yes — stopping here, nothing charged");
await checkout.screenshot({ path: new URL("../samples/browser/live-checkout-form.png", import.meta.url).pathname, fullPage: true });

await b.close();
console.log("LIVE CHECKOUT OK (not paid)");
