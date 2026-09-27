// Full-wrap paperback cover for KDP: back cover + spine + front cover on one
// PDF page, sized from the interior's page count.
//
// Spine and cover equations are quoted from KDP's "Create a Paperback Cover"
// help page:
//   spine width  = page count x per-page paper thickness (nothing is added)
//   cover width  = bleed + back width + spine + front width + bleed
//   cover height = bleed + trim height + bleed
//   bleed        = 0.125" on every outside edge
//   spine text   = allowed only at 79 pages or more
//
// The barcode area is not given as a number on that page; the 2" x 1.2" clear
// box in the lower right of the back cover is the convention KDP's own
// downloadable templates use, and is what we keep clear.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { PT } from "./kdp.js";
import { coverGeometry, BARCODE_IN, SPINE_TEXT_IN, SPINE_TYPE_MIN_PT } from "./cover-geometry.js";
import { makeRng } from "../generator/rng.js";
import { wallSegments } from "../generator/maze.js";
import { PALETTE_HEX, paletteIndex } from "./palettes.js";

export {
  BLEED_IN, SPINE_TEXT_MIN_PAGES, BARCODE_IN, PAPER, spineWidthInches, coverGeometry,
} from "./cover-geometry.js";

const INK = rgb(0.09, 0.16, 0.29);
const PAPER_BG = rgb(0.96, 0.965, 0.975);
const FAINT = rgb(0.90, 0.915, 0.935);
const MUTED = rgb(0.36, 0.42, 0.5);
const WHITE = rgb(1, 1, 1);

const hex = (h) => rgb(parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255);
function mix(c, t) { // towards white by t
  return rgb(c.red + (1 - c.red) * t, c.green + (1 - c.green) * t, c.blue + (1 - c.blue) * t);
}
export const PALETTES = PALETTE_HEX.map((p) => ({ ...p, bgC: hex(p.bg), deepC: hex(p.deep), accentC: hex(p.accent), tintC: mix(hex(p.bg), 0.1), softC: mix(hex(p.bg), 0.78) }));
export const paletteFor = (title, name = "") => PALETTES[paletteIndex(title, name)];

export async function renderCover({
  title = "Word Search",
  subtitle = "",
  author = "",
  trim = "6x9",
  pageCount = 24,
  paper = "cream",
  puzzleCount = 0,
  licensed = true,
  blurb = "",
  samplePuzzle = null, // a generated puzzle, drawn small on the back
  fonts = null,
  seed = "cover",
  largePrint = false, // the "Large print" preset was on when this book was built
  palette = "", // a PALETTES name; empty picks one from the title
} = {}) {
  const g = coverGeometry({ trim, pageCount, paper });
  const doc = await PDFDocument.create();
  doc.setTitle(`${title} — cover`);
  if (author) doc.setAuthor(author);
  doc.setProducer("Puzzle Press");
  doc.setCreator("Puzzle Press");

  let regular, bold;
  if (fonts) {
    doc.registerFontkit(fontkit);
    regular = await doc.embedFont(fonts.regular, { subset: true });
    bold = await doc.embedFont(fonts.bold, { subset: true });
  } else {
    regular = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }

  const page = doc.addPage([g.width, g.height]);
  // Background covers the whole sheet including bleed.
  const pal = paletteFor(title, palette);
  page.drawRectangle({ x: 0, y: 0, width: g.width, height: g.height, color: pal.bgC });

  drawField(page, g, regular, seed, samplePuzzle && samplePuzzle.kind, pal);
  const { card, noteY } = drawFront(page, g, { title, subtitle, author, puzzleCount, samplePuzzle, largePrint, pal, regular, bold });
  drawSpine(page, g, { title, author, regular, bold, pal });
  drawBack(page, g, { title, blurb, puzzleCount, samplePuzzle, regular, bold });
  if (largePrint) drawLargePrintBadge(page, g, bold, card);
  if (!licensed) drawCoverWatermark(page, g, bold, regular, noteY); // over the strip, clear of the author

  return doc.save();
}

