// What a visitor did, in the only vocabulary this site has.
//
// Every stage of the funnel in scripts/traffic.mjs is read out of Cloudflare's
// request log, and until 2026-09-21 every stage was a *file the browser
// happened to fetch*: main.js for "ran the app", the idle-warmed heavy chunk
// for "did not bounce", render.js for "clicked Download". That is honest about
// network events and silent about people. Corrected for the request/person
// bug, the dashboard read: 7 people stayed, 0 downloaded — and there was no
// way at all to tell whether they scrolled to the generator, touched a
// control, pressed the button and hit an error, or read the hero and left.
//
// This is the smallest thing that answers it: a closed, fixed set of empty 1x1
// GIFs under /px/, one per act, each fired at most once per page load. No id,
// no cookie, no session, no content — the path IS the entire message, and
// every path that exists is a file in public/px/. The site's promise is that
// nothing you type leaves your browser, and nothing here carries anything
// anybody typed: not a title, not a word list, not a setting, not a value, not
// a number. test/privacy.mjs enforces that shape — closed path set, GET, no
// body, a query that is a bare cache-buster token and not one key=value pair —
// so adding a beacon is fine and adding a parameter to one fails the build.
//
// They are real deployed files, deliberately, not 404s. A miss would land in
// the scanner rule in traffic.mjs — the one that files an address asking for
// things that do not exist as an attacker — and every visitor would be
// excluded from their own funnel by the thing built to measure them.
const sent = new Set();

// `keep` is for a beacon fired on something that immediately navigates away —
// the calculators' handoff button is the whole reason it exists. An <img> on
// the outgoing document is cancelled when the new one starts loading, so the
// single most important beacon on the site would have been the least reliable
// one. `fetch(..., {keepalive: true})` is the browser promising to finish the
// request after the document is gone; it is still a GET, still no body, still
// the same path. Anything without it falls back to the image, which is not
// worse than what existed before.
export function px(name, { keep = false } = {}) {
  if (sent.has(name)) return;
  sent.add(name);
  // Cloudflare logs clientRequestPath without the query string, so the cache
  // buster costs nothing in the dashboard: it only stops the browser serving a
  // later page view's beacon out of its own cache.
  const url = `/px/${name}.gif?${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  try {
    if (keep && typeof fetch === "function") {
      fetch(url, { method: "GET", keepalive: true, mode: "no-cors", cache: "no-store" }).catch(() => {});
      return;
    }
  } catch {}
  try {
    new Image().src = url;
  } catch {}
}
