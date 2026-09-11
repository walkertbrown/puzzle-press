// Render a generated book to a KDP-ready PDF with pdf-lib.
//
// renderBook(book, { title, subtitle, author, trim, bleed, licensed, fonts })
//   -> Uint8Array (PDF bytes)
//
// Page order: title, copyright, puzzles (one per page, starting on a
// right-hand page), "Solutions" divider on a right-hand page, solutions
// 4-up, then blank "Notes" pages to reach KDP's 24-page minimum and an even
// count. Page numbers sit on the outside bottom corner.

import { PDFDocument, rgb, StandardFonts } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { pageGeometry, marginsForPage, MIN_PAGES } from "./kdp.js";
import { planPages, solutionsThatFit } from "./layout.js";

export { planPages, solutionsThatFit } from "./layout.js";
import { wallSegments } from "../generator/maze.js";

const BLACK = rgb(0, 0, 0);
const GREY = rgb(0.45, 0.45, 0.45);
const SHADE = rgb(0.82, 0.82, 0.82);
const WATERMARK = "Made with Puzzle Press — free preview";

export async function renderBook(book, opts = {}) {
  const {
    title = "Word Search",
    subtitle = "",
    author = "",
    trim = "6x9",
    bleed = false,
    licensed = false,
    fonts = null, // { regular: Uint8Array, bold: Uint8Array } — required for embedding
  } = opts;

  const puzzles = book.puzzles;
  const solutionsPerPage = opts.solutionsPerPage ?? solutionsThatFit(pageGeometry({ trim, bleed }));
  const plan = planPages(puzzles.length, solutionsPerPage);
  const geom = pageGeometry({ trim, bleed, pageCount: plan.total });

  const doc = await PDFDocument.create();
  doc.setTitle(title);
  if (author) doc.setAuthor(author);
  doc.setProducer("Puzzle Press");
  doc.setCreator("Puzzle Press");

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

  const ctx = { doc, geom, F, licensed, pageNo: 0 };

  // 1–2: title + copyright
  drawTitlePage(ctx, { title, subtitle, author });
  drawCopyrightPage(ctx, { title, author });

  // Puzzles
  for (const p of puzzles) drawPuzzlePage(ctx, p);

  // Solutions divider must be right-hand (odd). Pad with a blank if needed.
  if (ctx.pageNo % 2 === 1) drawBlankPage(ctx);
  drawDividerPage(ctx, "Solutions");
  for (let i = 0; i < puzzles.length; i += solutionsPerPage) {
    drawSolutionsPage(ctx, puzzles.slice(i, i + solutionsPerPage), solutionsPerPage);
  }

  // Pad to minimum and even.
  while (ctx.pageNo < MIN_PAGES || ctx.pageNo % 2 === 1) drawNotesPage(ctx);

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
    const s = 7;
    const w = ctx.F.regular.widthOfTextAtSize(WATERMARK, s);
    page.drawText(WATERMARK, { x: box.x + (box.w - w) / 2, y: y + 12, size: s, font: ctx.F.regular, color: GREY });
  }
}

function centered(page, text, { x, w, y, size, font, color = BLACK }) {
  const tw = font.widthOfTextAtSize(text, size);
  page.drawText(text, { x: x + (w - tw) / 2, y, size, font, color });
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
  if (author) centered(page, author, { x: box.x, w: box.w, y: box.y + box.h * 0.2, size: 14, font: ctx.F.regular });
  footer(ctx, page, box, { number: false });
}

