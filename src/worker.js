// Cloudflare Worker: static site + two small routes.
//
//   GET  /config.js     -> window.PUZZLE_PRESS_PAY_URL from env (empty = no Buy button)
//   POST /api/verify    -> { email } -> is there a paid Stripe Checkout Session for it?
//   everything else     -> static assets from public/
//
// Env: PAY_URL (var), STRIPE_KEY (secret; a *restricted* key with read access
// to Checkout Sessions only — the boss creates it, this code only reads it).

const JSON_HEADERS = { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" };

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/config.js") {
      const body = `window.PUZZLE_PRESS_PAY_URL = ${JSON.stringify(env.PAY_URL || "")};\n`;
      return new Response(body, {
        headers: { "content-type": "application/javascript; charset=utf-8", "cache-control": "no-store" },
      });
    }

    if (url.pathname === "/api/verify") {
      if (request.method !== "POST") return json({ ok: false, error: "POST only" }, 405);
      return verify(request, env);
    }

    return env.ASSETS.fetch(request);
  },
};

function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

async function verify(request, env) {
  if (!env.STRIPE_KEY) return json({ ok: false, error: "Checkout is not set up yet." }, 503);

  let typed = "";
  try {
    const body = await request.json();
    typed = String(body.email || "").trim();
  } catch {
    return json({ ok: false, error: "Bad request." }, 400);
  }
  const email = typed.toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 254) {
    return json({ ok: false, error: "That does not look like an email address." }, 400);
  }

  const headers = { authorization: `Bearer ${env.STRIPE_KEY}` };
  // Stripe's address, overridable, and the override is the whole reason the
  // success path can be tested at all. Until this existed, the only way to make
  // this function return `ok: true` was for somebody to actually pay $19, so it
  // never had: a hundred test calls, every one of them an address with no
  // payment behind it, every one taking the 404 branch. The branch that hands
  // out licences had never run. STRIPE_API is not set in production and there
  // is no code path that sets it from a request — it is a binding, so only
  // somebody who can deploy the Worker can point it anywhere.
  const api = env.STRIPE_API || "https://api.stripe.com";
  const sessions = async (params, startingAfter = null) => {
    const q = new URLSearchParams({ status: "complete", limit: "100", ...params });
    if (startingAfter) q.set("starting_after", startingAfter);
    const res = await fetch(`${api}/v1/checkout/sessions?${q}`, { headers });
    if (!res.ok) throw new Error("stripe");
    const body = await res.json();
    return { data: body.data || [], hasMore: Boolean(body.has_more) };
  };
  const isPaidFor = (s) =>
    s.payment_status === "paid" && ((s.customer_details || {}).email || "").toLowerCase() === email;

  let paid = null;
  let ranOut = false;
  try {
    // Exact filter first, as typed and lowercased — one call, and enough for
    // anyone who types their email the way they typed it at checkout.
    for (const candidate of [...new Set([typed, email])]) {
      const { data } = await sessions({ "customer_details[email]": candidate });
      paid = data.find(isPaidFor);
      if (paid) break;
    }
    // Stripe's filter is exact, so John@Gmail.com at checkout and
    // john@gmail.com here would otherwise be "no payment found". Fall back to
    // a case-insensitive scan of completed sessions, newest first, PAGED —
    // one page of 100 would quietly stop finding older buyers as soon as
    // there are more than a hundred sales. MAX_SCAN_PAGES keeps this inside
    // a Worker's subrequest budget (50 per request on the free plan); at 100
    // sessions a page that reaches 2,000 payments back.
    //
    // What it costs, measured against production 2026-09-13: an email with no
    // payment behind it — the worst case, because it can never short-circuit —
    // came back in 0.33 seconds, three times running. The account is nearly
    // empty, so the scan stops after one page. It grows one Stripe round trip
    // per hundred completed sessions, so the day this becomes slow is the day
    // there are a thousand sales, and that day can afford a better index.
    const MAX_SCAN_PAGES = 20;
    if (!paid) {
      let after = null;
      for (let page = 0; page < MAX_SCAN_PAGES; page++) {
        const { data, hasMore } = await sessions({}, after);
        paid = data.find(isPaidFor);
        if (paid || !hasMore || data.length === 0) break;
        after = data[data.length - 1].id;
        // Every page but the last was full and had no match; if we hit the cap
        // with more still to come, say so rather than implying they never paid.
        if (page === MAX_SCAN_PAGES - 1) ranOut = true;
      }
    }
  } catch {
    return json({ ok: false, error: "Could not reach the payment provider. Try again in a minute." }, 502);
  }

  if (!paid) {
    return json(
      {
        ok: false,
        error: ranOut
          ? "We could not find that payment automatically. Email support@bananafest-destiny.com with the email on your Stripe receipt and we will unlock it by hand."
          // The ordinary way this fails is a buyer typing a different address
          // from the one Stripe has — a work address, a typo, the account
          // their card is under. Without a way out, somebody who has already
          // paid $19 is left at a dead end that says no, so this message ends
          // where the other one does.
          : "No completed payment found for that email. Use the exact email on your Stripe receipt — if that still does not work, email support@bananafest-destiny.com and we will unlock it by hand.",
      },
      404,
    );
  }
  return json({ ok: true, email, token: `stripe:${paid.id}` });
}
