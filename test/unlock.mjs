// The branches of /api/verify that hand out a licence, run against a fake
// Stripe.
//
// test/purchase.mjs proves the same path end to end by actually paying, and it
// did — once, on 2026-09-10, in Stripe TEST mode. The account is in live mode
// now, so running it again means somebody spending $19, and the verify function
// has been rewritten twice since: it gained a case-insensitive fallback, paged
// scanning, and a give-up message for an account too big to scan. None of that
// code has ever executed. The only way to reach it was to be a real buyer whose
// receipt address differs in case from what they typed, or to be sale number
// two thousand.
//
// So: point the Worker at a stub with `STRIPE_API` and ask it the questions a
// real buyer's browser would ask. The Worker is the real one — `wrangler dev`
// runs src/worker.js unmodified — and the browser journey at the end is a real
// browser downloading a real PDF and checking the watermark is gone.
//
// Run: node test/unlock.mjs
import { chromium } from "playwright";
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { mkdir } from "node:fs/promises";
import { pdfText, WATERMARK, COVER_MARK } from "./pdftext.mjs";

const PORT_STRIPE = 8931;
const PORT_WORKER = 8932;
const BASE = `http://127.0.0.1:${PORT_WORKER}`;
const out = new URL("../samples/browser/", import.meta.url);
await mkdir(out, { recursive: true });

let failed = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

// ---------------------------------------------------------------- the stub
// Shaped on the live Checkout Session object read from the account on
// 2026-09-13 — the keys this code actually looks at, plus enough of the rest
// that a wrong assumption about the shape would show up here instead of on a
// customer. Stripe's list filter is exact and case-sensitive; that is the
// whole reason the fallback scan exists, so the stub has to be exact too or
// the test would prove nothing.
let SESSIONS = [];
let calls = [];

const session = (i, email, paid = true) => ({
  id: `cs_live_${String(i).padStart(6, "0")}b7QeCkFAKE`,
  object: "checkout_session",
  amount_subtotal: 1900,
  amount_total: 1900,
  created: 1757800000 - i * 60,
  currency: "usd",
  customer_details: email === null ? null : { email, name: "A Buyer", address: null, tax_exempt: "none" },
  livemode: true,
  mode: "payment",
  payment_status: paid ? "paid" : "unpaid",
  status: "complete",
  url: null,
});

const stripe = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  calls.push(url.pathname + url.search);
  if (url.pathname !== "/v1/checkout/sessions") {
    res.writeHead(404, { "content-type": "application/json" });
    return res.end('{"error":{"message":"no such endpoint"}}');
  }
  const q = url.searchParams;
  let rows = SESSIONS.filter((s) => !q.get("status") || s.status === q.get("status"));
  const wanted = q.get("customer_details[email]");
  if (wanted !== null) rows = rows.filter((s) => (s.customer_details || {}).email === wanted);
  const after = q.get("starting_after");
  if (after) {
    const at = rows.findIndex((s) => s.id === after);
    rows = at === -1 ? [] : rows.slice(at + 1);
  }
  const limit = Number(q.get("limit") || 10);
  const page = rows.slice(0, limit);
  res.writeHead(200, { "content-type": "application/json" });
  res.end(JSON.stringify({ object: "list", data: page, has_more: rows.length > limit }));
});
await new Promise((r) => stripe.listen(PORT_STRIPE, "127.0.0.1", r));

// ------------------------------------------------------------- the Worker
// The real one. STRIPE_KEY is a stub string: the stub never looks at the
// Authorization header, and a test that needed the live key to run would be a
// test nobody could run.
const worker = spawn(
  "npx",
  ["wrangler", "dev", "--port", String(PORT_WORKER), "--ip", "127.0.0.1",
   "--var", "STRIPE_KEY:sk_stub_not_a_real_key",
   "--var", `STRIPE_API:http://127.0.0.1:${PORT_STRIPE}`,
   "--var", "PAY_URL:https://example.invalid/pay",
   "--log-level", "warn"],
  { cwd: new URL("..", import.meta.url).pathname, stdio: ["ignore", "pipe", "pipe"] },
);
const workerLog = [];
for (const s of [worker.stdout, worker.stderr]) s.on("data", (d) => workerLog.push(String(d)));

