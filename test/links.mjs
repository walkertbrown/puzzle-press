// Every page in the sitemap, plus every internal link and image on each of
// them, resolves with 200 on the live site. No browser; plain fetches.
// Run: node test/links.mjs [baseUrl]
const base = (process.argv[2] || "https://puzzle-press.walkertbrown.workers.dev").replace(/\/$/, "");
const site = "https://puzzlepress.bananafest-destiny.com";
const sitemap = await (await fetch(`${base}/sitemap.xml`)).text();
const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].replace(site, "")).filter((p) => !p.endsWith(".pdf"));
const seen = new Map(); // url → status
let bad = 0;
const status = async (url) => {
  if (seen.has(url)) return seen.get(url);
  const r = await fetch(url, { method: "GET", redirect: "manual" });
  seen.set(url, r.status);
  return r.status;
};
for (const p of pages) {
  const url = `${base}${p}`;
  const r = await fetch(url);
  if (r.status !== 200) { console.log(`FAIL ${p} → ${r.status}`); bad++; continue; }
  const html = await r.text();
  const refs = new Set();
  for (const m of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
    let h = m[1];
    if (h.startsWith("#") || h.startsWith("mailto:") || h.startsWith("data:") || h.startsWith("javascript:")) continue;
    if (h.startsWith("http") && !h.startsWith(site)) continue; // external: not ours to check here
    h = h.replace(site, "");
    h = h.split("#")[0];
    if (!h) continue;
    if (!h.startsWith("/")) h = p.replace(/[^/]*$/, "") + h; // relative to the page's directory
    refs.add(h);
  }
  for (const h of refs) {
    const s = await status(`${base}${h}`);
    if (s !== 200) { console.log(`FAIL on ${p}: ${h} → ${s}`); bad++; }
  }
}
console.log(`${pages.length} pages, ${seen.size} distinct links/assets checked, ${bad} bad`);
if (bad) process.exit(1);
console.log("links OK");
