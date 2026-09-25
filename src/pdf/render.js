// Render a generated book to a KDP-ready PDF with pdf-lib.
//
// renderBook(book, { title, subtitle, author, trim, bleed, licensed, fonts })
//   -> Uint8Array (PDF bytes)
//
// Page order: title, copyright, puzzles (one per page, starting on a
// right-hand page), "Solutions" divider on a right-hand page, solutions
// 4-up, then four ruled "Notes" pages, plus one more if the count would
// otherwise be odd. Page numbers sit on the outside bottom corner.
//
// The Notes pages are NOT padding to KDP's 24-page minimum — this comment said
// they were, and they stopped being that when layout.js changed to a fixed
// NOTES_PAGES. A one-puzzle book comes out at 10 pages and stays there. What
// reaches the minimum is the warning in the UI, which refuses to be quiet
// below 24 pages and names how many puzzles would fix it. Support answers the
// "KDP says fewer than 24 pages" email on that basis, so the two have to agree.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { pageGeometry, marginsForPage, MIN_PAGES } from "./kdp.js";
import { planPages, solutionsThatFit, solutionsPerPageFor } from "./layout.js";

export { planPages, solutionsThatFit, solutionsPerPageFor, puzzlesForMinimum, MAX_FILLER } from "./layout.js";
import { wallSegments } from "../generator/maze.js";

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.45, 0.45, 0.45);
const SHADE = rgb(0.82, 0.82, 0.82);
// The address is in the line because a free book can reach Amazon, where Look
// Inside shows interior pages. A mark that names the tool but not where to find
// it is an advert with no phone number. Text only, no link annotation: KDP
// interiors should carry none.
const WATERMARK = "Made with Puzzle Press, free preview — puzzlepress.bananafest-destiny.com";

export async function renderBook(book, opts = {}) {
  const {
    title = "Word Search",
    subtitle = "",
    author = "",
    trim = "6x9",
    bleed = false,
    licensed = false,
    fonts = null, // { regular: Uint8Array, bold: Uint8Array } — required for embedding
    // Optional: awaited every few pages so a browser tab stays responsive and
    // can report progress. A 200-puzzle book is ~10 s of drawing on a laptop
    // and several times that on a phone; without this the tab simply freezes
    // and the browser offers to kill the page. Node callers pass nothing and
    // nothing changes for them.
    onProgress = null,
  } = opts;

  const puzzles = book.puzzles;
  const solutionsPerPage =
    opts.solutionsPerPage ?? solutionsPerPageFor(puzzles.length, solutionsThatFit(pageGeometry({ trim, bleed }), opts.largePrint));
  const plan = planPages(puzzles.length, solutionsPerPage);
  const geom = pageGeometry({ trim, bleed, pageCount: plan.total });

  const doc = await PDFDocument.create();
  doc.setTitle(title);
  if (author) doc.setAuthor(author);
  doc.setProducer("Puzzle Press");
  doc.setCreator("Puzzle Press");
  // The settings that made this file, in its properties: invisible in print,
  // and there for anyone who still has the PDF and wants it again. Kept on
  // paid books too — metadata is not a mark on the page.
  if (opts.recipe) doc.setSubject(opts.recipe);

  let regular, bold;
  if (fonts) {
    doc.registerFontkit(fontkit);
    regular = await doc.embedFont(fonts.regular, { subset: true });
    bold = await doc.embedFont(fonts.bold, { subset: true });
  } else {
    // Standard fonts are not embedded; KDP will warn. Fine for tests only.
    regular = await doc.embedFont(StandardFonts.Helvetica);
    bold = await doc.embedFont(StandardFonts.HelveticaBold);
  }
  const F = { regular, bold };

  const ctx = { doc, geom, F, licensed, largePrint: Boolean(opts.largePrint), pageNo: 0 };

  // 1–2: title + copyright
  drawTitlePage(ctx, { title, subtitle, author });
  // A paid book carries no marks at all, so the recipe is printed only on a
  // free one — where a watermark already says where it came from, and the
  // book cannot be published as it stands anyway.
  drawCopyrightPage(ctx, { title, author, recipe: licensed ? null : opts.recipe ?? null });

  // Every eighth page: often enough that a phone never looks hung, rare
  // enough that the yields cost nothing measurable.
  const BREATHE_EVERY = 8;
  const breathe = async () => {
    if (!onProgress || ctx.pageNo % BREATHE_EVERY) return;
    await onProgress(ctx.pageNo, plan.total);
  };

  // Puzzles
  for (const p of puzzles) {
    drawPuzzlePage(ctx, p);
    await breathe();
  }

  drawDividerPage(ctx, "Solutions");
  for (let i = 0; i < puzzles.length; i += solutionsPerPage) {
    drawSolutionsPage(ctx, puzzles.slice(i, i + solutionsPerPage), solutionsPerPage);
    await breathe();
  }

  // The ruled pages at the back are part of the book, and planPages already
  // worked out how many (four, plus one more if the count would be odd).
  while (ctx.pageNo < plan.total) drawNotesPage(ctx);

  return doc.save();
}