// Large print is the one niche every KDP guide names as the actual keyword-
// and-click driver on the thumbnail — a shopper scanning a grid of covers
// needs to see it without opening the listing. A plain corner medallion,
// the same convention as an "AS SEEN ON TV" or bestseller sticker, drawn on
// top of the front panel's background field so it reads at thumbnail size.
const LARGE_PRINT_INK = rgb(0.62, 0.15, 0.18);
function drawLargePrintBadge(page, g, bold, card) {
  const r = Math.min(g.panelW, g.panelH) * 0.105;
  // On the puzzle card's top-right corner, clear of the title, and inside the
  // trim with the same 18pt the title keeps.
  // Tucked into the card's top-right corner: over the puzzle's corner, clear
  // of the subtitle above it.
  const cx = Math.min(card ? card.x + card.side - r * 0.55 : g.frontX + g.panelW - r - 22, g.frontX + g.panelW - r - 18);
  const cy = card ? card.top - r * 0.55 : g.panelY + g.panelH - r - 22;
  if (r < 30 || cx - r < g.frontX) return; // too small a trim for this to read
  page.drawCircle({ x: cx, y: cy, size: r, color: WHITE, borderWidth: 2, borderColor: LARGE_PRINT_INK });
  page.drawCircle({ x: cx, y: cy, size: r - 5, color: LARGE_PRINT_INK });
  const lines = ["LARGE", "PRINT", "EDITION"];
  const size = Math.max(9, r * 0.19);
  let ty = cy + size * 1.05;
  for (const line of lines) {
    const w = bold.widthOfTextAtSize(line, size);
    page.drawText(line, { x: cx - w / 2, y: ty - size * 0.85, size, font: bold, color: WHITE });
    ty -= size * 1.25;
  }
}

// An unlicensed cover is a real cover of the buyer's own book, marked so it
// cannot be published. Seeing your own title on your own spine is worth more
// than any sample of someone else's book.
function drawCoverWatermark(page, g, bold, regular, noteY = g.panelY + 14) {
  const text = "PREVIEW";
  const angle = Math.PI / 6;
  // Size it so the rotated word fits inside the front panel. Sizing from the
  // panel height overflowed onto the back cover.
  const target = g.panelW * 0.82;
  let size = g.panelH * 0.14;
  while (size > 12 && bold.widthOfTextAtSize(text, size) * Math.cos(angle) > target) size -= 1;
  const cx = g.frontX + g.panelW / 2;
  const cy = g.panelY + g.panelH / 2;
  const w = bold.widthOfTextAtSize(text, size);
  page.drawText(text, {
    x: cx - (w / 2) * Math.cos(angle),
    y: cy - (w / 2) * Math.sin(angle),
    size,
    font: bold,
    color: rgb(0.85, 0.3, 0.3),
    opacity: 0.45,
    rotate: { type: "degrees", angle: 30 },
  });
  // White over it, so the word reads on the red palettes as well as the card.
  page.drawText(text, {
    x: cx - (w / 2) * Math.cos(angle) + 2,
    y: cy - (w / 2) * Math.sin(angle) + 2,
    size,
    font: bold,
    color: WHITE,
    opacity: 0.4,
    rotate: { type: "degrees", angle: 30 },
  });
  const note = "Made with Puzzle Press — unlock to remove this mark";
  const ns = 11;
  const nw = regular.widthOfTextAtSize(note, ns);
  page.drawRectangle({
    x: g.frontX + (g.panelW - nw) / 2 - 10,
    y: noteY,
    width: nw + 20,
    height: ns + 12,
    color: WHITE,
    opacity: 0.9,
  });
  page.drawText(note, {
    x: g.frontX + (g.panelW - nw) / 2,
    y: noteY + 6,
    size: ns,
    font: regular,
    color: rgb(0.7, 0.2, 0.2),
  });
}

