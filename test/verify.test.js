// /api/verify against a stubbed Stripe. The thing worth testing is the
// fallback scan: it must page through completed sessions rather than looking
// at only the newest hundred, or a buyer from a hundred sales ago whose email
// case does not match exactly gets told they never paid.
import { test } from "node:test";
import assert from "node:assert/strict";
import worker from "../src/worker.js";

const session = (i, email, paid = true) => ({
  id: `cs_${i}`,
  payment_status: paid ? "paid" : "unpaid",
  customer_details: { email },
});

// `pages` is an array of arrays, newest first, as Stripe would return them.
function stubStripe(pages, { exact = {} } = {}) {
  const calls = [];
  globalThis.fetch = async (url) => {
    const u = new URL(url);
    calls.push(u.searchParams.get("starting_after") ?? (u.searchParams.get("customer_details[email]") ? `exact:${u.searchParams.get("customer_details[email]")}` : "first"));
    const filtered = u.searchParams.get("customer_details[email]");
    if (filtered) return Response.json({ data: exact[filtered] ?? [], has_more: false });
    const after = u.searchParams.get("starting_after");
    const index = after ? pages.findIndex((p) => p.some((s) => s.id === after)) + 1 : 0;
    const data = pages[index] ?? [];
    return Response.json({ data, has_more: index < pages.length - 1 });
  };
  return calls;
}

const ask = (email) =>
  worker.fetch(new Request("https://x/api/verify", { method: "POST", body: JSON.stringify({ email }) }), { STRIPE_KEY: "rk_test" });

test("the exact filter answers without scanning", async () => {
  const calls = stubStripe([[]], { exact: { "buyer@example.com": [session(1, "buyer@example.com")] } });
  const res = await ask("buyer@example.com");
  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(body.token, "stripe:cs_1");
  assert.deepEqual(calls, ["exact:buyer@example.com"]);
});

test("a buyer 300 sales ago with different email case is still found", async () => {
  // Three full pages; the match is on the third, spelled with capitals.
  const pages = [
    Array.from({ length: 100 }, (_, i) => session(`a${i}`, `other${i}@example.com`)),
    Array.from({ length: 100 }, (_, i) => session(`b${i}`, `other${i}@example.net`)),
    [...Array.from({ length: 99 }, (_, i) => session(`c${i}`, `other${i}@example.org`)), session("old", "Buyer@Example.com")],
  ];
  const calls = stubStripe(pages);
  const res = await ask("buyer@example.com");
  const body = await res.json();
  assert.equal(body.ok, true, `expected a match, got ${JSON.stringify(body)}`);
  assert.equal(body.token, "stripe:cs_old");
  // One exact-filter call, then three scan pages.
  assert.equal(calls.length, 4);
  assert.equal(calls[2], "cs_a99", "second page continues after the first page's last id");
});

test("an unpaid session for that email is not an unlock", async () => {
  stubStripe([[session(1, "buyer@example.com", false)]]);
  const res = await ask("buyer@example.com");
  assert.equal(res.status, 404);
  assert.equal((await res.json()).ok, false);
});

test("when the scan hits its page cap, the message sends them to support", async () => {
  const pages = Array.from({ length: 25 }, (_, p) => Array.from({ length: 100 }, (_, i) => session(`p${p}_${i}`, `nobody${p}${i}@example.com`)));
  stubStripe(pages);
  const res = await ask("buyer@example.com");
  const body = await res.json();
  assert.equal(res.status, 404);
  assert.match(body.error, /support@bananafest-destiny\.com/);
  assert.doesNotMatch(body.error, /No completed payment found/);
});

test("a bad email is refused before Stripe is called", async () => {
  const calls = stubStripe([[]]);
  const res = await ask("not-an-email");
  assert.equal(res.status, 400);
  assert.equal(calls.length, 0);
});