// ---------- page helpers ----------

function newPage(ctx) {
  ctx.pageNo += 1;
  const page = ctx.doc.addPage([ctx.geom.width, ctx.geom.height]);
  const m = marginsForPage(ctx.geom, ctx.pageNo);
  const box = {
    x: m.left,
    y: m.bottom,
    w: ctx.geom.width - m.left - m.right,
    h: ctx.geom.height - m.top - m.bottom,
    rightHand: m.rightHand,
  };
  return { page, box };
}

function footer(ctx, page, box, { number = true } = {}) {
  const size = 9;
  const y = box.y + 2;
  if (number) {
    const text = String(ctx.pageNo);
    const w = ctx.F.regular.widthOfTextAtSize(text, size);
    const x = box.rightHand ? box.x + box.w - w : box.x;
    page.drawText(text, { x, y, size, font: ctx.F.regular, color: GREY });
  }
  if (!ctx.licensed) {
    let s = 7;
    while (s > 5 && ctx.F.regular.widthOfTextAtSize(WATERMARK, s) > box.w) s -= 0.25;
    const w = ctx.F.regular.widthOfTextAtSize(WATERMARK, s);
    page.drawText(WATERMARK, { x: box.x + (box.w - w) / 2, y: y + 12, size: s, font: ctx.F.regular, color: GREY });
  }
}

function centered(page, text, { x, w, y, size, font, color = BLACK }) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x + (w - tw) / 2, y, size, font, color });
}

// "Puzzle 12" on the left, the list's name in grey on the right. The name can
// be the buyer's own (up to 60 characters), which at 12pt runs past the
// "Puzzle 12" and out through the left margin on every trim; it shrinks to
// fit the space beside the number, and is cut short only past 8pt.
function puzzleHeader(page, F, box, index, sub, headSize, subMax = 12) {
  const head = `Puzzle ${index}`;
  page.drawText(head, { x: box.x, y: box.y + box.h - headSize, size: headSize, font: F.bold });
  const room = box.w - F.bold.widthOfTextAtSize(head, headSize) - 12;
  const size = fitSize(F.regular, sub, room, subMax, 8);
  let text = sub;
  while (text.length > 1 && F.regular.widthOfTextAtSize(text, size) > room) text = `${text.slice(0, -2).trimEnd()}…`;
  const w = F.regular.widthOfTextAtSize(text, size);
  page.drawText(text, { x: box.x + box.w - w, y: box.y + box.h - headSize + 3, size, font: F.regular, color: GREY });
}

// Shrink a font size until the text fits a width.
function fitSize(font, text, maxWidth, start, min = 8) {
  let s = start;
  while (s > min && font.widthOfTextAtSize(text, s) > maxWidth) s -= 1;
  return s;
}