// A faint field across the whole wrap that says what kind of book this is
// without a single stock image, and prints cleanly in black and white:
// letters for a word search, digits for sudoku, a maze-like lattice for mazes.
// A sudoku cover covered in random letters reads as a word search.
function drawField(page, g, font, seed, kind, pal) {
  const FAINT = pal.tintC;
  const rng = makeRng(`${seed}|field`);
  const spineFrom = g.spineX - 4;
  const spineTo = g.spineX + g.spine + 4;
  if (kind === "maze") {
    // Short wall segments on a grid, like a maze seen from far away.
    const cell = 18;
    for (let y = cell; y < g.height; y += cell) {
      for (let x = 0; x < g.width; x += cell) {
        if (x > spineFrom - cell && x < spineTo) continue;
        if (rng.next() < 0.5) {
          const vertical = rng.next() < 0.5;
          page.drawLine({
            start: { x, y },
            end: vertical ? { x, y: y - cell } : { x: x + cell, y },
            thickness: 0.6,
            color: FAINT,
          });
        }
      }
    }
    return;
  }
  const size = 12;
  const step = 24;
  for (let y = g.height - step; y > 0; y -= step) {
    for (let x = 6; x < g.width; x += step) {
      if (x > spineFrom && x < spineTo) continue; // keep the spine clean
      const ch = kind === "sudoku" ? String(1 + rng.int(9)) : String.fromCharCode(65 + rng.int(26));
      page.drawText(ch, { x, y, size, font, color: FAINT });
    }
  }
}

function fitSize(font, text, maxWidth, start, min) {
  let s = start;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
  return s;
}

