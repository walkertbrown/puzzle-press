// The assets Product Hunt shows, measured against what Product Hunt asks for.
//
// On launch day almost nobody arrives at the site cold. They see a row in a
// feed — a small square thumbnail, a name and a tagline — and a gallery once
// they click. Those images are the first screen, and until this file existed
// nothing checked them: `marketing/product-hunt.md` named a gallery that
// included a 1200x630 social card and a hero JPEG I had shrunk for page-weight
// reasons an hour earlier, without once thinking about its other job.
//
// Requirements confirmed from help.producthunt.com on 2026-09-13:
//   Thumbnail  square; 240x240 recommended; GIF allowed; under 3 MB.
//   Gallery    1270x760 recommended (1.671:1); at least 2 images.
//   Tagline    60 characters. Description 260.
// The shipped images are 2x those pixel dimensions so they stay sharp on a
// retina screen; what matters is the ratio and the ceiling.
//
// Run: node test/launch-assets.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

const pub = new URL("../public/", import.meta.url).pathname;
const doc = readFileSync(new URL("../marketing/product-hunt.md", import.meta.url).pathname, "utf8");

const MAX_BYTES = 3 * 1024 * 1024;
const GALLERY_RATIO = 1270 / 760;
const TAGLINE_MAX = 60;
const DESCRIPTION_MAX = 260;

let failed = 0;
const check = (ok, msg) => { if (!ok) { failed++; console.log(`FAIL ${msg}`); } };

// Image dimensions from the file headers. Four formats, no dependency: adding
// one to measure a handful of bytes would be worse than reading the spec.
function size(buf) {
  if (buf[0] === 0x89 && buf.toString("latin1", 1, 4) === "PNG") {
    return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
  }
  if (buf.toString("latin1", 0, 3) === "GIF") {
    return { w: buf.readUInt16LE(6), h: buf.readUInt16LE(8) };
  }
  if (buf.toString("latin1", 0, 4) === "RIFF" && buf.toString("latin1", 8, 12) === "WEBP") {
    const tag = buf.toString("latin1", 12, 16);
    if (tag === "VP8 ") return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    if (tag === "VP8L") {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (tag === "VP8X") return { w: (buf.readUIntLE(24, 3) & 0xffffff) + 1, h: (buf.readUIntLE(27, 3) & 0xffffff) + 1 };
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2;
    while (i < buf.length) {
      if (buf[i] !== 0xff) { i++; continue; }
      const marker = buf[i + 1];
      // SOF0..SOF15, excluding the DHT/JPG/DAC markers that share the range.
      if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
        return { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7) };
      }
      i += 2 + buf.readUInt16BE(i + 2);
    }
  }
  throw new Error("unrecognised image format");
}

const measure = (rel) => {
  const buf = readFileSync(join(pub, rel));
  return { ...size(buf), bytes: buf.length };
};

// --- thumbnail: the whole listing, at about 48px ---
const thumb = measure("thumbnail.png");
console.log(`thumbnail.png       ${thumb.w}x${thumb.h}  ${(thumb.bytes / 1024).toFixed(0)} KB`);
check(thumb.w === thumb.h, `the thumbnail is ${thumb.w}x${thumb.h}; Product Hunt wants a square`);
check(thumb.w >= 240, `the thumbnail is ${thumb.w}px; 240 is the recommended size`);
check(thumb.bytes <= MAX_BYTES, `the thumbnail is ${(thumb.bytes / 1024 / 1024).toFixed(1)} MB, over the 3 MB limit`);

// --- gallery: every frame the launch doc names, in the shape PH lays out ---
const gallery = readdirSync(join(pub, "gallery")).filter((f) => f.endsWith(".png")).sort();
check(gallery.length >= 2, `only ${gallery.length} gallery image(s); Product Hunt requires at least 2`);
for (const f of gallery) {
  const m = measure(join("gallery", f));
  const ratio = m.w / m.h;
  console.log(`gallery/${f.padEnd(18)} ${m.w}x${m.h}  ratio ${ratio.toFixed(3)}  ${(m.bytes / 1024).toFixed(0)} KB`);
  check(Math.abs(ratio - GALLERY_RATIO) < 0.01, `gallery/${f} is ${ratio.toFixed(3)}:1; Product Hunt lays out ${GALLERY_RATIO.toFixed(3)}:1, so it will be cropped or letterboxed`);
  check(m.w >= 1270 && m.h >= 760, `gallery/${f} is ${m.w}x${m.h}, under the 1270x760 Product Hunt renders at`);
  check(m.bytes <= MAX_BYTES, `gallery/${f} is ${(m.bytes / 1024 / 1024).toFixed(1)} MB, over the 3 MB limit`);
  check(doc.includes(`gallery/${f}`), `gallery/${f} exists but the launch doc never names it — it will not get uploaded`);
}
// And the reverse: nothing named in the doc may be missing from disk.
for (const named of doc.match(/gallery\/[\w.-]+\.png/g) ?? []) {
  check(gallery.includes(named.slice("gallery/".length)), `the launch doc names ${named}, which is not in public/gallery/`);
}

// --- the demo GIF, which PH accepts as a gallery item ---
const gif = measure("demo.gif");
console.log(`demo.gif            ${gif.w}x${gif.h}  ${(gif.bytes / 1024).toFixed(0)} KB`);
check(gif.bytes <= MAX_BYTES, `demo.gif is ${(gif.bytes / 1024 / 1024).toFixed(1)} MB, over the 3 MB limit`);

// --- the words, which have hard limits on the submission form ---
// The counts written beside them are checked too. The description said "226
// chars" and was 250 — harmless at 250, but the count is there so nobody has
// to retype the text into a character counter at 2am, and a count that lies is
// worse than no count.
const tagline = doc.match(/^\*\*(.+?)\*\* — (\d+) chars ← recommended$/m);
check(Boolean(tagline), "no recommended tagline is marked in the launch doc");
if (tagline) {
  console.log(`tagline             ${tagline[1].length} chars`);
  check(tagline[1].length <= TAGLINE_MAX, `the tagline is ${tagline[1].length} chars, over the ${TAGLINE_MAX} limit`);
  check(Number(tagline[2]) === tagline[1].length, `the tagline says ${tagline[2]} chars but is ${tagline[1].length}`);
}
const description = doc.match(/## Description \(260 char limit\)\n\n> (.+)\n\n(\d+) chars\./);
check(Boolean(description), "no description block found in the launch doc");
if (description) {
  console.log(`description         ${description[1].length} chars`);
  check(description[1].length <= DESCRIPTION_MAX, `the description is ${description[1].length} chars, over the ${DESCRIPTION_MAX} limit`);
  check(Number(description[2]) === description[1].length, `the description says ${description[2]} chars but is ${description[1].length}`);
}
// And the thumbnail, which the doc did not mention at all until today.
check(/^## Thumbnail$/m.test(doc) && doc.includes("thumbnail.png"), "the launch doc does not name a thumbnail");

if (failed) { console.log(`\n${failed} check(s) failed`); process.exit(1); }
console.log("LAUNCH ASSETS OK — square thumbnail, every gallery frame at Product Hunt's shape and under its limits, and the words fit the form");