function drawTitlePage(ctx, { title, subtitle, author }) {
  const { page, box } = newPage(ctx);
  const size = fitSize(ctx.F.bold, title, box.w, 36, 18);
  const lines = wrap(ctx.F.bold, title, box.w, size);
  let y = box.y + box.h * 0.62;
  for (const line of lines) {
    centered(page, line, { x: box.x, w: box.w, y, size, font: ctx.F.bold });
    y -= size * 1.2;
  }
  if (subtitle) {
    const ss = fitSize(ctx.F.regular, subtitle, box.w, 16, 10);
    for (const line of wrap(ctx.F.regular, subtitle, box.w, ss)) {
      y -= ss * 0.4;
      centered(page, line, { x: box.x, w: box.w, y, size: ss, font: ctx.F.regular, color: GREY });
      y -= ss * 1.2;
    }
  }
  // Shrinks to 10pt, then wraps: an 80-character author ran past the margin.
  if (author) {
    const as = fitSize(ctx.F.regular, author, box.w, ctx.largePrint ? 16 : 14, 10);
    wrap(ctx.F.regular, author, box.w, as).forEach((line, i) => {
      centered(page, line, { x: box.x, w: box.w, y: box.y + box.h * 0.2 - i * as * 1.2, size: as, font: ctx.F.regular });
    });
  }
  footer(ctx, page, box, { number: false });
}

function drawCopyrightPage(ctx, { title, author, recipe = null }) {
  const { page, box } = newPage(ctx);
  const year = new Date().getFullYear();
  const lines = [
    `${title}`,
    author ? `Copyright © ${year} ${author}` : `Copyright © ${year}`,
    "All rights reserved.",
    "",
    "No part of this book may be reproduced in any form",
    "without written permission from the author.",
  ];
  // Each line wraps to the text box: a long title ran off both edges of the
  // page on 7x10 (found by test:ink with the longest title, 2026-09-24).
  let y = box.y + 80;
  for (const line of lines.flatMap((l) => (l ? wrap(ctx.F.regular, l, box.w, 9) : [""])).reverse()) {
    if (line) centered(page, line, { x: box.x, w: box.w, y, size: 9, font: ctx.F.regular, color: GREY });
    y += 13;
  }
  // The settings that made this book, printed small at the foot of the page.
  // The site promises you can regenerate a book from its seed — but if you
  // lose the file you have lost the seed too, unless the book carries it.
  // Now it does, so a printed copy is enough to make the file again.
  if (recipe) {
    const rl = wrap(ctx.F.regular, recipe, box.w, 6.5);
    rl.forEach((line, i) => {
      centered(page, line, { x: box.x, w: box.w, y: box.y + 34 + (rl.length - 1 - i) * 8, size: 6.5, font: ctx.F.regular, color: GREY });
    });
  }
  void 0;
  footer(ctx, page, box, { number: false });
}

function drawBlankPage(ctx) {
  const { page, box } = newPage(ctx);
  footer(ctx, page, box, { number: false });
}

function drawNotesPage(ctx) {
  const { page, box } = newPage(ctx);
  page.drawText("Notes", { x: box.x, y: box.y + box.h - 18, size: 16, font: ctx.F.bold });
  const gap = 24;
  for (let y = box.y + box.h - 48; y > box.y + 24; y -= gap) {
    page.drawLine({ start: { x: box.x, y }, end: { x: box.x + box.w, y }, thickness: 0.5, color: SHADE });
  }
  footer(ctx, page, box);
}

function drawDividerPage(ctx, text) {
  const { page, box } = newPage(ctx);
  centered(page, text, { x: box.x, w: box.w, y: box.y + box.h / 2, size: 32, font: ctx.F.bold });
  footer(ctx, page, box);
}

