// Walk the LIVE checkout in a real browser, right up to the Pay button, and
// stop. Nothing is charged. This exercises the path a real buyer takes:
// Buy link -> Stripe -> card form -> (redirect config read from the page).
//
// Loading the payment link CREATES a real Checkout Session, so every run of
// this test leaves an unpaid session in the live account — indistinguishable,
// on the launch dashboard, from a customer who reached the card form and
// walked away. So we tag ours: Stripe carries ?client_reference_id= from a
// payment-link URL onto the session it creates, and scripts/traffic.mjs
// counts anything starting "selftest-" separately from real people.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";
export const SELFTEST_PREFIX = "selftest-";
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

// 2. The link a real visitor gets is checked as it stands — href, and that it
// opens in a new tab without handing Stripe our page. Then we follow OUR copy
// of it, tagged, so the session it creates is known to be a test. The tag is
// invisible to the buyer's view of the page: product, price and card form are
// all asserted below on the tagged page.
const target = await p.getAttribute("#buyLine a", "target");
const rel = (await p.getAttribute("#buyLine a", "rel")) || "";
if (target !== "_blank") throw new Error(`Buy link should open a new tab, target=${target}`);
if (!rel.includes("noopener")) throw new Error(`Buy link needs rel=noopener, got "${rel}"`);
if (!(await p.isVisible("#buyLine a"))) throw new Error("Buy link is not visible in the dialog");

const tag = `${SELFTEST_PREFIX}${new Date().toISOString().replace(/[^\dT]/g, "").slice(0, 15)}`;
const tagged = `${href}${href.includes("?") ? "&" : "?"}client_reference_id=${tag}`;
console.log("following (tagged as a self-test):", tag);
const checkout = await ctx.newPage();
await checkout.goto(tagged, { waitUntil: "domcontentloaded" });
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

// 4. The tag only helps if Stripe actually kept it. Ask: the session this run
// just created must be findable by its reference, or the dashboard will go on
// counting my test runs as abandoned customers.
const creds = readFileSync(new URL("../../.git-credentials", import.meta.url), "utf8");
const key = (creds.match(/^STRIPE_KEY=(.*)$/m) || [])[1]?.trim();
if (!key) {
  console.log("no STRIPE_KEY on this machine — cannot confirm the self-test tag stuck");
} else {
  const cutoff = Math.floor(Date.now() / 1000) - 900;
  const r = await fetch(`https://api.stripe.com/v1/checkout/sessions?limit=100&created[gte]=${cutoff}`, {
    headers: { authorization: `Bearer ${key}` },
  });
  const mine = ((await r.json()).data || []).filter((s) => s.client_reference_id === tag);
  if (mine.length !== 1) throw new Error(`expected 1 session tagged ${tag}, found ${mine.length} — the dashboard cannot tell this run from a customer`);
  console.log(`tag confirmed on ${mine[0].id} — the dashboard will not count this as a customer`);
}

console.log("LIVE CHECKOUT OK (not paid)");
