// Free tier: up to FREE_LIMIT puzzles per book, watermark on every page.
// Licensed: unlimited, no watermark. The licence is a record in localStorage
// written after /api/verify confirms a paid Stripe checkout for an email.

// 12 is the fewest puzzles that clear KDP's 24-page minimum on every trim, so
// a free book is a real book rather than a stub KDP would reject. The
// watermark is what protects the paid tier, not the puzzle count: a marked
// book cannot be published, so giving away a usable length costs nothing and
// proves the product actually works.
export const FREE_LIMIT = 12;
export const PRICE_LABEL = "$19 one-time";
const KEY = "puzzlepress.license";

export function getLicense() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return null;
    const rec = JSON.parse(raw);
    return rec && rec.email && rec.token ? rec : null;
  } catch {
    return null;
  }
}

export function setLicense(rec) {
  try {
    localStorage.setItem(KEY, JSON.stringify(rec));
  } catch {}
}

export function clearLicense() {
  try {
    localStorage.removeItem(KEY);
  } catch {}
}

export async function verifyEmail(email) {
  const res = await fetch("/api/verify", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.ok) throw new Error(body.error || "Could not verify that email.");
  return { email: body.email, token: body.token, verifiedAt: Date.now() };
}