const stop = () => { try { worker.kill("SIGTERM"); } catch {} stripe.close(); };
process.on("exit", stop);

const ready = async () => {
  for (let i = 0; i < 120; i++) {
    try {
      const r = await fetch(`${BASE}/config.js`);
      if (r.ok) return true;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  return false;
};
if (!(await ready())) {
  console.log(workerLog.join("").slice(-2000));
  stop();
  throw new Error("wrangler dev never came up");
}
console.log(`worker up on ${BASE}, fake stripe on 127.0.0.1:${PORT_STRIPE}\n`);

const verify = async (email) => {
  calls = [];
  const res = await fetch(`${BASE}/api/verify`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  return { status: res.status, body: await res.json(), calls: calls.length };
};

// 1. The ordinary buyer: typed exactly what they typed at checkout. One call
//    to Stripe, a licence back, and the token names the session that paid.
console.log("1. exact match");
SESSIONS = [session(1, "buyer@example.com")];
let r = await verify("buyer@example.com");
check(r.status === 200 && r.body.ok === true, `unlocks (${r.status} ${JSON.stringify(r.body).slice(0, 90)})`);
check(r.body.token === `stripe:${SESSIONS[0].id}`, `token names the paying session (${r.body.token})`);
check(r.body.email === "buyer@example.com", "returns the email lowercased");
check(r.calls === 1, `costs one Stripe call, not a scan (${r.calls})`);

// 2. The case the fallback exists for, and which has never run in production:
//    Stripe has John@Gmail.com, the buyer types john@gmail.com. The exact
//    filter misses it twice — as typed and lowercased — and the scan finds it.
console.log("\n2. the receipt says John@Gmail.com, they type john@gmail.com");
SESSIONS = [session(2, "John@Gmail.com")];
r = await verify("john@gmail.com");
check(r.body.ok === true, `unlocks anyway (${JSON.stringify(r.body).slice(0, 90)})`);
// Typed and lowercased are the same string here, so the exact filter is asked
// once, not twice — the Set around them is doing its job.
check(r.calls === 2, `one exact miss then one scan page (${r.calls} calls)`);

// 2b. And the other direction: capitals typed, lowercase at checkout.
SESSIONS = [session(3, "jane@example.com")];
r = await verify("  Jane@Example.com  ");
check(r.body.ok === true, "unlocks when the capitals are the other way round, and trims whitespace");

// 3. A session that completed without being paid must not unlock anything.
//    `status: complete` is not `payment_status: paid` — an expired or failed
//    checkout can be the first and the buyer's own address is on it.
console.log("\n3. completed but never paid");
SESSIONS = [session(4, "deadbeat@example.com", false)];
r = await verify("deadbeat@example.com");
check(r.status === 404 && r.body.ok === false, `refused (${r.status})`);
check(/No completed payment/.test(r.body.error || ""), "and told to check the receipt address");

// 4. Paging. One page of a hundred was the old ceiling: sale 101 would have
//    been told they never paid. The buyer here is on the third page — and
//    their address has to differ in case from what they type, because the
//    exact filter would otherwise find them in one call and the scan, which is
//    the thing being tested, would never run. The first version of this test
//    made that mistake and passed while proving nothing.
console.log("\n4. the buyer is 250 sales back, and typed their address in lower case");
SESSIONS = [...Array.from({ length: 250 }, (_, i) => session(100 + i, `other${i}@example.com`)),
            session(999, "Patient@Example.com")];
r = await verify("patient@example.com");
check(r.body.ok === true, "still unlocks");
check(r.calls === 1 + 3, `paged through to find them (${r.calls} calls: 1 exact + 3 pages)`);

// 5. And the cap. Past 2,000 completed sessions the scan gives up, and what it
//    says then has to be different from "no payment found" — the buyer's
//    payment is real and only a person can help them.
console.log("\n5. an account too big to scan");
SESSIONS = Array.from({ length: 2100 }, (_, i) => session(10000 + i, `other${i}@example.com`));
r = await verify("lost@example.com");
check(r.status === 404, "refused, which is all it can do");
check(/support@bananafest-destiny\.com/.test(r.body.error || ""), "but names a human being");
check(!/No completed payment/.test(r.body.error || ""), "and does not tell a payer their payment does not exist");
check(r.calls === 1 + 20, `stopped at the cap instead of scanning forever (${r.calls} calls)`);

// 6. Stripe being down is not the same as not having paid.
console.log("\n6. Stripe unreachable");
const savedPort = stripe.address().port;
await new Promise((r) => stripe.close(r));
r = await verify("buyer@example.com");
check(r.status === 502, `502, not 404 (${r.status})`);
check(/try again/i.test(r.body.error || ""), `and says to try again (${JSON.stringify(r.body.error)})`);
await new Promise((r) => stripe.listen(savedPort, "127.0.0.1", r));

// 7. The whole thing, in a browser, for one buyer: land, unlock, download, and
//    the watermark is gone. This is the part a customer actually does.
console.log("\n7. a real browser, all the way through");
SESSIONS = [session(7, "Real.Buyer@Example.com")];
const browser = await chromium.launch();
const ctx = await browser.newContext({ acceptDownloads: true, viewport: { width: 1280, height: 1000 } });
const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e)));
await page.goto(BASE, { waitUntil: "networkidle" });
await page.waitForSelector(".grid div");