function drawPuzzlePage(ctx, puzzle) {
  if (puzzle.kind === "sudoku") return drawSudokuPage(ctx, puzzle);
  if (puzzle.kind === "maze") return drawMazePage(ctx, puzzle);
  if (puzzle.kind === "crisscross") return drawCrissCrossPage(ctx, puzzle);
  if (puzzle.kind === "crossword") return drawCrosswordPage(ctx, puzzle);
  const { page, box } = newPage(ctx);
  const F = ctx.F;

  // Header
  const headSize = 20;
  puzzleHeader(page, F, box, puzzle.index, puzzle.title, headSize, ctx.largePrint ? 16 : 12);

  // Word bank size decides how much height the grid can have.
  const words = puzzle.words;
  // The word bank has to be readable by whoever the grid is readable to — on a
  // large-print book, a 13pt bank under ~22pt grid letters looks like fine
  // print. (That 22 is a measured median, not a fixed size: letterSize below is
  // derived from the grid side, so it moves with the word list. Anything quoting
  // it in public copy has to say so — see the note in src/ui/main.js.)
  const bankSize = Math.max(10, Math.min(17, Math.round(box.w / 34)));
  const cols = bankColumns(F.regular, words, box.w, bankSize);
  const rows = Math.ceil(words.length / cols);
  const bankLine = bankSize * 1.45;
  const bankH = rows * bankLine + 18;

  const topY = box.y + box.h - headSize - 16;
  const gridAvailH = topY - (box.y + 28) - bankH;
  // Keep a clear gap inside the safe box so the grid frame (a 0.75pt stroke)
  // never lands on the KDP margin line. Sizing to the full box.w put the frame
  // exactly on the line, which KDP's previewer flags as "outside the margins"
  // (worst on verso pages, where that edge is the tighter 0.375" gutter).
  const GRID_SAFE = 9;
  const gridSide = Math.min(box.w - 2 * GRID_SAFE, gridAvailH);
  const gridX = box.x + (box.w - gridSide) / 2;
  const gridTop = topY;
  drawGrid(page, F, puzzle, { x: gridX, top: gridTop, side: gridSide, solution: false });

  // Word bank
  const bankTop = gridTop - gridSide - 20;
  const colW = box.w / cols;
  words.forEach((w, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    page.drawText(w, { x: box.x + c * colW, y: bankTop - r * bankLine - bankSize, size: bankSize, font: F.regular });
  });

  footer(ctx, page, box);
}

function bankColumns(font, words, width, size) {
  const longest = Math.max(...words.map((w) => font.widthOfTextAtSize(w, size)), 1) + 14;
  return Math.max(1, Math.min(4, Math.floor(width / longest)));
}

function drawGrid(page, F, puzzle, { x, top, side, solution }) {
  const n = puzzle.size;
  const cell = side / n;
  const letterSize = cell * 0.62;
  const shaded = new Set();
  if (solution) {
    for (const p of puzzle.placements) {
      for (let i = 0; i < p.word.length; i++) shaded.add(`${p.row + p.dr * i},${p.col + p.dc * i}`);
    }
  }
  const font = solution ? F.bold : F.regular;
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cx = x + c * cell;
      const cy = top - (r + 1) * cell;
      const hit = shaded.has(`${r},${c}`);
      if (hit) page.drawRectangle({ x: cx, y: cy, width: cell, height: cell, color: SHADE });
      const ch = puzzle.grid[r][c];
      const w = font.widthOfTextAtSize(ch, letterSize);
      page.drawText(ch, {
        x: cx + (cell - w) / 2,
        y: cy + cell * 0.27,
        size: letterSize,
        font: solution && !hit ? F.regular : font,
        color: solution && !hit ? GREY : BLACK,
      });
    }
  }
  // Thin frame
  page.drawRectangle({ x, y: top - side, width: side, height: side, borderWidth: 0.75, borderColor: BLACK });
}

// ---------- criss-cross ----------