function wrap(font, text, maxWidth, size) {
  const out = [];
  let cur = "";
  for (const w of String(text).split(/\s+/).filter(Boolean)) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
      out.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

function centered(page, text, { cx, y, size, font, color }) {
  page.drawText(text, { x: cx - font.widthOfTextAtSize(text, size) / 2, y, size, font, color });
}

// The front, top to bottom: the title as big as the panel allows, the
// subtitle, one of the book's own puzzles on a white card with an answer
// marked (the thing a thumbnail has to say is "this is a puzzle book"), and a
// strip with what a buyer scans for: how many, large print, solutions.
function drawFront(page, g, { title, subtitle, author, puzzleCount, samplePuzzle, largePrint, pal, regular, bold }) {
  const inset = 30;
  const w = g.panelW - inset * 2;
  const cx = g.frontX + g.panelW / 2;
  const top = g.panelY + g.panelH - 30;

  // Bottom up: author, strip, then the card fills what the title leaves.
  const as = author ? fitSize(bold, author.toUpperCase(), w, 14, 9) : 0;
  const authorLines = author ? wrap(bold, author.toUpperCase(), w, as) : [];
  const authorH = authorLines.length ? 20 + authorLines.length * as * 1.2 : 12;
  const facts = [puzzleCount ? `${puzzleCount} PUZZLES` : "", largePrint ? "LARGE PRINT" : "", "SOLUTIONS INCLUDED"].filter(Boolean).join("   \u2022   ");
  const fs = fitSize(bold, facts, g.panelW - 40, 13, 7);
  const stripH = fs * 2.3;
  const stripY = g.panelY + authorH;

  // Title: as large as fits in 32% of the panel, never a word broken.
  const maxTitleH = g.panelH * 0.32;
  const longest = title.toUpperCase().split(/\s+/).sort((x, y) => y.length - x.length)[0] || title;
  let size = Math.min(g.panelW * 0.16, fitSize(bold, longest, w, 72, 14));
  let lines;
  for (;;) {
    lines = wrap(bold, title.toUpperCase(), w, size);
    if (lines.length * size * 1.02 <= maxTitleH || size <= 14) break;
    size -= 1;
  }
  let ty = top - size * 0.78;
  for (const line of lines) {
    centered(page, line, { cx, y: ty, size, font: bold, color: WHITE });
    ty -= size * 1.02;
  }
  if (subtitle) {
    const ss = fitSize(regular, subtitle, w, 14, 9);
    ty -= 2;
    for (const line of wrap(regular, subtitle, w, ss)) {
      centered(page, line, { cx, y: ty, size: ss, font: regular, color: pal.softC });
      ty -= ss * 1.3;
    }
  }

  // The card.
  const pad = 8;
  const room = ty - 6 - (stripY + stripH + 18);
  const side = Math.min(g.panelW * 0.8, room - pad * 2);
  let card = null;
  if (samplePuzzle && side > 70) {
    const x = cx - side / 2;
    const cardTop = ty - 6 - pad - Math.max(0, (room - pad * 2 - side) / 2);
    page.drawRectangle({ x: x - pad + 7, y: cardTop - side - pad - 7, width: side + pad * 2, height: side + pad * 2, color: pal.deepC, opacity: 0.55 });
    page.drawRectangle({ x: x - pad, y: cardTop - side - pad, width: side + pad * 2, height: side + pad * 2, color: WHITE });
    drawHero(page, samplePuzzle, { x, top: cardTop, side, font: regular, bold, pal });
    card = { x: x - pad, top: cardTop + pad, side: side + pad * 2 };
  }

  // The strip runs from the spine fold out through the bleed.
  page.drawRectangle({ x: g.frontX, y: stripY, width: g.width - g.frontX, height: stripH, color: pal.accentC });
  centered(page, facts, { cx, y: stripY + (stripH - fs * 0.72) / 2, size: fs, font: bold, color: pal.deepC });

  authorLines.forEach((line, i) => {
    centered(page, line, { cx, y: g.panelY + 14 + (authorLines.length - 1 - i) * as * 1.2, size: as, font: bold, color: WHITE });
  });
  return { card, noteY: stripY + stripH / 2 - 11.5 };
}

// The front's puzzle, drawn to be read at thumbnail size: dark ink, and an
// answer marked the way a solver would mark it.
function drawHero(page, p, { x, top, side, font, bold, pal }) {
  const ink = pal.deepC;
  if (p.kind === "sudoku") {
    const n = Math.round(Math.sqrt(p.puzzle.length));
    const boxR = n === 9 ? 3 : 2, boxC = n === 4 ? 2 : 3;
    const cell = side / n;
    // A few cells "pencilled in" in the accent, the rest as printed.
    const filled = new Set(p.puzzle.map((v, i) => (v ? -1 : i)).filter((i) => i >= 0).slice(0, Math.ceil(n * 0.8)));
    filled.forEach((i) => page.drawRectangle({ x: x + (i % n) * cell, y: top - (Math.floor(i / n) + 1) * cell, width: cell, height: cell, color: pal.accentC, opacity: 0.55 }));
    const size = cell * 0.6;
    p.puzzle.forEach((v, i) => {
      const d = v || (filled.has(i) ? p.solution[i] : 0);
      if (!d) return;
      const t = String(d), f = v ? bold : font;
      page.drawText(t, { x: x + (i % n) * cell + (cell - f.widthOfTextAtSize(t, size)) / 2, y: top - (Math.floor(i / n) + 1) * cell + cell * 0.29, size, font: f, color: ink });
    });
    for (let k = 0; k <= n; k++) {
      const t = k % boxC === 0 ? 1.6 : 0.5, u = k % boxR === 0 ? 1.6 : 0.5;
      page.drawLine({ start: { x: x + k * cell, y: top }, end: { x: x + k * cell, y: top - side }, thickness: t, color: ink });
      page.drawLine({ start: { x, y: top - k * cell }, end: { x: x + side, y: top - k * cell }, thickness: u, color: ink });
    }
    return;
  }
  if (p.kind === "maze") {
    const cell = side / Math.max(p.w, p.h);
    const at = (i) => ({ x: x + ((i % p.w) + 0.5) * cell, y: top - (Math.floor(i / p.w) + 0.5) * cell });
    // The first stretch of the route drawn in, as if someone has started it.
    const route = (p.solution || []).slice(0, Math.ceil((p.solution || []).length * 0.45));
    for (let i = 1; i < route.length; i++) page.drawLine({ start: at(route[i - 1]), end: at(route[i]), thickness: cell * 0.42, color: pal.accentC, lineCap: 1 });
    for (const seg of wallSegments(p)) {
      page.drawLine({ start: { x: x + seg.x1 * cell, y: top - seg.y1 * cell }, end: { x: x + seg.x2 * cell, y: top - seg.y2 * cell }, thickness: Math.max(0.8, cell * 0.09), color: ink, lineCap: 2 });
    }
    return;
  }
  if (p.kind === "crisscross" || p.kind === "crossword") {
    const n = Math.max(p.w, p.h);
    const cell = side / n;
    const ox = x + (side - cell * p.w) / 2, oy = top - (side - cell * p.h) / 2;
    for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
      if (!p.cells[r][c]) continue;
      page.drawRectangle({ x: ox + c * cell, y: oy - (r + 1) * cell, width: cell, height: cell, borderWidth: Math.max(0.6, cell * 0.05), borderColor: ink, color: WHITE });
    }
    // One word filled in, in the accent, the rest left for the solver.
    const word = (p.placements || p.entries || p.words || []).find((e) => e && e.word && e.row !== undefined) || null;
    if (word) {
      const [dr, dc] = word.dir === "down" || word.dr === 1 ? [1, 0] : [0, 1];
      for (let k = 0; k < word.word.length; k++) {
        const r = word.row + dr * k, c = word.col + dc * k;
        page.drawRectangle({ x: ox + c * cell, y: oy - (r + 1) * cell, width: cell, height: cell, color: pal.accentC, borderWidth: Math.max(0.6, cell * 0.05), borderColor: ink });
        const ch = p.cells[r][c], s2 = cell * 0.62;
        page.drawText(ch, { x: ox + c * cell + (cell - bold.widthOfTextAtSize(ch, s2)) / 2, y: oy - (r + 1) * cell + cell * 0.27, size: s2, font: bold, color: ink });
      }
    }
    return;
  }
  // Word search: the longest few answers ringed, as a solver would.
  const n = p.size, cell = side / n;
  const marks = [...(p.placements || [])].sort((a, b) => b.word.length - a.word.length).slice(0, 3);
  for (const m of marks) {
    const end = m.word.length - 1;
    page.drawLine({
      start: { x: x + (m.col + 0.5) * cell, y: top - (m.row + 0.5) * cell },
      end: { x: x + (m.col + m.dc * end + 0.5) * cell, y: top - (m.row + m.dr * end + 0.5) * cell },
      thickness: cell * 0.78, color: pal.accentC, lineCap: 1, opacity: 0.85,
    });
  }
  const size = cell * 0.62;
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
    const ch = p.grid[r][c];
    page.drawText(ch, { x: x + c * cell + (cell - bold.widthOfTextAtSize(ch, size)) / 2, y: top - (r + 1) * cell + cell * 0.28, size, font: bold, color: ink });
  }
}

