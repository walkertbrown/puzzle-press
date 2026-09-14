// The live payment link once sent buyers to a Stripe confirmation page and
// never back here, so a paid customer unlocked nothing. This checks both ends
// of that path: Stripe redirects to us, and we greet a payer correctly.
import { chromium } from "playwright";
import { readFileSync } from "node:fs";

const base = process.argv[2] || "https://puzzlepress.bananafest-destiny.com";
const creds = readFileSync(new URL("../../.git-credentials", import.meta.url), "utf8");
const STRIPE = (creds.match(/^STRIPE_KEY=(.*)$/m) || [])[1]?.trim();

// 1. The live payment link must send the buyer back to us.
const links = await (await fetch("https://api.stripe.com/v1/payment_links?limit=10", {
  headers: { authorization: `Bearer ${STRIPE}` },
})).json();
const live = (links.data || []).filter((l) => l.active && l.livemode);
if (!live.length) throw new Error("no active live payment link");
for (const l of live) {
  const ac = l.after_completion || {};
  console.log(`link ${l.id}: ${ac.type} -> ${ac.redirect?.url ?? "(nowhere)"}`);
  if (ac.type !== "redirect") throw new Error(`${l.id} does not redirect the buyer back — they will pay and unlock nothing`);
  if (!/[?&]paid=1/.test(ac.redirect.url)) throw new Error(`${l.id} redirects to ${ac.redirect.url}, which will not open the unlock dialog`);
}

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1200, height: 900 } });
const errs = [];
p.on("pageerror", (e) => errs.push(String(e)));

// 2. Arriving back from checkout.
await p.goto(`${base}/?paid=1`, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");
if (!(await p.isVisible("#unlockDialog"))) throw new Error("a returning buyer is not shown how to unlock");
const title = await p.textContent("#dialogTitle");
const buy = (await p.textContent("#buyLine")).trim();
console.log("returning buyer sees:", title, "| buy line:", JSON.stringify(buy));
if (/Buy now/i.test(buy)) throw new Error("do not offer to sell again to somebody who has just paid");
if (!/Thanks/i.test(title)) throw new Error("a returning buyer should be thanked, not re-pitched");

// 3. Stripe lag must not read as a failed payment — the first time.
await p.fill("#email", "nobody-paid-this@example.com");
await p.click("#verify");
await p.waitForFunction(() => document.getElementById("unlockErr").textContent.length > 0, { timeout: 30000 });
const err = await p.textContent("#unlockErr");
console.log("lag message:", err.trim());
if (/No completed payment/i.test(err)) throw new Error("a paying customer must not be told their payment does not exist");

// 4. But "wait a few seconds and try again" is only true once. The other way
// to land here is a buyer typing a different address from the one on their
// receipt, and for them the reassurance is a loop with no exit: it is true
// forever, never mentions the address, and never mentions support. Pressing
// Unlock a second time has to say something a stuck buyer can act on.
await p.fill("#email", "nobody-paid-this-either@example.com");
await p.click("#verify");
await p.waitForFunction(
  (first) => {
    const t = document.getElementById("unlockErr").textContent.trim();
    return t.length > 0 && t !== first;
  },
  err.trim(),
  // An address with no payment behind it costs a full scan of the account's
  // checkout sessions, which is slower than the exact-match hit a real buyer
  // gets. 30 s was not enough for two of them in a row.
  { timeout: 90000 },
);
const second = await p.textContent("#unlockErr");
console.log("second try :", second.trim());
if (!/support@bananafest-destiny\.com/.test(second)) {
  throw new Error(`a buyer who cannot unlock gets no way out on the second try: ${second.trim()}`);
}

// 5. A normal visitor still gets the sales pitch.
await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");
await p.click("#unlockLink");
await p.waitForSelector("#unlockDialog[open]");
const normalBuy = (await p.textContent("#buyLine")).trim();
console.log("normal visitor buy line:", normalBuy.slice(0, 60));
if (!/Buy now/i.test(normalBuy)) throw new Error("a normal visitor should still see the Buy link");
await p.click("#closeDialog");

// 6. And somebody who paid a month ago, on a laptop that has never seen this
// site, can find the way in. The licence has always been just the email, but
// the only thing the page offered them read "Remove both — $19 one-time",
// which is what being asked to pay twice looks like.
if (!(await p.isVisible("#alreadyPaid"))) {
  throw new Error("a returning buyer on a new device is only offered the price, not a way to unlock");
}
await p.click("#alreadyPaid");
await p.waitForSelector("#unlockDialog[open]");
if (!(await p.isVisible("#email"))) throw new Error("'Already paid? Unlock' does not lead to the email field");
await p.click("#closeDialog");

console.log("page errors:", errs.length ? errs : "none");
await b.close();
console.log("PAID RETURN OK");
