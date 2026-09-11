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
  const sessions = async (params) => {
    const q = new URLSearchParams({ status: "complete", limit: "100", ...params });
    const res = await fetch(`https://api.stripe.com/v1/checkout/sessions?${q}`, { headers });
    if (!res.ok) throw new Error("stripe");
    return (await res.json()).data || [];
  };
  const isPaidFor = (s) =>
    s.payment_status === "paid" && ((s.customer_details || {}).email || "").toLowerCase() === email;

  let paid = null;
  try {
    // Exact filter first, as typed and lowercased — cheap and usually enough.
    for (const candidate of [...new Set([typed, email])]) {
      const found = await sessions({ "customer_details[email]": candidate });
      paid = found.find(isPaidFor);
      if (paid) break;
    }
    // Stripe's filter is exact, so John@Gmail.com at checkout and john@gmail.com
    // here would otherwise be "no payment found". Scan recent completed
    // sessions and compare case-insensitively before saying no.
    if (!paid) paid = (await sessions({})).find(isPaidFor);
  } catch {
    return json({ ok: false, error: "Could not reach the payment provider. Try again in a minute." }, 502);
  }

  if (!paid) {
    return json({ ok: false, error: "No completed payment found for that email. Use the exact email from your Stripe receipt." }, 404);
  }
  return json({ ok: true, email, token: `stripe:${paid.id}` });
}
