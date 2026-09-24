// Guards the fix in scripts/sample.mjs (2026-09-19): every sample PDF that
// public/index.html actually links to must end with a full-page, clickable
// link back to the site — otherwise a detached PDF viewer (routine on a
// phone) leaves a visitor with no way back. See actual/2026-09-19.md for
// why this exists: sample opens have run far ahead of Download clicks on
// every logged day, and the render engine (render.js/cover.js, shared with
// real paying customers' manuscripts) is deliberately unbranded, so the
// promo page has to live only in the generated sample files.
//
// This does not re-render anything — it reads the committed files in
// public/samples/, the same ones a deploy actually ships. Run after
// `node scripts/sample.mjs` to catch a regression before it goes live.
//
// Run: node test/sample-promo.mjs
import { readFileSync, readdirSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";

const SITE_URL = "https://puzzlepress.bananafest-destiny.com/";

// Both lists are read off the directory, and that is the whole point.
//
// They used to be typed out here, with a comment telling me to re-grep
// index.html "if this list ever needs rechecking". On 2026-09-23 this test
// printed "5 samples carry a way back to the site" and exited 0 while
// sample-large-print-8.5x11.pdf shipped with no link at all — it had been
// added to scripts/sample.mjs in a later block, the addPromoPage() call was
// left off, and it was never added to the list here either. The same omission
// twice, and a green test on top of it.
//
// A hardcoded inventory can only catch regressions in the files somebody
// remembered to add, which is the opposite of what an inventory is for. The
// cover list was worse: it named one of the six cover files, so five were
// unchecked. Anything dropped into public/samples/ is now checked by existing.
const ALL = readdirSync(new URL("../public/samples/", import.meta.url).pathname)
  .filter((f) => f.endsWith(".pdf"))
  .sort();

// An interior is paged through to the end, so it can carry a promo page. A
// cover is a single-page full-wrap artefact and appending to it would destroy
// it — so the naming convention is load-bearing, and asserted below.
const SHOULD_HAVE_PROMO = ALL.filter((f) => !f.includes("cover"));
const SHOULD_STAY_SINGLE_PAGE = ALL.filter((f) => f.includes("cover"));


let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

// An empty or miscategorised directory must not read as "everything passed".
check(SHOULD_HAVE_PROMO.length > 0 && SHOULD_STAY_SINGLE_PAGE.length > 0,
  `public/samples/ looks wrong: ${SHOULD_HAVE_PROMO.length} interiors, ${SHOULD_STAY_SINGLE_PAGE.length} covers`);

const pub = new URL("../public/samples/", import.meta.url);

async function lastPageLink(name, pageIndex = -1) {
  const bytes = readFileSync(new URL(name, pub));
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(pageIndex < 0 ? doc.getPageCount() + pageIndex : pageIndex);
  const annots = page.node.get(PDFName.of("Annots"));
  if (!annots || annots.size() === 0) return null;
  for (let i = 0; i < annots.size(); i++) {
    const obj = doc.context.lookup(annots.get(i));
    const a = obj.get(PDFName.of("A"));
    if (a && obj.get(PDFName.of("Subtype"))?.toString() === "/Link") {
      const uri = a.get(PDFName.of("URI"));
      if (uri) return { pageCount: doc.getPageCount(), url: uri.decodeText(), size: page.getSize() };
    }
  }
  return null;
}

for (const name of SHOULD_HAVE_PROMO) {
  const found = await lastPageLink(name);
  check(found !== null, `${name} has no clickable link on its last page`);
  if (found) {
    check(found.url === SITE_URL, `${name} links to ${found.url}, not ${SITE_URL}`);
    const { width, height } = found.size;
    check(width > 400 && height > 400, `${name}'s promo page is ${width}x${height}pt — too small to be a full-size book page`);
  }
  // The promo page is 33 pages in; the title page is what a reader arriving
  // from search sees first. It must be a way back too.
  const first = await lastPageLink(name, 0);
  check(first?.url === SITE_URL, `${name}'s title page has no link to ${SITE_URL} — the first page seen from search is a dead end`);
}

for (const name of SHOULD_STAY_SINGLE_PAGE) {
  const bytes = readFileSync(new URL(name, pub));
  const doc = await PDFDocument.load(bytes);
  check(doc.getPageCount() === 1, `${name} is ${doc.getPageCount()} pages — a KDP cover file must stay single-page`);
  // 2026-09-24: of five home-ISP addresses that opened a sample directly and
  // never loaded the site, three opened a cover — a one-page file with no way
  // back. A cover cannot take a promo page, so it carries a small visible
  // publisher line on the back panel instead, and that line is the link.
  const found = await lastPageLink(name);
  check(found !== null && found.url === SITE_URL, `${name} has no link back to ${SITE_URL} — a cover opened from search is a dead end`);
}

// Metadata is the other half of the same job (2026-09-23). A PDF's own Title
// is what Google prints as the result headline and its Subject feeds the
// snippet; before this, every sample's Title was a bare book title like
// "Garden & Kitchen Word Search" and every Subject was null, so an indexed
// sample said nothing about being a free KDP-ready file. Checked over the
// discovered directory for the same reason the lists above are.
const DOMAIN = "puzzlepress.bananafest-destiny.com";
for (const name of ALL) {
  const doc = await PDFDocument.load(readFileSync(new URL(name, pub)));
  const title = doc.getTitle() || "";
  const subject = doc.getSubject() || "";
  const keywords = doc.getKeywords() || "";
  check(title.startsWith("Free "), `${name} Title is ${JSON.stringify(title)} — a sample's headline must lead with what it is`);
  check(title.includes("KDP"), `${name} Title omits KDP: ${JSON.stringify(title)}`);
  // Google truncates a result headline around 60-70 characters.
  check(title.length <= 70, `${name} Title is ${title.length} chars — it will be cut off in a result`);
  check(subject.includes(DOMAIN), `${name} Subject does not name the site: ${JSON.stringify(subject)}`);
  check(keywords.includes(","), `${name} Keywords are not comma-separated, so the terms run together: ${JSON.stringify(keywords)}`);
}

if (failed) {
  console.log(`${failed} problem(s)`);
  process.exit(1);
}
console.log(`${SHOULD_HAVE_PROMO.length} samples carry a way back to the site, ${SHOULD_STAY_SINGLE_PAGE.length} cover files stay single-page, ${ALL.length} carry findable metadata`);