// The grid, the word list grouped by length beneath it. Starter words (given)
// are printed in the grid; everything else is an empty white cell.
function drawCrissCrossPage(ctx, puzzle) {
  const { page, box } = newPage(ctx);
  const F = ctx.F;
  const headSize = 20;
  puzzleHeader(page, F, box, puzzle.index, puzzle.title, headSize, ctx.largePrint ? 16 : 12);

  // Word list grouped by length: "5 letters", then the words. Column count
  // from the longest word, as the word search does.
  const groups = new Map();
  for (const w of puzzle.words) (groups.get(w.length) ?? groups.set(w.length, []).get(w.length)).push(w);
  const lens = [...groups.keys()].sort((a, b) => a - b);
  const bankSize = Math.max(9, Math.min(14, Math.round(box.w / 38)));
  const line = bankSize * 1.4;
  const cols = bankColumns(F.regular, puzzle.words, box.w, bankSize);
  // Lay the list out as a flat sequence of lines: a heading, then its words in columns.
  const lines = []; // { text, bold, col }
  for (const len of lens) {
    lines.push([{ text: `${len} letters`, bold: true }]);
    const ws = groups.get(len);
    for (let i = 0; i < ws.length; i += cols) lines.push(ws.slice(i, i + cols).map((text) => ({ text, bold: false })));
  }
  const bankH = lines.length * line + 16;
  const starter = puzzle.given.length ? `${puzzle.given.join(", ")} is filled in to start you off.` : "";
  const noteH = starter ? bankSize * 1.6 : 0;

  const topY = box.y + box.h - headSize - 16;
  const availH = topY - (box.y + 28) - bankH - noteH;
  const cellSide = Math.min(box.w / puzzle.w, availH / puzzle.h, 30);
  const gw = cellSide * puzzle.w, gh = cellSide * puzzle.h;
  const gx = box.x + (box.w - gw) / 2;
  drawCrissCrossGrid(page, F, puzzle, { x: gx, top: topY, side: gw, solution: false, cell: cellSide });

  let y = topY - gh - 14;
  if (starter) {
    page.drawText(starter, { x: box.x, y: y - bankSize, size: bankSize, font: F.regular, color: GREY });
    y -= noteH;
  }
  const colW = box.w / cols;
  for (const row of lines) {
    row.forEach((item, c) => {
      page.drawText(item.text, { x: box.x + (item.bold ? 0 : c * colW), y: y - bankSize, size: bankSize, font: item.bold ? F.bold : F.regular });
    });
    y -= line;
  }
  footer(ctx, page, box);
}

// White cells with a border; blanks left empty. In the solution every letter
// is printed; in the puzzle only the starter word's letters are.
function drawCrissCrossGrid(page, F, puzzle, { x, top, side, solution, cell = null, numbers = null }) {
  const c = cell ?? side / Math.max(puzzle.w, puzzle.h);
  const givenCells = new Set();
  for (const g of puzzle.given) {
    const p = puzzle.placements.find((q) => q.word === g);
    for (let i = 0; i < g.length; i++) givenCells.add(`${p.row + p.dr * i},${p.col + p.dc * i}`);
  }
  const letterSize = c * 0.6;
  for (let r = 0; r < puzzle.h; r++) {
    for (let k = 0; k < puzzle.w; k++) {
      const ch = puzzle.cells[r][k];
      if (!ch) continue;
      const cx = x + k * c, cy = top - (r + 1) * c;
      page.drawRectangle({ x: cx, y: cy, width: c, height: c, borderWidth: solution ? 0.4 : 0.75, borderColor: BLACK, color: rgb(1, 1, 1) });
      const num = numbers && !solution ? numbers[`${r},${k}`] : null;
      if (num) page.drawText(String(num), { x: cx + c * 0.07, y: cy + c * 0.66, size: Math.max(4, c * 0.3), font: F.regular, color: BLACK });
      const show = solution || givenCells.has(`${r},${k}`);
      if (!show) continue;
      const font = givenCells.has(`${r},${k}`) ? F.bold : F.regular;
      const w = font.widthOfTextAtSize(ch, letterSize);
      page.drawText(ch, { x: cx + (c - w) / 2, y: cy + c * 0.26, size: letterSize, font, color: BLACK });
    }
  }
}