function drawSpine(page, g, { title, author, regular, bold, pal }) {
  // KDP allows spine text from 79 pages, but the type must stay 0.0625" inside
  // each fold, and ours stays a further 1/64" in (cover-geometry.js), so the
  // spine stays blank until 6pt fits.
  // A title too long for the spine drops the author, then goes blank rather
  // than run off the ends.
  if (!g.spineTextFits) return;
  const across = (g.spine - 2 * SPINE_TEXT_IN * 72) / bold.heightAtSize(1);
  const maxLen = g.panelH - 72;
  for (const text of author ? [`${title}   ·   ${author}`, title] : [title]) {
    const s = Math.min(14, across, maxLen / bold.widthOfTextAtSize(text, 1));
    if (s < SPINE_TYPE_MIN_PT) continue;
    // Rotated 90° so it reads bottom-to-top, the usual orientation. The
    // baseline sits so the ascender-to-descender box is centred on the spine.
    // Liberation Sans Bold: descender 0.212 em of the 1.117 em box.
    page.drawText(text, {
      x: g.spineX + g.spine / 2 + bold.heightAtSize(s) / 2 - 0.212 * s,
      y: g.panelY + (g.panelH - bold.widthOfTextAtSize(text, s)) / 2,
      size: s,
      font: bold,
      color: WHITE,
      rotate: { type: "degrees", angle: 90 },
    });
    return;
  }
  void regular; void pal;
}

