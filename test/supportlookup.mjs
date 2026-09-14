// scripts/unlock.mjs is what support runs when a buyer cannot get in. Its most
// important branch is the one that prints the reply — and the live account has
// never held a paid session, so that branch has never executed. Same trap as
// phase 19, same escape: point it at a fake Stripe and make every branch run.
//
// Run: node test/supportlookup.mjs
import { createServer } from "node:http";
import { execFile } from "node:child_process";

const PORT = 8933;
let failed = 0;
const check = (ok, msg) => {
  console.log(`  ${ok ? "ok  " : "FAIL"} ${msg}`);
  if (!ok) failed++;
};

const SESSIONS = [
  {
    id: "cs_live_PAIDBUYER0001", object: "checkout_session", created: 1757900000,
    amount_total: 1900, currency: "usd", status: "complete", payment_status: "paid",
    customer_details: { email: "Jane.Buyer@Example.com", name: "Jane Buyer", phone: null },
    livemode: true, payment_intent: "pi_PAID0001", client_reference_id: null,
  },
  {
    id: "cs_live_NOEMAIL00002", object: "checkout_session", created: 1757890000,
    amount_total: 1900, currency: "usd", status: "complete", payment_status: "paid",
    customer_details: { email: null, name: "No Address", phone: null },
    livemode: true, payment_intent: "pi_NOEMAIL2", client_reference_id: null,
  },
  {
    id: "cs_live_ABANDONED0003", object: "checkout_session", created: 1757880000,
    amount_total: 1900, currency: "usd", status: "open", payment_status: "unpaid",
    customer_details: { email: "gave.up@example.com", name: null, phone: null },
    livemode: true, payment_intent: null, client_reference_id: null,
  },
  {
    id: "cs_live_MYOWNTEST0004", object: "checkout_session", created: 1757870000,
    amount_total: 1900, currency: "usd", status: "complete", payment_status: "paid",
    customer_details: { email: "me@bananafest-destiny.com", name: "Self Test", phone: null },
    livemode: true, payment_intent: "pi_SELF004", client_reference_id: "selftest-123",
  },
];

const stripe = createServer((req, res) => {
  const url = new URL(req.url, "http://x");
  const send = (o, code = 200) => {
    res.writeHead(code, { "content-type": "application/json" });
    res.end(JSON.stringify(o));
  };
  const m = url.pathname.match(/^\/v1\/checkout\/sessions\/(.+)$/);
  if (m) {
    const s = SESSIONS.find((x) => x.id === m[1]);
    return s ? send(s) : send({ error: { message: `No such checkout session: '${m[1]}'` } }, 404);
  }
  if (url.pathname === "/v1/checkout/sessions") {
    return send({ object: "list", data: SESSIONS, has_more: false });
  }
  const p = url.pathname.match(/^\/v1\/payment_intents\/(.+)$/);
  if (p) {
    return send({
      id: p[1],
      latest_charge: { payment_method_details: { card: { last4: p[1] === "pi_PAID0001" ? "4242" : "1111" } } },
    });
  }
  send({ error: { message: "no such endpoint" } }, 404);
});
await new Promise((r) => stripe.listen(PORT, "127.0.0.1", r));

const run = (args) =>
  new Promise((resolve) =>
    execFile("node", ["scripts/unlock.mjs", ...args], {
      cwd: new URL("..", import.meta.url).pathname,
      // --days is huge because the fake sessions are timestamped in the past
      // and the script filters by a created[gte] the stub happily ignores; the
      // point is the branches, not the window arithmetic.
      env: { ...process.env, STRIPE_API: `http://127.0.0.1:${PORT}` },
      maxBuffer: 16 << 20,
    }, (err, out, errOut) => resolve({ code: err?.code ?? 0, out: out + errOut })));

// 1. The branch that matters: a real buyer whose receipt is in a different case
//    from what they typed. Support needs one thing — the exact address.
console.log("1. a buyer who paid, searched by part of their name");
let r = await run(["Jane"]);
check(/cs_live_PAIDBUYER0001/.test(r.out), "finds the session");
check(/WILL find this/.test(r.out), "says /api/verify will match it");
check(/Reply with this:/.test(r.out), "prints a reply to paste");
check(/enter exactly:\s+Jane\.Buyer@Example\.com/.test(r.out), "and the reply carries the exact address on the receipt");
check(/Capitals do not matter/.test(r.out), "and tells them the capitals are not the problem");
check(r.code === 0, `exits 0 (${r.code})`);

// 2. Searched by the address they typed — lower case, which is how they will
//    write it in the support email.
console.log("\n2. the same buyer, searched by the lowercase address they typed");
r = await run(["jane.buyer@example.com"]);
check(/cs_live_PAIDBUYER0001/.test(r.out), "still finds them — the search is case-insensitive where Stripe's is not");

// 3. By the last four on the card, which is often all they can tell you.
console.log("\n3. searched by the card's last four");
r = await run(["4242"]);
check(/cs_live_PAIDBUYER0001/.test(r.out), "finds them via the payment intent");
check(/checking card numbers/.test(r.out), "and says it is doing the extra lookups");

// 4. By session id off the receipt — an exact lookup, not a search.
console.log("\n4. searched by the session id from their receipt");
r = await run(["cs_live_PAIDBUYER0001"]);
check(/Jane\.Buyer@Example\.com/.test(r.out), "exact lookup works");
r = await run(["cs_live_DOESNOTEXIST"]);
check(/No session with that id/.test(r.out) && r.code === 1, "and a bad id says so instead of printing nothing");

// 5. Paid, but Stripe holds no address. The one case the site cannot fix
//    itself, and the one where improvising would do real damage.
console.log("\n5. paid, but Stripe has no email on the session");
r = await run(["No Address"]);
check(/will NOT find this/.test(r.out), "says /api/verify can never match it");
check(/Refund them/.test(r.out), "and gives the only honest options");
check(/Do not invent one/.test(r.out), "and says not to make an address up");

// 6. Never actually paid.
console.log("\n6. started checkout and never paid");
r = await run(["gave.up@example.com"]);
check(/Nothing was\s+charged/.test(r.out), "says nothing was charged");
check(!/Reply with this:/.test(r.out), "and does not hand them an unlock");

// 7. My own test runs must be labelled, or I will spend launch night reading
//    my own traffic as customers.
console.log("\n7. my own tagged test runs");
r = await run(["Self Test"]);
check(/one of my own test runs/.test(r.out), "labelled as mine, not a customer");

// 8. Nothing found — the most common support case of all.
console.log("\n8. nothing matches");
r = await run(["nobody@nowhere.invalid"]);
check(/Nothing matched/.test(r.out), "says so plainly");
check(/forward it/.test(r.out), "asks for the receipt, which carries the session id");
check(/Do NOT hand out a licence/.test(r.out), "and warns against gifting one to end the thread");
check(r.code === 1, `exits non-zero so a script cannot mistake it for success (${r.code})`);

// 9. It must never write to Stripe.
console.log("\n9. read-only");
const methods = new Set();
stripe.on("request", (req) => methods.add(req.method));
await run(["Jane"]);
check([...methods].every((m) => m === "GET"), `only GETs (${[...methods].join(", ") || "none seen"})`);

stripe.close();
console.log("");
if (failed) { console.log(`${failed} check(s) failed`); process.exit(1); }
console.log("SUPPORT LOOKUP OK — every branch support will hit at 3am has now run");