// ---------- crossword ----------

// Numbered grid, then Across and Down clue columns. The clue block is measured
// first (wrapped at the column width) and the grid takes what is left, so a
// 22-clue expert puzzle still fits a 6×9 page.
function drawCrosswordPage(ctx, puzzle) {
  const { page, box } = newPage(ctx);
  const F = ctx.F;
  const headSize = 20;
  puzzleHeader(page, F, box, puzzle.index, puzzle.title, headSize, ctx.largePrint ? 16 : 12);

  // A buyer's own clues have no length limit, so the block can outgrow the
  // page. The type shrinks first (to 6.5pt, still readable in print), and only
  // then is each clue held to fewer lines, the last one cut with an ellipsis —
  // never ink below the margin. Wrapped lines hang indented, so they wrap at
  // the column width less the indent, or the Down column runs off the page.
  const gap = 14;
  const colW = (box.w - gap) / 2;
  const topY = box.y + box.h - headSize - 16;
  const minGrid = Math.min(12, box.w / puzzle.w) * puzzle.h;
  const layout = (clueSize, maxLines) => {
    const indent = clueSize * 1.3;
    const column = (heading, list) => {
      const lines = [{ text: heading, bold: true }];
      for (const e of list) {
        const text = `${e.num}. ${e.clue} (${e.len})`.replace(/\s+/g, " ");
        const first = wrap(F.regular, text, colW - 2, clueSize)[0];
        let rest = wrap(F.regular, text.slice(first.length).trim(), colW - 2 - indent, clueSize).filter(Boolean);
        let wrapped = [first, ...rest];
        if (wrapped.length > maxLines) {
          wrapped = wrapped.slice(0, maxLines);
          let last = wrapped[maxLines - 1];
          const w = maxLines === 1 ? colW - 2 : colW - 2 - indent;
          do last = `${last.replace(/\s*\S*$/, "")}…`; while (last.length > 2 && F.regular.widthOfTextAtSize(last, clueSize) > w);
          wrapped[maxLines - 1] = last;
        }
        wrapped.forEach((t, i) => lines.push({ text: t, bold: false, indent: i > 0 }));
      }
      return lines;
    };
    const left = column("Across", puzzle.across);
    const right = column("Down", puzzle.down);
    const line = clueSize * 1.32;
    const clueH = Math.max(left.length, right.length) * line + 8;
    return { clueSize, indent, line, left, right, availH: topY - (box.y + 28) - clueH - 12 };
  };
  let L = layout(Math.max(8.5, Math.min(11, Math.round(box.w / 42))), Infinity);
  for (let s = L.clueSize - 0.5; L.availH < minGrid && s >= 6.5; s -= 0.5) L = layout(s, Infinity);
  for (let n = 4; L.availH < minGrid && n >= 1; n--) L = layout(6.5, n);
  const { clueSize, line, left, right, availH } = L;

  const cellSide = Math.max(9, Math.min(box.w / puzzle.w, availH / puzzle.h, 26));
  const gw = cellSide * puzzle.w, gh = cellSide * puzzle.h;
  const gx = box.x + (box.w - gw) / 2;
  drawCrissCrossGrid(page, F, puzzle, { x: gx, top: topY, side: gw, solution: false, cell: cellSide, numbers: puzzle.numbers });

  let y = topY - gh - 16;
  const drawCol = (lines, x) => {
    let yy = y;
    for (const l of lines) {
      page.drawText(l.text, { x: x + (l.indent ? L.indent : 0), y: yy - clueSize, size: clueSize, font: l.bold ? F.bold : F.regular });
      yy -= line;
    }
  };
  drawCol(left, box.x);
  drawCol(right, box.x + colW + gap);
  footer(ctx, page, box);
}

// ---------- mazes ----------