function drawCopyrightPage(ctx, { title, author }) {
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
  let y = box.y + 80;
  for (const line of lines.reverse()) {
    if (line) centered(page, line, { x: box.x, w: box.w, y, size: 9, font: ctx.F.regular, color: GREY });
    y += 13;
  }
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
  const { page, box } = newPage(ctx);
  const F = ctx.F;

  // Header
  const headSize = 20;
  const head = `Puzzle ${puzzle.index}`;
  page.drawText(head, { x: box.x, y: box.y + box.h - headSize, size: headSize, font: F.bold });
  const sub = puzzle.title;
  const subSize = 12;
  const subW = F.regular.widthOfTextAtSize(sub, subSize);
  page.drawText(sub, { x: box.x + box.w - subW, y: box.y + box.h - headSize + 3, size: subSize, font: F.regular, color: GREY });

  // Word bank size decides how much height the grid can have.
  const words = puzzle.words;
  // The word bank has to be readable by whoever the grid is readable to — on a
  // large-print book, a 13pt bank under 23pt grid letters looks like fine print.
  const bankSize = Math.max(10, Math.min(17, Math.round(box.w / 34)));
  const cols = bankColumns(F.regular, words, box.w, bankSize);
  const rows = Math.ceil(words.length / cols);
  const bankLine = bankSize * 1.45;
  const bankH = rows * bankLine + 18;

  const topY = box.y + box.h - headSize - 16;
  const gridAvailH = topY - (box.y + 28) - bankH;
  const gridSide = Math.min(box.w, gridAvailH);
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

// ---------- mazes ----------

function drawMazePage(ctx, maze) {
  const { page, box } = newPage(ctx);
  const F = ctx.F;
  const headSize = 20;
  page.drawText(`Puzzle ${maze.index}`, { x: box.x, y: box.y + box.h - headSize, size: headSize, font: F.bold });
  const subW = F.regular.widthOfTextAtSize(maze.title, 12);
  page.drawText(maze.title, { x: box.x + box.w - subW, y: box.y + box.h - headSize + 3, size: 12, font: F.regular, color: GREY });

  const areaTop = box.y + box.h - headSize - 26;
  const areaBottom = box.y + 40;
  const side = Math.min(box.w - 24, areaTop - areaBottom);
  const top = areaTop - (areaTop - areaBottom - side) / 2;
  const x = box.x + (box.w - side) / 2;
  drawMaze(page, F, maze, { x, top, side });
  footer(ctx, page, box);
}

// Walls come pre-merged into runs, so even a 39x39 maze is a few hundred
// lines rather than a few thousand — a smaller PDF and a faster render.
function drawMaze(page, F, maze, { x, top, side, path = null }) {
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

  // Label the way in and the way out, outside the walls.
  const label = Math.max(6, Math.min(11, cell * 1.1));
  page.drawText("start", { x: x - F.regular.widthOfTextAtSize("start", label) - 4, y: top - cell * 0.75, size: label, font: F.regular, color: GREY });
  page.drawText("end", { x: x + gw + 4, y: top - gh + cell * 0.25, size: label, font: F.regular, color: GREY });
}

// ---------- sudoku ----------

function drawSudokuPage(ctx, puzzle) {
  const { page, box } = newPage(ctx);
  const F = ctx.F;
  const headSize = 20;
  page.drawText(`Puzzle ${puzzle.index}`, { x: box.x, y: box.y + box.h - headSize, size: headSize, font: F.bold });
  const sub = puzzle.title;
  const subW = F.regular.widthOfTextAtSize(sub, 12);
  page.drawText(sub, { x: box.x + box.w - subW, y: box.y + box.h - headSize + 3, size: 12, font: F.regular, color: GREY });

  // Centre the grid in what is left of the page rather than hanging it from
  // the header with dead space underneath.
  const areaTop = box.y + box.h - headSize - 22;
  const areaBottom = box.y + 34;
  const side = Math.min(box.w, areaTop - areaBottom);
  const top = areaTop - (areaTop - areaBottom - side) / 2;
  drawSudokuGrid(page, F, puzzle.puzzle, { x: box.x + (box.w - side) / 2, top, side, givens: puzzle.puzzle });
  footer(ctx, page, box);
}

// A sudoku grid. Box borders are drawn thicker than cell borders — without
// that the 3x3 structure disappears and the puzzle is unpleasant to solve.
function drawSudokuGrid(page, F, values, { x, top, side, givens = null, small = false }) {
  const cell = side / 9;
  const size = cell * (small ? 0.58 : 0.6);
  for (let i = 0; i < 81; i++) {
    const v = values[i];
    if (!v) continue;
    const r = Math.floor(i / 9);
    const c = i % 9;
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
  for (let k = 0; k <= 9; k++) {
    const w = k % 3 === 0 ? thick : thin;
    page.drawLine({ start: { x: x + k * cell, y: top }, end: { x: x + k * cell, y: top - side }, thickness: w, color: BLACK });
    page.drawLine({ start: { x, y: top - k * cell }, end: { x: x + side, y: top - k * cell }, thickness: w, color: BLACK });
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
  const side = Math.min(cellW, cellH - 16);
  puzzles.forEach((p, i) => {
    const c = i % cols;
    const r = Math.floor(i / cols);
    const x = box.x + c * (cellW + gap) + (cellW - side) / 2;
    const top = box.y + box.h - r * (cellH + gap);
    page.drawText(`Puzzle ${p.index}`, { x, y: top - 10, size: 10, font: F.bold });
    if (p.kind === "sudoku") {
      drawSudokuGrid(page, F, p.solution, { x, top: top - 16, side, givens: p.puzzle, small: true });
    } else if (p.kind === "maze") {
      drawMaze(page, F, p, { x, top: top - 16, side, path: p.solution });
    } else {
      drawGrid(page, F, p, { x, top: top - 16, side, solution: true });
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
