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
import { PT, TRIMS } from "./kdp.js";
import { makeRng } from "../generator/rng.js";
import { wallSegments } from "../generator/maze.js";

export const BLEED_IN = 0.125;
export const SPINE_TEXT_MIN_PAGES = 79;
export const BARCODE_IN = { w: 2, h: 1.2, margin: 0.25 };

// Per-page thickness in inches, from KDP.
export const PAPER = {
  white: { label: "Black & white on white paper", thickness: 0.002252 },
  cream: { label: "Black & white on cream paper", thickness: 0.0025 },
  premiumColor: { label: "Premium colour", thickness: 0.002347 },
  standardColor: { label: "Standard colour", thickness: 0.002252 },
};

export function spineWidthInches(pageCount, paper = "cream") {
  const t = (PAPER[paper] ?? PAPER.cream).thickness;
  return pageCount * t;
}

export function coverGeometry({ trim = "6x9", pageCount = 24, paper = "cream" }) {
  const t = TRIMS[trim] ?? TRIMS["6x9"];
  const spineIn = spineWidthInches(pageCount, paper);
  const widthIn = BLEED_IN + t.w + spineIn + t.w + BLEED_IN;
  const heightIn = BLEED_IN + t.h + BLEED_IN;
  return {
    width: widthIn * PT,
    height: heightIn * PT,
    spine: spineIn * PT,
    bleed: BLEED_IN * PT,
    trim: t,
    pageCount,
    paper,
    spineTextAllowed: pageCount >= SPINE_TEXT_MIN_PAGES,
    // x of each panel's left edge, in points
    backX: BLEED_IN * PT,
    spineX: (BLEED_IN + t.w) * PT,
    frontX: (BLEED_IN + t.w + spineIn) * PT,
    panelW: t.w * PT,
    panelH: t.h * PT,
    panelY: BLEED_IN * PT,
  };
}

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

  drawLetterField(page, g, regular, seed);
  drawFront(page, g, { title, subtitle, author, regular, bold });
  drawSpine(page, g, { title, author, regular, bold });
  drawBack(page, g, { title, blurb, puzzleCount, samplePuzzle, regular, bold });

  return doc.save();
}

// A faint field of letters across the whole wrap — says "word search" without
// a single stock image, and prints cleanly in black and white.
function drawLetterField(page, g, font, seed) {
  const rng = makeRng(`${seed}|field`);
  const size = 12;
  const step = 24;
  const spineFrom = g.spineX - 4;
  const spineTo = g.spineX + g.spine + 4;
  for (let y = g.height - step; y > 0; y -= step) {
    for (let x = 6; x < g.width; x += step) {
      if (x > spineFrom && x < spineTo) continue; // keep the spine clean
      const ch = String.fromCharCode(65 + rng.int(26));
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

  // A solid band behind the title so the letter field never fights the text.
  const bandH = g.panelH * 0.42;
  const bandY = g.panelY + g.panelH * 0.46;
  page.drawRectangle({ x: g.frontX + 18, y: bandY, width: g.panelW - 36, height: bandH, color: INK });

  const lines = [];
  let size = Math.min(46, fitSize(bold, title.split(/\s+/).sort((a, b) => b.length - a.length)[0] || title, w - 36, 46, 18));
  for (const line of wrap(bold, title.toUpperCase(), w - 36, size)) lines.push(line);
  let ty = bandY + bandH - size * 1.15;
  for (const line of lines) {
    centered(page, line, { cx, y: ty, size, font: bold, color: WHITE });
    ty -= size * 1.1;
  }
  if (subtitle) {
    const ss = fitSize(regular, subtitle, w - 40, 15, 9);
    ty -= 6;
    for (const line of wrap(regular, subtitle, w - 40, ss)) {
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
