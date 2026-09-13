// The fundamentals, across every page in the sitemap. A site with 45 pages
// whose main channel is search cannot afford a canonical pointing at the
// wrong URL or two pages claiming the same title — and neither is visible
// by looking at the pages.
const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const SITE = "https://puzzlepress.bananafest-destiny.com";
let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
check(locs.length > 0, "sitemap has entries");
const pages = locs.filter((u) => !u.endsWith(".pdf"));

const tag = (html, re) => (html.match(re) || [])[1]?.trim();
const seen = { title: new Map(), desc: new Map(), canonical: new Map() };
const assets = new Set();

for (const loc of pages) {
  const path = loc.replace(SITE, "") || "/";
  const res = await fetch(`${base}${path}`);
  check(res.status === 200, `${path} serves 200 (${res.status})`);
  if (res.status !== 200) continue;
  const html = await res.text();

  const title = tag(html, /<title>([^<]*)<\/title>/);
  check(title && title.length >= 15 && title.length <= 75, `${path}: title length ${title?.length} — "${title}"`);
  const clash = seen.title.get(title);
  check(!clash, `${path}: title is unique (also on ${clash})`);
  seen.title.set(title, path);

  const desc = tag(html, /<meta name="description" content="([^"]*)"/);
  check(desc && desc.length >= 70 && desc.length <= 320, `${path}: description length ${desc?.length}`);
  const dclash = seen.desc.get(desc);
  check(!dclash, `${path}: description is unique (also on ${dclash})`);
  seen.desc.set(desc, path);

  // The canonical must name this page on the real domain — a copy-paste that
  // points every page at the home page is the classic way to lose a site.
  const canonical = tag(html, /<link rel="canonical" href="([^"]*)"/);
  check(canonical === loc, `${path}: canonical is ${canonical}, sitemap says ${loc}`);
  const cclash = seen.canonical.get(canonical);
  check(!cclash, `${path}: canonical is unique (also on ${cclash})`);
  seen.canonical.set(canonical, path);

  const ogTitle = tag(html, /<meta property="og:title" content="([^"]*)"/);
  const ogUrl = tag(html, /<meta property="og:url" content="([^"]*)"/);
  const ogImage = tag(html, /<meta property="og:image" content="([^"]*)"/);
  check(Boolean(ogTitle), `${path}: has og:title`);
  check(ogUrl === loc, `${path}: og:url is ${ogUrl}`);
  check(Boolean(ogImage), `${path}: has og:image`);
  if (ogImage) assets.add(ogImage);

  check(/<meta name="viewport"/.test(html), `${path}: has a viewport tag`);
  check((html.match(/<h1[\s>]/g) || []).length === 1, `${path}: exactly one h1`);
  check(!/<meta name="robots" content="[^"]*noindex/.test(html), `${path}: not noindexed`);

  // Structured data, where a page carries it, must actually parse.
  for (const m of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try { JSON.parse(m[1]); } catch (e) { check(false, `${path}: JSON-LD does not parse (${e.message})`); }
  }
}

// Every share image referenced must exist and be an image.
for (const img of assets) {
  const r = await fetch(img.replace(SITE, base));
  check(r.ok && (r.headers.get("content-type") || "").startsWith("image/"), `og:image ${img} → ${r.status} ${r.headers.get("content-type")}`);
}

const robots = await (await fetch(`${base}/robots.txt`)).text();
check(/Sitemap:\s*https:\/\/puzzlepress\.bananafest-destiny\.com\/sitemap\.xml/i.test(robots), `robots.txt points at the sitemap: ${robots.slice(0, 120)}`);
check(!/^\s*Disallow:\s*\/\s*$/im.test(robots), "robots.txt does not disallow the whole site");

console.log(`${pages.length} pages, ${assets.size} share images, ${failed} problem(s)`);
if (failed) process.exit(1);
console.log("SEO OK");
