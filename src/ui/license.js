// Free tier: up to FREE_LIMIT puzzles per book, watermark on every page.
// Licensed: unlimited, no watermark. The licence is a record in localStorage
// written after /api/verify confirms a paid Stripe checkout for an email.

// There is no longer a puzzle-count cap. Capping length meant the free tier
// could only produce something nobody would publish, so it demonstrated the
// opposite of what it needed to. The watermark is the gate: a footer line on
// every page and a PREVIEW mark across the cover make a book unsellable
// however long it is, and a full-length watermarked book proves the product
// actually works. FREE_LIMIT is kept as the UI's maximum, not a tier limit.
export const FREE_LIMIT = 200;

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