function drawMazePage(ctx, maze) {
  const { page, box } = newPage(ctx);
  const F = ctx.F;
  const headSize = 20;
  puzzleHeader(page, F, box, maze.index, maze.title, headSize, ctx.largePrint ? 16 : 12);

  // The "start" and "end" labels hang outside the grid, so the grid has to be
  // narrower than the box by enough to hold them — otherwise the labels land
  // in the margin, which is exactly what KDP rejects a file for.
  const labelRoom = 2 * (F.regular.widthOfTextAtSize("start", 11) + 6);
  const areaTop = box.y + box.h - headSize - 26;
  const areaBottom = box.y + 40;
  const side = Math.min(box.w - labelRoom, areaTop - areaBottom);
  const top = areaTop - (areaTop - areaBottom - side) / 2;
  const x = box.x + (box.w - side) / 2;
  drawMaze(page, F, maze, { x, top, side, bounds: box });
  footer(ctx, page, box);
}

// Walls come pre-merged into runs, so even a 39x39 maze is a few hundred
// lines rather than a few thousand — a smaller PDF and a faster render.
function drawMaze(page, F, maze, { x, top, side, path = null, bounds = null }) {
  const cell = side / Math.max(maze.w, maze.h);
  const gw = cell * maze.w;
  const gh = cell * maze.h;
  const thickness = Math.max(0.5, Math.min(1.4, cell * 0.13));
  const px = (cx) => x + cx * cell;
  const py = (cy) => top - cy * cell;

  if (path && path.length) {
    // The route is drawn first so the walls sit on top of it, and as a wide
    // grey corridor rather than a hairline — on a six-to-a-page solutions
    // sheet a thin light line is invisible, which makes the answer key
    // useless exactly where it is needed.
    for (let i = 1; i < path.length; i++) {
      const a = path[i - 1];
      const b = path[i];
      page.drawLine({
        start: { x: px(a % maze.w) + cell / 2, y: py(Math.floor(a / maze.w)) - cell / 2 },
        end: { x: px(b % maze.w) + cell / 2, y: py(Math.floor(b / maze.w)) - cell / 2 },
        thickness: Math.max(1.1, cell * 0.55),
        color: rgb(0.62, 0.66, 0.72),
      });
    }
  }

  for (const seg of wallSegments(maze)) {
    page.drawLine({
      start: { x: px(seg.x1), y: py(seg.y1) },
      end: { x: px(seg.x2), y: py(seg.y2) },
      thickness,
      color: BLACK,
    });
  }

  // Label the way in and the way out, outside the walls — but never outside
  // the page's safe area. On the solutions sheet there are no bounds and no
  // labels; a six-up thumbnail has no room for them.
  if (!bounds) return;
  const label = Math.max(6, Math.min(11, cell * 1.1));
  const startW = F.regular.widthOfTextAtSize("start", label);
  const endW = F.regular.widthOfTextAtSize("end", label);
  page.drawText("start", {
    x: Math.max(bounds.x, x - startW - 4),
    y: top - cell * 0.75,
    size: label, font: F.regular, color: GREY,
  });
  page.drawText("end", {
    x: Math.min(x + gw + 4, bounds.x + bounds.w - endW),
    y: top - gh + cell * 0.25,
    size: label, font: F.regular, color: GREY,
  });
}

// ---------- sudoku ----------

function drawSudokuPage(ctx, puzzle) {
  const { page, box } = newPage(ctx);
  const F = ctx.F;
  const headSize = 20;
  puzzleHeader(page, F, box, puzzle.index, puzzle.title, headSize, ctx.largePrint ? 16 : 12);

  // Centre the grid in what is left of the page rather than hanging it from
  // the header with dead space underneath.
  const areaTop = box.y + box.h - headSize - 22;
  const areaBottom = box.y + 34;
  // A 4×4 at full page width has 1.3" cells — fine for a small child's pencil,
  // and the books that sell are printed that big. Kept full size on purpose.
  const side = Math.min(box.w, areaTop - areaBottom);
  const top = areaTop - (areaTop - areaBottom - side) / 2;
  drawSudokuGrid(page, F, puzzle.puzzle, { x: box.x + (box.w - side) / 2, top, side, givens: puzzle.puzzle });
  footer(ctx, page, box);
}