function drawBack(page, g, { title, blurb, puzzleCount, samplePuzzle, regular, bold }) {
  const inset = 40;
  const x = g.backX + inset;
  const w = g.panelW - inset * 2;
  const top = g.panelY + g.panelH - 56;

  const heading = puzzleCount ? `${puzzleCount} puzzles inside` : "Puzzles inside";
  const text = blurb || defaultBlurb(puzzleCount, samplePuzzle && samplePuzzle.kind);
  const lines = wrap(regular, text, w, 11);
  const panelTop = top + 26;
  const panelH = 26 + 22 + lines.length * 15 + 18;
  page.drawRectangle({
    x: g.backX + 20, y: panelTop - panelH, width: g.panelW - 40, height: panelH,
    color: WHITE, borderWidth: 0.6, borderColor: FAINT,
  });

  page.drawText(heading, { x, y: top, size: 17, font: bold, color: INK });
  let y = top - 26;
  for (const line of lines) {
    page.drawText(line, { x, y, size: 11, font: regular, color: MUTED });
    y -= 15;
  }
  y -= 12;

  // A small real grid, so the back cover shows what is actually inside.
  if (samplePuzzle) {
    const side = Math.min(w, y - (g.panelY + BARCODE_IN.h * PT + BARCODE_IN.margin * PT + 40));
    if (side > 90) {
      const cap = "A puzzle from inside";
      page.drawText(cap, {
        x: g.backX + (g.panelW - regular.widthOfTextAtSize(cap, 9)) / 2,
        y: y - 2, size: 9, font: regular, color: MUTED,
      });
      drawMiniGrid(page, samplePuzzle, {
        x: g.backX + (g.panelW - side) / 2,
        top: y - 16,
        side,
        font: regular,
      });
    }
  }

  // Keep the barcode area clear and white.
  page.drawRectangle({
    x: g.backX + g.panelW - (BARCODE_IN.w + BARCODE_IN.margin) * PT,
    y: g.panelY + BARCODE_IN.margin * PT,
    width: BARCODE_IN.w * PT,
    height: BARCODE_IN.h * PT,
    color: WHITE,
  });
  void title;
}

function drawMiniSudoku(page, puzzle, { x, top, side, font }) {
  const n = Math.round(Math.sqrt(puzzle.puzzle.length));
  const boxR = n === 9 ? 3 : 2, boxC = n === 4 ? 2 : 3;
  const cell = side / n;
  page.drawRectangle({ x, y: top - side, width: side, height: side, color: WHITE, borderWidth: 0.6, borderColor: FAINT });
  const size = cell * 0.62;
  puzzle.puzzle.forEach((v, i) => {
    if (!v) return;
    const r = Math.floor(i / n);
    const c = i % n;
    const w = font.widthOfTextAtSize(String(v), size);
    page.drawText(String(v), { x: x + c * cell + (cell - w) / 2, y: top - (r + 1) * cell + cell * 0.3, size, font, color: MUTED });
  });
  for (let k = 0; k <= n; k += boxC) page.drawLine({ start: { x: x + k * cell, y: top }, end: { x: x + k * cell, y: top - side }, thickness: 0.5, color: FAINT });
  for (let k = 0; k <= n; k += boxR) page.drawLine({ start: { x, y: top - k * cell }, end: { x: x + side, y: top - k * cell }, thickness: 0.5, color: FAINT });
}

function drawMiniMaze(page, maze, { x, top, side }) {
  page.drawRectangle({ x, y: top - side, width: side, height: side, color: WHITE });
  const cell = side / Math.max(maze.w, maze.h);
  for (const seg of wallSegments(maze)) {
    page.drawLine({
      start: { x: x + seg.x1 * cell, y: top - seg.y1 * cell },
      end: { x: x + seg.x2 * cell, y: top - seg.y2 * cell },
      thickness: 0.45,
      color: MUTED,
    });
  }
}