// The free book first, so "no watermark" below means something.
await page.fill("#count", "2");
let [dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
let path = new URL("unlock-free.pdf", out).pathname;
await dl.saveAs(path);
// Read with an extractor, not by grepping the bytes: the font is subset, so
// the words are glyph ids in a compressed stream and `bytes.includes(...)`
// finds nothing whether the mark is there or not. See test/pdftext.mjs.
check((await pdfText(path)).includes(WATERMARK), "the free book is watermarked");

await page.click("#unlockLink");
await page.waitForSelector("#unlockDialog[open]");
await page.fill("#email", "real.buyer@example.com");
await page.click("#verify");
await page.waitForFunction(
  () => !document.getElementById("unlockDialog").open || document.getElementById("unlockErr").textContent.length > 0,
  { timeout: 60000 },
);
const err = (await page.textContent("#unlockErr")).trim();
check(!err, `the dialog closes without an error (${err || "none"})`);
const tier = (await page.textContent("#tier")).trim();
check(/Unlocked/.test(tier), `the tier line says so: ${tier.slice(0, 70)}`);
const stored = await page.evaluate(() => localStorage.getItem("puzzlepress.license"));
check(/"token":"stripe:cs_live_/.test(stored || ""), `the licence is stored (${String(stored).slice(0, 70)})`);

await page.fill("#count", "2");
[dl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#download")]);
path = new URL("unlock-paid.pdf", out).pathname;
await dl.saveAs(path);
const paidText = await pdfText(path);
check(!paidText.includes(WATERMARK), "the paid book has no watermark");
// The extractor has to be reading something, or "no watermark" is the same
// empty pass this replaced.
check(/Word Search/i.test(paidText), "and the extractor really read the book");

// The cover is the half that was worth paying for.
const [cdl] = await Promise.all([page.waitForEvent("download", { timeout: 180000 }), page.click("#downloadCover")]);
const cpath = new URL("unlock-cover.pdf", out).pathname;
await cdl.saveAs(cpath);
check(!(await pdfText(cpath)).includes(COVER_MARK), "the paid cover has no PREVIEW mark");

// And it survives closing the laptop.
await page.reload({ waitUntil: "networkidle" });
await page.waitForSelector(".grid div");
check(/Unlocked/.test(await page.textContent("#tier")), "the unlock survives a reload");
check(errs.length === 0, `no page errors (${errs.slice(0, 2).join(" | ") || "none"})`);

await browser.close();
stop();

console.log("");
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("UNLOCK OK — every branch that hands out a licence has now run");
