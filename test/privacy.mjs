// Prove the page's privacy claim: generating and downloading a book must send
// nothing to any server, and the only request that ever carries user input is
// the unlock check, which carries an email and nothing else.
import { chromium } from "playwright";

const base = process.argv[2] || "https://puzzlepress.bananafest-destiny.com";
const SECRET = "ZZQXVWKJPL"; // a word that appears nowhere except what we type

const b = await chromium.launch();
const p = await b.newPage({ viewport: { width: 1280, height: 1000 }, acceptDownloads: true });
await p.route("https://static.cloudflareinsights.com/**", (route) => route.abort());

const requests = [];
p.on("request", (r) => {
  let body = "";
  try { body = r.postData() || ""; } catch {}
  requests.push({ url: r.url(), method: r.method(), body });
});

await p.goto(base, { waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

await p.evaluate(() => localStorage.setItem("puzzlepress.license", JSON.stringify({ email: "t@e.com", token: "d", verifiedAt: Date.now() })));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector(".grid div");

const before = requests.length;
await p.fill("#title", `${SECRET} Book`);
await p.fill("#author", `${SECRET} Author`);
await p.uncheck(".themes input[value='animals']");
await p.fill("#custom", `${SECRET}\nsecretword\nhiddenterm\nprivateline\nconfidential\nunspoken\nwhispered\nmurmured\nunshared\nquiet`);
await p.fill("#customTitle", SECRET);
await p.fill("#count", "10");
await p.waitForTimeout(1200);
const [dl] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#download")]);
await dl.saveAs(new URL("../samples/browser/privacy.pdf", import.meta.url).pathname);
const [dl2] = await Promise.all([p.waitForEvent("download", { timeout: 180000 }), p.click("#downloadCover")]);
await dl2.saveAs(new URL("../samples/browser/privacy-cover.pdf", import.meta.url).pathname);
await p.waitForTimeout(500);

const during = requests.slice(before);
console.log("requests made while typing, generating and downloading:", during.length);
for (const r of during) console.log("   ", r.method, r.url.slice(0, 110));

const leaked = requests.filter((r) => r.url.includes(SECRET) || (r.body && r.body.includes(SECRET)));
console.log("requests containing the typed words:", leaked.length);
if (leaked.length) {
  for (const r of leaked) console.log("  LEAK:", r.method, r.url.slice(0, 200), r.body.slice(0, 200));
  throw new Error("user input left the browser");
}

// Nothing third-party except Cloudflare's own Web Analytics beacon, added
// 2026-09-16 (boss's token). It is cookieless and sends no page content —
// pageview, referrer, country only — so it does not touch the actual promise
// this test exists to enforce, which is about what a user types, checked
// above by the SECRET leak search. Everything else must still be same-origin.
const origin = new URL(base).origin;
const ALLOWED_THIRD_PARTY = /^https:\/\/(static\.)?cloudflareinsights\.com\//;
const offsite = requests.filter((r) => !r.url.startsWith(origin) && !r.url.startsWith("data:") && !r.url.startsWith("blob:") && !ALLOWED_THIRD_PARTY.test(r.url));
console.log("off-site requests:", offsite.length, offsite.map((r) => new URL(r.url).host));
if (offsite.length) throw new Error("page contacts a third party: " + offsite.map((r) => r.url).join(", "));

// The /px/ funnel beacons (src/ui/main.js, added 2026-09-21). They are the one
// thing on this site that reports what a visitor *did*, so they are the one
// thing most able to quietly start reporting what a visitor *typed*. Hold them
// to the shape they were designed with rather than to a comment: a closed set
// of known paths, a GET, and a query string that is nothing but a cache
// buster. Adding a beacon is fine; adding a parameter to one is not.
const PX_PATHS = new Set(["tool", "touched", "browsed", "click", "empty", "made", "failed", "handoff", "handofftop", "compare", "compareclick", "guide", "guideclick", "list", "listclick", "pay", "checkout", "unlock"].map((n) => `/px/${n}.gif`));
const px = requests.filter((r) => r.url.startsWith(origin) && new URL(r.url).pathname.startsWith("/px/"));
console.log("funnel beacons:", px.length, px.map((r) => new URL(r.url).pathname));
for (const r of px) {
  const u = new URL(r.url);
  if (r.method !== "GET") throw new Error(`beacon is not a GET: ${r.method} ${u.pathname}`);
  if (r.body) throw new Error(`beacon carries a body: ${u.pathname}`);
  if (!PX_PATHS.has(u.pathname)) throw new Error(`unknown beacon path: ${u.pathname} — add it here on purpose or not at all`);
  // One opaque token, no key=value pairs: a beacon must not grow a payload.
  if (!/^\?[a-z0-9]{1,24}$/.test(u.search)) throw new Error(`beacon query is not a bare cache buster: ${u.pathname}${u.search}`);
}
// Fired at most once each per page load, or the dashboard's "people" counts
// start drifting and nobody notices. Scoped to `during` deliberately: this
// script loads the page twice, and a beacon firing once on each load is the
// design, not the bug.
const dupes = during
  .filter((r) => r.url.startsWith(origin) && new URL(r.url).pathname.startsWith("/px/"))
  .map((r) => new URL(r.url).pathname)
  .filter((p, i, a) => a.indexOf(p) !== i);
if (dupes.length) throw new Error("beacon fired more than once in a page load: " + [...new Set(dupes)].join(", "));

// The one request that is allowed to carry input: /api/verify, email only.
await p.evaluate(() => localStorage.removeItem("puzzlepress.license"));
await p.reload({ waitUntil: "networkidle" });
await p.waitForSelector(".grid div");
await p.click("#unlockLink");
await p.waitForSelector("#unlockDialog[open]");
await p.fill("#email", "someone@example.com");
const mark = requests.length;
await p.click("#verify");
await p.waitForTimeout(3000);
const verify = requests.slice(mark).filter((r) => r.url.includes("/api/verify"));
console.log("verify requests:", verify.length, verify.map((r) => r.body));
if (verify.length !== 1) throw new Error("expected exactly one verify request");
const sent = JSON.parse(verify[0].body || "{}");
if (Object.keys(sent).join(",") !== "email") throw new Error("verify sends more than the email: " + Object.keys(sent));

await b.close();
console.log("PRIVACY OK — nothing typed ever left the browser; the funnel beacons carry a path and nothing else; only the email is ever sent");