function defaultBlurb(n, kind) {
  if (kind === "maze") {
    return (
      `A collection of ${n ? n + " " : ""}mazes with full solutions at the back. ` +
      "Every maze has exactly one route from start to finish, and the paths are printed wide enough to follow with a pen. " +
      "Perfect for quiet evenings, waiting rooms and long journeys."
    );
  }
  if (kind === "crossword") {
    return (
      `A collection of ${n ? n + " " : ""}themed crosswords with full solutions at the back. ` +
      "Every answer is clued in plain language — no obscure trivia — and the grids are printed large enough to pencil in. " +
      "Perfect for quiet evenings, waiting rooms and long journeys."
    );
  }
  if (kind === "crisscross") {
    return (
      `A collection of ${n ? n + " " : ""}criss-cross fill-in puzzles with full solutions at the back. ` +
      "Fit every word from the list into the grid by its length and the letters where it crosses — every puzzle has exactly one way in. " +
      "Perfect for quiet evenings, waiting rooms and long journeys."
    );
  }
  if (kind === "sudoku") {
    return (
      `A collection of ${n ? n + " " : ""}sudoku puzzles with full solutions at the back. ` +
      "Every puzzle has one answer and one answer only, and the grids are printed large enough to pencil in. " +
      "Perfect for quiet evenings, waiting rooms and long journeys."
    );
  }
  return defaultWordBlurb(n);
}

function defaultWordBlurb(n) {
  return (
    `A collection of ${n ? n + " " : ""}word search puzzles with solutions at the back. ` +
    "Every puzzle has its own word list, every answer appears exactly once, and the grids are printed large enough to be a pleasure rather than a squint. " +
    "Perfect for quiet evenings, waiting rooms and long journeys."
  );
}

function drawMiniGrid(page, puzzle, { x, top, side, font }) {
  if (puzzle.kind === "sudoku") return drawMiniSudoku(page, puzzle, { x, top, side, font });
  if (puzzle.kind === "maze") return drawMiniMaze(page, puzzle, { x, top, side });
  if (puzzle.kind === "crisscross" || puzzle.kind === "crossword") return drawMiniCrissCross(page, puzzle, { x, top, side, font });
  const n = puzzle.size;
  const cell = side / n;
  const size = cell * 0.66;
  page.drawRectangle({ x, y: top - side, width: side, height: side, color: WHITE, borderWidth: 0.6, borderColor: FAINT });
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const ch = puzzle.grid[r][c];
      const w = font.widthOfTextAtSize(ch, size);
      page.drawText(ch, {
        x: x + c * cell + (cell - w) / 2,
        y: top - (r + 1) * cell + cell * 0.28,
        size,
        font,
        color: MUTED,
      });
    }
  }
}

// A criss-cross on the cover: the white cells of the grid, letters filled, on
// a faint frame — the shape says what the book is.
function drawMiniCrissCross(page, puzzle, { x, top, side, font }) {
  const n = Math.max(puzzle.w, puzzle.h);
  const cell = side / n;
  const ox = x + (side - cell * puzzle.w) / 2;
  const oy = top - (side - cell * puzzle.h) / 2;
  page.drawRectangle({ x, y: top - side, width: side, height: side, color: WHITE, borderWidth: 0.6, borderColor: FAINT });
  for (let r = 0; r < puzzle.h; r++) {
    for (let c = 0; c < puzzle.w; c++) {
      const ch = puzzle.cells[r][c];
      if (!ch) continue;
      page.drawRectangle({ x: ox + c * cell, y: oy - (r + 1) * cell, width: cell, height: cell, borderWidth: 0.4, borderColor: MUTED, color: WHITE });
      const size = cell * 0.62;
      const w = font.widthOfTextAtSize(ch, size);
      page.drawText(ch, { x: ox + c * cell + (cell - w) / 2, y: oy - (r + 1) * cell + cell * 0.27, size, font, color: MUTED });
    }
  }
}
