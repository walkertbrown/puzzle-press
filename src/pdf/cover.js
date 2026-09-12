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
import { coverGeometry, BARCODE_IN } from "./cover-geometry.js";
import { makeRng } from "../generator/rng.js";
import { wallSegments } from "../generator/maze.js";

export {
  BLEED_IN, SPINE_TEXT_MIN_PAGES, BARCODE_IN, PAPER, spineWidthInches, coverGeometry,
} from "./cover-geometry.js";

const INK = rgb(0.09, 0.16, 0.29);
const PAPER_BG = rgb(0.96, 0.965, 0.975);
const FAINT = rgb(0.90, 0.915, 0.935);
const MUTED = rgb(0.36, 0.42, 0.5);
const WHITE = rgb(1, 1, 1);

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
  page.drawRectangle({ x: 0, y: 0, width: g.width, height: g.height, color: PAPER_BG });

  drawField(page, g, regular, seed, samplePuzzle && samplePuzzle.kind);
  drawFront(page, g, { title, subtitle, author, regular, bold });
  drawSpine(page, g, { title, author, regular, bold });
  drawBack(page, g, { title, blurb, puzzleCount, samplePuzzle, regular, bold });
  if (!licensed) drawCoverWatermark(page, g, bold, regular);

  return doc.save();
}

// An unlicensed cover is a real cover of the buyer's own book, marked so it
// cannot be published. Seeing your own title on your own spine is worth more
// than any sample of someone else's book.
function drawCoverWatermark(page, g, bold, regular) {
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
  const note = "Made with Puzzle Press — unlock to remove this mark";
  const ns = 11;
  const nw = regular.widthOfTextAtSize(note, ns);
  page.drawRectangle({
    x: g.frontX + (g.panelW - nw) / 2 - 10,
    y: g.panelY + 14,
    width: nw + 20,
    height: ns + 12,
    color: WHITE,
    opacity: 0.9,
  });
  page.drawText(note, {
    x: g.frontX + (g.panelW - nw) / 2,
    y: g.panelY + 20,
    size: ns,
    font: regular,
    color: rgb(0.7, 0.2, 0.2),
  });
}

// A faint field across the whole wrap that says what kind of book this is
// without a single stock image, and prints cleanly in black and white:
// letters for a word search, digits for sudoku, a maze-like lattice for mazes.
// A sudoku cover covered in random letters reads as a word search.
function drawField(page, g, font, seed, kind) {
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

function drawFront(page, g, { title, subtitle, author, regular, bold }) {
  const inset = 36;
  const w = g.panelW - inset * 2;
  const cx = g.frontX + g.panelW / 2;

  // Work out the text first, then size the band to fit it. A fixed band left
  // a one-word title floating in a slab of empty navy.
  const size = Math.min(46, fitSize(bold, title.split(/\s+/).sort((a, b) => b.length - a.length)[0] || title, w - 36, 46, 18));
  const lines = wrap(bold, title.toUpperCase(), w - 36, size);
  const ss = subtitle ? fitSize(regular, subtitle, w - 40, 15, 9) : 0;
  const subLines = subtitle ? wrap(regular, subtitle, w - 40, ss) : [];
  const pad = 30;
  const titleH = lines.length * size * 1.1;
  const subH = subLines.length ? 10 + subLines.length * ss * 1.3 : 0;
  const bandH = Math.max(g.panelH * 0.22, pad * 2 + titleH + subH);
  const bandY = g.panelY + g.panelH * 0.68 - bandH / 2;
  page.drawRectangle({ x: g.frontX + 18, y: bandY, width: g.panelW - 36, height: bandH, color: INK });

  let ty = bandY + bandH - pad - size * 0.85;
  for (const line of lines) {
    centered(page, line, { cx, y: ty, size, font: bold, color: WHITE });
    ty -= size * 1.1;
  }
  if (subLines.length) {
    ty -= 4;
    for (const line of subLines) {
      centered(page, line, { cx, y: ty, size: ss, font: regular, color: rgb(0.78, 0.83, 0.9) });
      ty -= ss * 1.3;
    }
  }
  if (author) {
    const as = fitSize(bold, author.toUpperCase(), w, 15, 9);
    centered(page, author.toUpperCase(), { cx, y: g.panelY + 44, size: as, font: bold, color: INK });
  }
}

function drawSpine(page, g, { title, author, regular, bold }) {
  if (!g.spineTextAllowed || g.spine < 12) return;
  const cx = g.spineX + g.spine / 2;
  const size = Math.min(14, Math.max(8, g.spine * 0.5));
  const text = author ? `${title}   ·   ${author}` : title;
  const maxLen = g.panelH - 72;
  const s = fitSize(bold, text, maxLen, size, 7);
  // Rotated 90° so it reads bottom-to-top, the usual orientation.
  page.drawText(text, {
    x: cx + s * 0.36,
    y: g.panelY + (g.panelH - bold.widthOfTextAtSize(text, s)) / 2,
    size: s,
    font: bold,
    color: INK,
    rotate: { type: "degrees", angle: 90 },
  });
  void regular;
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
  const cell = side / 9;
  page.drawRectangle({ x, y: top - side, width: side, height: side, color: WHITE, borderWidth: 0.6, borderColor: FAINT });
  const size = cell * 0.62;
  puzzle.puzzle.forEach((v, i) => {
    if (!v) return;
    const r = Math.floor(i / 9);
    const c = i % 9;
    const w = font.widthOfTextAtSize(String(v), size);
    page.drawText(String(v), { x: x + c * cell + (cell - w) / 2, y: top - (r + 1) * cell + cell * 0.3, size, font, color: MUTED });
  });
  for (let k = 0; k <= 9; k += 3) {
    page.drawLine({ start: { x: x + k * cell, y: top }, end: { x: x + k * cell, y: top - side }, thickness: 0.5, color: FAINT });
    page.drawLine({ start: { x, y: top - k * cell }, end: { x: x + side, y: top - k * cell }, thickness: 0.5, color: FAINT });
  }
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
  if (puzzle.kind === "crisscross") return drawMiniCrissCross(page, puzzle, { x, top, side, font });
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