// A sudoku grid. Box borders are drawn thicker than cell borders — without
// that the 3x3 structure disappears and the puzzle is unpleasant to solve.
function drawSudokuGrid(page, F, values, { x, top, side, givens = null, small = false }) {
  const n = Math.round(Math.sqrt(values.length));
  const boxR = n === 9 ? 3 : 2, boxC = n === 4 ? 2 : 3; // 9: 3×3, 6: 2×3, 4: 2×2
  const cell = side / n;
  const size = cell * (small ? 0.58 : 0.6);
  for (let i = 0; i < n * n; i++) {
    const v = values[i];
    if (!v) continue;
    const r = Math.floor(i / n);
    const c = i % n;
    const isGiven = givens ? Boolean(givens[i]) : true;
    const font = isGiven ? F.bold : F.regular;
    const w = font.widthOfTextAtSize(String(v), size);
    page.drawText(String(v), {
      x: x + c * cell + (cell - w) / 2,
      y: top - (r + 1) * cell + cell * 0.3,
      size,
      font,
      color: isGiven ? BLACK : GREY,
    });
  }
  // The 3x3 structure has to read at a glance; too little contrast between the
  // two line weights and the puzzle is unpleasant to solve.
  const thin = small ? 0.25 : 0.4;
  const thick = small ? 1.0 : 2.2;
  // A stroke straddles its path, so the outermost lines would put half their
  // width past the grid — over the safe-area edge on a full-page grid. Pull
  // the outer lines in by that half.
  const half = thick / 2;
  for (let k = 0; k <= n; k++) {
    // Vertical lines bound box columns (every boxC); horizontal ones bound box rows (every boxR).
    const vx = x + k * cell + (k === 0 ? half : k === n ? -half : 0);
    const hy = top - k * cell - (k === 0 ? half : k === n ? -half : 0);
    page.drawLine({ start: { x: vx, y: top - half }, end: { x: vx, y: top - side + half }, thickness: k % boxC === 0 ? thick : thin, color: BLACK });
    page.drawLine({ start: { x: x + half, y: hy }, end: { x: x + side - half, y: hy }, thickness: k % boxR === 0 ? thick : thin, color: BLACK });
  }
}

function drawSolutionsPage(ctx, puzzles, perPage) {
  const { page, box } = newPage(ctx);
  const F = ctx.F;
  const cols = perPage <= 2 ? 1 : 2;
  const rows = Math.ceil(perPage / cols);
  const gap = 14;
  const cellW = (box.w - gap * (cols - 1)) / cols;
  const cellH = (box.h - 28 - gap * (rows - 1)) / rows;
  // One grid a page is large print, so its label is large print too.
  const label = perPage === 1 ? 16 : 10;
  const side = Math.min(cellW, cellH - label - 6);
  puzzles.forEach((p, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = box.x + c * (cellW + gap) + (cellW - side) / 2;
    const top = box.y + box.h - r * (cellH + gap);
    page.drawText(`Puzzle ${p.index}`, { x, y: top - label, size: label, font: F.bold });
    if (p.kind === "sudoku") {
      drawSudokuGrid(page, F, p.solution, { x, top: top - label - 6, side, givens: p.puzzle, small: true });
    } else if (p.kind === "maze") {
      drawMaze(page, F, p, { x, top: top - label - 6, side, path: p.solution });
    } else if (p.kind === "crisscross" || p.kind === "crossword") {
      drawCrissCrossGrid(page, F, p, { x, top: top - label - 6, side, solution: true });
    } else {
      drawGrid(page, F, p, { x, top: top - label - 6, side, solution: true });
    }
  });
  footer(ctx, page, box);
}

function wrap(font, text, maxWidth, size) {
  const words = text.split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (font.widthOfTextAtSize(next, size) > maxWidth && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines;
}
