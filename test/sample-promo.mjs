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
import { readFileSync } from "node:fs";
import { PDFDocument, PDFName } from "pdf-lib";

const SITE_URL = "https://puzzlepress.bananafest-destiny.com/";

// The samples index.html actually links to (grep public/index.html for
// "samples/" if this list ever needs rechecking).
const SHOULD_HAVE_PROMO = [
  "sample-6x9.pdf",
  "sample-sudoku-6x9.pdf",
  "sample-maze-6x9.pdf",
  "sample-crisscross-6x9.pdf",
  "sample-crossword-6x9.pdf",
];

// The one other linked sample: a single-page KDP cover wrap. It must stay a
// faithful, single-page cover file — no promo page appended to it.
const SHOULD_STAY_SINGLE_PAGE = ["sample-cover-6x9.pdf"];

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

const pub = new URL("../public/samples/", import.meta.url);

async function lastPageLink(name) {
  const bytes = readFileSync(new URL(name, pub));
  const doc = await PDFDocument.load(bytes);
  const page = doc.getPage(doc.getPageCount() - 1);
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
}

for (const name of SHOULD_STAY_SINGLE_PAGE) {
  const bytes = readFileSync(new URL(name, pub));
  const doc = await PDFDocument.load(bytes);
  check(doc.getPageCount() === 1, `${name} is ${doc.getPageCount()} pages — a KDP cover file must stay single-page`);
}

if (failed) {
  console.log(`${failed} problem(s)`);
  process.exit(1);
}
console.log(`${SHOULD_HAVE_PROMO.length} samples carry a way back to the site, ${SHOULD_STAY_SINGLE_PAGE.length} cover file stays single-page`);
