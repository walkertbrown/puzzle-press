import { THEMES } from "../generator/wordlists.js";
import { generateBook } from "../generator/book.js";
import { generateSudokuBook, generateSudokuBookAsync, SUDOKU_DIFFICULTY, SUDOKU_SIZES, givensFor } from "../generator/sudoku.js";
import { generateMazeBook, wallSegments, MAZE_DIFFICULTY } from "../generator/maze.js";
import { generateCrissCrossBook, CRISSCROSS_DIFFICULTY } from "../generator/crisscross.js";
import { generateCrosswordBook, CROSSWORD_DIFFICULTY, parseClueLine } from "../generator/crossword.js";

// The built-in clue table is 1,400 lines; fetched the first time a crossword
// is asked for, never for anyone who does not.
let CLUES = null;
let cluesLoading = null;
function loadClues() {
  if (CLUES) return Promise.resolve(CLUES);
  cluesLoading ??= import("../generator/clues.js").then((m) => (CLUES = m.CLUES));
  return cluesLoading;
}
import { TRIMS } from "../pdf/kdp.js";
// pdf-lib and fontkit are about 90% of this bundle and are only needed once
// somebody actually asks for a file, so they load on the first download
// instead of before the page is usable.
import { planPages, solutionsThatFit, solutionsPerPageFor, puzzlesForMinimum } from "../pdf/layout.js";

// Loaded separately rather than together. They share the heavy chunk, so the
// second one costs almost nothing once the first has been fetched — and the
// launch dashboard reads the funnel out of the request log, with no analytics
// script and no beacon, so "made a book" and "made a cover" have to be
// distinguishable by which file was asked for. Loading both on either click
// made every book download look like a cover download too.
let renderMod = null;
async function loadRender() {
  if (!renderMod) renderMod = await import("../pdf/render.js");
  return renderMod;
}
let coverMod = null;
async function loadCover() {
  if (!coverMod) coverMod = await import("../pdf/cover.js");
  return coverMod;
}
import { coverGeometry, spineWidthInches, SPINE_TEXT_MIN_PAGES } from "../pdf/cover-geometry.js";
import { royalty } from "../pdf/kdp-cost.js";
import { pageGeometry } from "../pdf/kdp.js";
import { FREE_LIMIT, PRICE_LABEL, getLicense as storedLicense, setLicense, verifyEmail } from "./license.js";

// What the last interior download actually came to. The cover's spine is
// worked out from a page count, and if some puzzles could not be built the
// real book is shorter than the plan — a cover sized for the plan would then
// be too wide for the book it wraps, which KDP rejects. Keyed by the settings
// that produced it, so it is only trusted while they still apply.
let lastInterior = null; // { key, pages, puzzles }
const settingsKey = (s) =>
  JSON.stringify([s.kind, s.trim, s.bleed, s.count, s.difficulty, s.wordsPerPuzzle, s.size, s.seed,
    s.pools.map((p) => `${p.title}:${p.words.length}`)]);

// A licence verified in this tab, kept in memory so a browser that refuses
// localStorage still gets what it paid for until the tab closes.
let sessionLicense = null;
const getLicense = () => storedLicense() ?? sessionLicense;

// The pay link is injected by the Worker at request time (config.js) or is
// absent in local dev. No link, no Buy button.
const PAY_URL = window.PUZZLE_PRESS_PAY_URL || "";

const $ = (id) => document.getElementById(id);
const el = {
  title: $("title"), subtitle: $("subtitle"), author: $("author"), trim: $("trim"), count: $("count"), bleed: $("bleed"),
  themes: $("themes"), custom: $("custom"), customTitle: $("customTitle"),
  wpp: $("wpp"), difficulty: $("difficulty"), size: $("size"), seed: $("seed"), largePrint: $("largePrint"), kind: $("kind"), sudokuSize: $("sudokuSize"),
  download: $("download"), downloadCover: $("downloadCover"), coverNote: $("coverNote"), moneyNote: $("moneyNote"), list: $("list"), ink: $("ink"), paper: $("paper"), reshuffle: $("reshuffle"), status: $("status"), tier: $("tier"), warnings: $("warnings"),
  meta: $("meta"), lengthWarn: $("lengthWarn"), page: $("page"), prev: $("prev"), next: $("next"), navLabel: $("navLabel"),
  dialog: $("unlockDialog"), dialogTitle: $("dialogTitle"), dialogLede: $("dialogLede"), buyLine: $("buyLine"), paidLead: $("paidLead"), email: $("email"), unlockErr: $("unlockErr"), verify: $("verify"), closeDialog: $("closeDialog"),
};

let book = null;
let shown = 0;
let fontsPromise = null;

// ---------- what happened between landing and leaving ----------
//
// Every stage of the funnel in scripts/traffic.mjs is read out of Cloudflare's
// request log, and until now every stage was a *file the browser happened to
// fetch*: main.js for "ran the app", the idle-warmed heavy chunk for "did not
// bounce", render.js for "clicked Download". That is honest about network
// events and silent about people. On 2026-09-21, once the request/person bug
// was fixed, it read: 7 people stayed, 0 downloaded — and there was no way at
// all to tell whether they scrolled down to the generator, touched a control,
// pressed the button and hit an error, or read the hero and left.
//
// This is the smallest thing that answers that: a closed, fixed set of empty
// 1x1 GIFs under /px/, one per act, each fired at most once per page load. No
// id, no cookie, no session, no content — the path IS the entire message, and
// every path that exists is listed in public/px/. The site's promise is that
// nothing you type leaves your browser, and nothing here carries anything
// anybody typed: not a title, not a word list, not a setting, not a value, not
// a number. test/privacy.mjs is the thing that enforces that, and it runs
// against this.
//
// They are real deployed files, deliberately, not 404s. A miss would land in
// the scanner rule in traffic.mjs — the one that files an address asking for
// things that do not exist as an attacker — and every visitor would be
// excluded from their own funnel.
const pxSent = new Set();
function px(name) {
  if (pxSent.has(name)) return;
  pxSent.add(name);
  // Cloudflare logs clientRequestPath without the query string, so the cache
  // buster costs nothing in the dashboard: it only stops the browser serving a
  // later page view's beacon out of its own cache.
  try {
    new Image().src = `/px/${name}.gif?${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  } catch {}
}

// ---------- setup ----------

for (const [id, t] of Object.entries(TRIMS)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = t.label + (id === "6x9" ? " — most common" : "");
  if (id === "6x9") o.selected = true;
  el.trim.append(o);
}
for (const [id, t] of Object.entries(THEMES)) {
  const lab = document.createElement("label");
  const cb = document.createElement("input");
  cb.type = "checkbox";
  cb.value = id;
  cb.checked = id === "animals";
  lab.append(cb, ` ${t.title}`);
  el.themes.append(lab);
}
const WS_DIFFICULTY = {
  easy: "Easy — across & down",
  medium: "Medium — + diagonals",
  hard: "Hard — all directions",
  graded: "Graded — easy to hard",
};
const GRADED_LABEL = "Graded — easy to expert";

// Sensible defaults per puzzle type, used until the person types their own.
// The subtitle counts the puzzles, so it is a template rather than a string:
// the default used to say "50" whatever the count was, and the count is the
// most obvious knob on the page. Anyone who moved it off 50 got a title page
// claiming a number the book did not contain — printed, on Amazon, page one.
const DEFAULT_TITLES = {
  wordsearch: ["Animal Word Search", ["relaxing puzzle", "relaxing puzzles"]],
  sudoku: ["Sudoku", ["puzzle", "puzzles"]],
  maze: ["Mazes", ["maze", "mazes"]],
  crisscross: ["Animal Fill-In Puzzles", ["criss-cross puzzle", "criss-cross puzzles"]],
  crossword: ["Animal Crosswords", ["themed crossword", "themed crosswords"]],
};
const defaultSubtitle = ([one, many], count) => `${count} ${count === 1 ? one : many} with solutions`;
const clampInt = (v, lo, hi, d) => Math.min(hi, Math.max(lo, parseInt(v, 10) || d));
let titleEdited = false;
let subtitleEdited = false;
el.title.addEventListener("input", () => { titleEdited = true; });
el.subtitle.addEventListener("input", () => { subtitleEdited = true; });

function refreshKind() {
  const kind = el.kind.value;
  // A sudoku book called "Animal Word Search" is what you get if the title
  // does not follow the type. Only touch what the person has not typed.
  const [t, nouns] = DEFAULT_TITLES[kind] ?? DEFAULT_TITLES.wordsearch;
  if (!titleEdited) el.title.value = t;
  if (!subtitleEdited) el.subtitle.value = defaultSubtitle(nouns, clampInt(el.count.value, 1, 200, 50));
  // Sudoku and mazes need no words at all. Criss-cross needs the themes but
  // not the word-search-only knobs (words per puzzle, grid size, large print).
  const wordless = kind === "sudoku" || kind === "maze";
  const themed = kind === "crisscross" || kind === "crossword";
  for (const node of document.querySelectorAll(".ws-only")) {
    node.classList.toggle("hidden", wordless || (themed && !node.classList.contains("themed")));
  }
  // Crosswords need a clue per pasted word; say so where the words go in.
  document.getElementById("sudokuSizeRow").classList.toggle("hidden", kind !== "sudoku");
  el.custom.placeholder = kind === "crossword" ? "harbor — Sheltered place for ships\nreef — Ridge of coral near the surface" : "apple\nbanana\ncherry";
  const opts =
    kind === "crisscross" || kind === "crossword"
      ? { ...Object.fromEntries(Object.entries(CRISSCROSS_DIFFICULTY).map(([k, v]) => [k, `${v.label} — ${v.words} words`])), graded: GRADED_LABEL }
      : kind === "sudoku"
      ? { ...Object.fromEntries(Object.entries(SUDOKU_DIFFICULTY).map(([k, v]) => [k, `${v.label} — ${givensFor(v, Number(el.sudokuSize.value) || 9)} clues`])), graded: GRADED_LABEL }
      : kind === "maze"
        ? { ...Object.fromEntries(Object.entries(MAZE_DIFFICULTY).map(([k, v]) => [k, `${v.label} — ${v.w}×${v.h}`])), graded: GRADED_LABEL }
        : WS_DIFFICULTY;
  const keep = el.difficulty.value;
  el.difficulty.replaceChildren();
  for (const [value, label] of Object.entries(opts)) {
    const o = document.createElement("option");
    o.value = value;
    o.textContent = label;
    el.difficulty.append(o);
  }
  el.difficulty.value = opts[keep] ? keep : "medium";
  if (kind !== "wordsearch") el.largePrint.checked = false;
}

el.seed.value = randomSeed();
refreshKind();

function randomSeed() {
  return Math.random().toString(36).slice(2, 8);
}

// ---------- reading settings ----------

function settings() {
  const pools = [];
  for (const cb of el.themes.querySelectorAll("input:checked")) pools.push(THEMES[cb.value]);
  // One word per line, or comma-separated; for crosswords a line may carry
  // its clue after a dash or colon, so lines are split before commas are.
  const lines = el.custom.value.split(/\n+/).map((l) => l.trim()).filter(Boolean);
  const parsed = lines.flatMap((l) => {
    const p = parseClueLine(l);
    return p.clue ? [p] : l.split(/[,;]+/).map((w) => ({ word: w.trim() })).filter((w) => w.word);
  });
  const customWords = parsed.map((p) => p.word);
  const customClues = Object.fromEntries(parsed.filter((p) => p.clue).map((p) => [p.word.toLowerCase().replace(/[^a-z]/g, ""), p.clue]));
  if (customWords.length >= 2) pools.push({ title: el.customTitle.value.trim() || "My Words", words: customWords, clues: customClues });
  const n = clampInt;
  return {
    title: el.title.value.trim() || "Word Search",
    subtitle: el.subtitle.value.trim(),
    author: el.author.value.trim(),
    kind: el.kind.value,
    trim: el.trim.value,
    list: Math.max(0, parseFloat(el.list.value) || 0),
    ink: el.ink.value,
    paper: el.paper.value,
    bleed: el.bleed.checked,
    count: n(el.count.value, 1, 200, 50),
    wordsPerPuzzle: n(el.wpp.value, 5, 30, 15),
    difficulty: el.difficulty.value,
    size: el.kind.value === "sudoku" ? Number(el.sudokuSize.value) || 9 : el.size.value ? n(el.size.value, 8, 30, 15) : null,
    seed: el.seed.value.trim() || "book",
    largePrint: el.largePrint.checked,
    pools,
  };
}

// ---------- generate + preview ----------

function regenerate() {
  const s = settings();
  if (s.kind === "maze") {
    book = generateMazeBook({ count: Math.min(s.count, 3), gradeCount: s.count, difficulty: s.difficulty, seed: s.seed });
    shown = 0;
    showPuzzle();
    showMeta(s);
    el.warnings.textContent = "";
    return;
  }
  if (s.kind === "sudoku") {
    // Only a few, and only for the preview — an expert puzzle is real work.
    book = generateSudokuBook({ count: Math.min(s.count, 3), gradeCount: s.count, difficulty: s.difficulty, seed: s.seed, size: s.size });
    shown = 0;
    showPuzzle();
    showMeta(s);
    el.warnings.textContent = "";
    return;
  }
  if (s.pools.length === 0) {
    book = null;
    el.page.innerHTML = "<p style='color:#5c6470'>Pick at least one theme or paste at least two words.</p>";
    el.meta.textContent = "";
    el.warnings.textContent = "";
    el.navLabel.textContent = "";
    return;
  }
  // Preview only needs the first few puzzles; the full book is made on download.
  const previewCount = Math.min(s.count, 3);
  if (s.kind === "crossword" && !CLUES) {
    el.page.innerHTML = "<p style='color:#5c6470'>Loading clues…</p>";
    loadClues().then(regenerate);
    return;
  }
  book = s.kind === "crisscross"
    ? generateCrissCrossBook({ ...s, count: previewCount, gradeCount: s.count })
    : s.kind === "crossword"
      ? generateCrosswordBook({ ...s, builtinClues: CLUES, count: previewCount, gradeCount: s.count })
      : generateBook({ ...s, count: previewCount, gradeCount: s.count });
  shown = 0;
  showPuzzle();
  showMeta(s);
  el.warnings.textContent = book.warnings.join("\n");
}

function showMeta(s) {
  const fits = solutionsThatFit(pageGeometry({ trim: s.trim, bleed: s.bleed }));
  const effective = effectiveCount(s.count);
  const plan = planPages(effective, solutionsPerPageFor(effective, fits));
  const pages = plan.total;
  // The preview shows the book's first pages, so on a graded book they are all
  // easy — which would read as "this is an easy book" without saying that the
  // grading is deliberate and where it ends up.
  const hardest = { wordsearch: "hard", sudoku: "expert", maze: "expert", crisscross: "expert", crossword: "expert" }[s.kind] ?? "expert";
  el.meta.textContent =
    `${effective} puzzle${effective === 1 ? "" : "s"} · ${TRIMS[s.trim].label} · ${pages} pages` +
    (s.difficulty === "graded" ? ` · graded, easy at the front to ${hardest} at the back` : "");

  // A book too short for KDP has to say so here, before the download, not
  // after somebody uploads it and gets rejected.
  if (plan.belowMinimum) {
    const need = puzzlesForMinimum(fits);
    el.lengthWarn.textContent =
      `${pages} pages — under KDP's ${plan.minimum}-page minimum, so KDP will not accept it as it stands. ` +
      `About ${need} puzzles makes a publishable book.`;
    el.lengthWarn.hidden = false;
  } else {
    el.lengthWarn.hidden = true;
  }
  const g = coverGeometry({ trim: s.trim, pageCount: pages, paper: s.paper });
  el.coverNote.textContent =
    `Cover: ${(g.width / 72).toFixed(3)}" × ${(g.height / 72).toFixed(3)}" ` +
    `(spine ${spineWidthInches(pages, s.paper).toFixed(3)}")` +
    (pages < SPINE_TEXT_MIN_PAGES ? ` — under ${SPINE_TEXT_MIN_PAGES} pages, so KDP wants the spine blank` : "");

  // What the book is worth, using the same figures as the royalty calculator.
  const m = royalty({ list: s.list, trim: s.trim, pages, ink: s.ink });
  if (m.printing === null) {
    el.moneyNote.textContent = m.note ?? "";
  } else if (m.royalty < 0) {
    el.moneyNote.textContent =
      `Prints for $${m.printing.toFixed(2)} on Amazon.com — at $${s.list.toFixed(2)} that loses $${Math.abs(m.royalty).toFixed(2)} a copy. ` +
      `Lowest workable price: $${m.minList.toFixed(2)}.`;
  } else {
    el.moneyNote.textContent =
      `Prints for $${m.printing.toFixed(2)} on Amazon.com — at $${s.list.toFixed(2)} you keep $${m.royalty.toFixed(2)} a copy.`;
  }
}

function showPuzzle() {
  if (!book || !book.puzzles.length) {
    // Leaving the previous type's puzzle on screen implies it worked.
    el.page.innerHTML = "<p style='color:#5c6470'>No puzzle could be made from these words. The note under the settings says what to change.</p>";
    el.navLabel.textContent = "";
    el.prev.disabled = true;
    el.next.disabled = true;
    return;
  }
  const p = book.puzzles[shown];
  if (p.kind === "sudoku") return showSudoku(p);
  if (p.kind === "maze") return showMaze(p);
  if (p.kind === "crisscross") return showCrissCross(p);
  if (p.kind === "crossword") return showCrossword(p);
  const grid = document.createElement("div");
  grid.className = "grid";
  grid.style.gridTemplateColumns = `repeat(${p.size}, 1fr)`;
  for (const row of p.grid) for (const ch of row) {
    const d = document.createElement("div");
    d.textContent = ch;
    grid.append(d);
  }
  const bank = document.createElement("div");
  bank.className = "bank";
  for (const w of p.words) {
    const d = document.createElement("div");
    d.textContent = w;
    bank.append(d);
  }
  const h = document.createElement("h3");
  h.append(`Puzzle ${p.index}`, Object.assign(document.createElement("span"), { textContent: p.title }));
  el.page.replaceChildren(h, grid, bank);
  el.navLabel.textContent = previewLabel();
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

// The preview builds the first few puzzles of the book you asked for — not a
// sample of three — so say which they are rather than "1 / 3".
function previewLabel() {
  const asked = effectiveCount(settings().count);
  return asked > book.puzzles.length
    ? `Puzzle ${shown + 1} of ${asked} — showing the first ${book.puzzles.length}`
    : `${shown + 1} / ${book.puzzles.length}`;
}

// One line describing how to make this exact book again: the seed and the
// settings that change the puzzles. Printed small on the copyright page.
function recipeLine(s, made) {
  const bits = [
    `Made with Puzzle Press · ${KIND_LABEL[s.kind] ?? s.kind}`,
    `${made} puzzles`,
    s.difficulty,
    s.kind === "sudoku" && s.size !== 9 ? `${s.size}×${s.size}` : null,
    s.kind === "wordsearch" ? `${s.wordsPerPuzzle} words` : null,
    // Only the types that draw on words: a maze book's recipe listing
    // "Animals" would be a setting that had no effect on it.
    WORD_KINDS.has(s.kind) && s.pools.length ? s.pools.map((p) => p.title).join(" + ") : null,
    `seed ${s.seed}`,
  ].filter(Boolean);
  return bits.join(" · ");
}
const WORD_KINDS = new Set(["wordsearch", "crisscross", "crossword"]);
const KIND_LABEL = {
  wordsearch: "word search",
  sudoku: "sudoku",
  maze: "mazes",
  crisscross: "criss-cross",
  crossword: "crossword",
};

// "about 2 minutes" / "about 20 seconds", once enough work is done to have a
// rate worth quoting. Returns "" while it would be guesswork.
function remaining(started, done, total) {
  if (done < 3 || done >= total) return "";
  const perItem = (Date.now() - started) / done;
  const secs = Math.round((perItem * (total - done)) / 1000);
  if (secs < 10) return "";
  if (secs < 90) return `${Math.round(secs / 5) * 5} seconds`;
  return `${Math.round(secs / 60)} minute${Math.round(secs / 60) === 1 ? "" : "s"}`;
}

// The free tier no longer shortens a book — it watermarks it — so what is
// quoted on screen is simply what you asked for.
function effectiveCount(requested) {
  return requested;
}

function showCrissCross(p) {
  const given = new Set();
  for (const g of p.given) {
    const pl = p.placements.find((q) => q.word === g);
    for (let i = 0; i < g.length; i++) given.add(`${pl.row + pl.dr * i},${pl.col + pl.dc * i}`);
  }
  const grid = document.createElement("div");
  grid.className = "crisscross";
  grid.style.gridTemplateColumns = `repeat(${p.w}, 1fr)`;
  grid.style.aspectRatio = `${p.w} / ${p.h}`;
  for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
    const d = document.createElement("div");
    const ch = p.cells[r][c];
    if (ch) { d.className = "cell"; if (given.has(`${r},${c}`)) d.textContent = ch; }
    grid.append(d);
  }
  const bank = document.createElement("div");
  bank.className = "bank";
  const groups = new Map();
  for (const w of p.words) (groups.get(w.length) ?? groups.set(w.length, []).get(w.length)).push(w);
  for (const len of [...groups.keys()].sort((a, b) => a - b)) {
    const h = document.createElement("div");
    h.className = "len";
    h.textContent = `${len} letters`;
    bank.append(h);
    for (const w of groups.get(len)) {
      const d = document.createElement("div");
      d.textContent = w;
      bank.append(d);
    }
  }
  const h = document.createElement("h3");
  h.append(`Puzzle ${p.index}`, Object.assign(document.createElement("span"), { textContent: `${p.title}${p.given.length ? " · " + p.given[0] + " given" : ""}` }));
  el.page.replaceChildren(h, grid, bank);
  el.navLabel.textContent = previewLabel();
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

function showCrossword(p) {
  const grid = document.createElement("div");
  grid.className = "crisscross";
  grid.style.gridTemplateColumns = `repeat(${p.w}, 1fr)`;
  grid.style.aspectRatio = `${p.w} / ${p.h}`;
  for (let r = 0; r < p.h; r++) for (let c = 0; c < p.w; c++) {
    const d = document.createElement("div");
    if (p.cells[r][c]) {
      d.className = "cell";
      const n = p.numbers[`${r},${c}`];
      if (n) { const s = document.createElement("i"); s.textContent = n; d.append(s); }
    }
    grid.append(d);
  }
  const clues = document.createElement("div");
  clues.className = "clues";
  for (const [heading, list] of [["Across", p.across], ["Down", p.down]]) {
    const col = document.createElement("div");
    const h4 = document.createElement("h4");
    h4.textContent = heading;
    col.append(h4);
    for (const e of list) {
      const d = document.createElement("div");
      d.textContent = `${e.num}. ${e.clue} (${e.len})`;
      col.append(d);
    }
    clues.append(col);
  }
  const h = document.createElement("h3");
  h.append(`Puzzle ${p.index}`, Object.assign(document.createElement("span"), { textContent: p.title }));
  el.page.replaceChildren(h, grid, clues);
  el.navLabel.textContent = previewLabel();
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

function showMaze(p) {
  const pad = 1;
  const lines = wallSegments(p)
    .map((g) => `<line x1="${g.x1}" y1="${g.y1}" x2="${g.x2}" y2="${g.y2}"/>`)
    .join("");
  const wrap = document.createElement("div");
  wrap.className = "maze";
  wrap.innerHTML =
    `<svg viewBox="${-pad} ${-pad} ${p.w + pad * 2} ${p.h + pad * 2}" role="img" aria-label="Maze preview">` +
    `<g stroke="#111" stroke-width="0.18" stroke-linecap="square" fill="none">${lines}</g></svg>`;
  const h = document.createElement("h3");
  h.append(`Puzzle ${p.index}`, Object.assign(document.createElement("span"), { textContent: `${p.title} · ${p.w}×${p.h}` }));
  el.page.replaceChildren(h, wrap);
  el.navLabel.textContent = previewLabel();
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

function showSudoku(p) {
  const n = p.size ?? 9;
  const boxR = n === 9 ? 3 : 2, boxC = n === 4 ? 2 : 3;
  const grid = document.createElement("div");
  grid.className = "sudoku";
  grid.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
  p.puzzle.forEach((v, i) => {
    const d = document.createElement("div");
    d.textContent = v || "";
    const c = i % n;
    const r = Math.floor(i / n);
    if ((c + 1) % boxC === 0 && c < n - 1) d.classList.add("br");
    if ((r + 1) % boxR === 0 && r < n - 1) d.classList.add("bb");
    if (c === n - 1) d.classList.add("last-col");
    if (r === n - 1) d.classList.add("last-row");
    grid.append(d);
  });
  const h = document.createElement("h3");
  h.append(`Puzzle ${p.index}`, Object.assign(document.createElement("span"), { textContent: `${p.title} · ${p.givens} clues` }));
  el.page.replaceChildren(h, grid);
  el.navLabel.textContent = previewLabel();
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

// ---------- tier ----------

function refreshTier(note = "") {
  const lic = getLicense();
  if (lic) {
    el.tier.className = "tier licensed";
    el.tier.innerHTML =
      `<b>Unlocked</b> for ${escapeHtml(lic.email)}. Unlimited puzzles, no watermark.` +
      (note === "storage"
        ? ` <b>This tab only:</b> your browser is blocking site storage (a private window, or cookies turned off), so the unlock will not survive a reload. Enter the same email again after reloading, or use a normal window — your payment is recorded either way.`
        : "");
  } else {
    el.tier.className = "tier";
    // Two links into the same dialog, because two different people read this
    // line. Somebody who has already paid — a new laptop, cleared storage, a
    // month later — saw only "Remove both — $19 one-time", which reads as
    // being asked to pay a second time. The licence has always been the email
    // and nothing else, but nothing on the page said where to type it.
    el.tier.innerHTML = `<b>Free:</b> full-length books, with one small line in the footer of every page and a cover marked PREVIEW. ` +
      `<a href="#" id="unlockLink">Remove both — ${PRICE_LABEL}</a> · ` +
      `<a href="#" id="alreadyPaid">Already paid? Unlock</a>`;
    for (const id of ["unlockLink", "alreadyPaid"]) {
      el.tier.querySelector(`#${id}`).addEventListener("click", (e) => {
        e.preventDefault();
        openUnlock({ intent: id === "alreadyPaid" ? "unlock" : "buy" });
      });
    }
  }
}

let autoRetryTimer = null;
let autoRetryFirstFailAt = 0;
// A real test-mode payment on 2026-09-16 took Stripe's own
// /v1/checkout/sessions list — the only thing /api/verify can query — over
// 230 seconds to start showing a session that a direct, unfiltered lookup
// confirmed was already `status: complete, payment_status: paid`. So the
// single retry this dialog used to ask a human to perform by hand ("press
// Unlock again") was never going to be enough; this is the ceiling for
// retrying automatically instead, with margin over what was actually measured.
const AUTO_RETRY_INTERVAL_MS = 10000;
const AUTO_RETRY_CEILING_MS = 5 * 60 * 1000;
function stopAutoRetry() {
  if (autoRetryTimer) { clearTimeout(autoRetryTimer); autoRetryTimer = null; }
}
// Three different people open this dialog and until 2026-09-15 all three got the
// same thing: the heading "Unlock full books", the purchase as a text link, and
// the cursor sitting in an email box. That is a login form. The tier line goes
// to some trouble to tell "Remove both — $19" apart from "Already paid?", and
// the dialog threw the distinction away the moment it opened.
//
// The live Stripe account agreed. In its entire history there were zero real
// checkout sessions — every one was mine — while people were making whole books
// on the site, including a stranger the night before launch who built one and
// left. The drop-off was not at the card form. Nobody ever got to the card form.
//
// So `intent` now carries through: "buy" makes buying the visible action and
// focuses it, "unlock" is for somebody who has already paid and only needs the
// email box. Nothing is hidden in either case — the email field stays visible
// and fillable in buy mode, because somebody who has paid and clicked the wrong
// link should not be stuck.
function openUnlock({ justPaid = false, intent = "buy" } = {}) {
  const buying = !justPaid && intent === "buy" && !!PAY_URL;
  el.unlockErr.textContent = "";
  el.dialogTitle.textContent = justPaid
    ? "Thanks — one last step"
    : buying
      ? "Remove the watermark"
      : "Enter the email you paid with";
  el.dialogLede.textContent = justPaid
    ? "Enter the email you used at checkout and everything unlocks on this device."
    : buying
      ? `${PRICE_LABEL}. Unlimited books, no line in the footer, no PREVIEW across the cover. No account and no subscription.`
      : "Enter the email you used at checkout and everything unlocks on this device.";
  if (justPaid) {
    // Offering to sell again to somebody who has just paid reads as a failed
    // payment. Show them the next step instead.
    el.buyLine.textContent = "";
  } else if (PAY_URL) {
    // Still `#buyLine a` with target=_blank and rel=noopener — the new tab is
    // deliberate, so the book they just built is still there when they come
    // back. Only the weight changed.
    el.buyLine.innerHTML = buying
      ? `<a class="buybtn" href="${escapeHtml(PAY_URL)}" target="_blank" rel="noopener">Buy now — ${PRICE_LABEL}</a><span class="fine">Opens Stripe checkout in a new tab. This page keeps your book.</span>`
      : `<a href="${escapeHtml(PAY_URL)}" target="_blank" rel="noopener"><b>Buy now — ${PRICE_LABEL}</b></a> (opens Stripe checkout)`;
  } else {
    el.buyLine.textContent = "Checkout is not available yet.";
  }
  el.paidLead.hidden = !buying;
  el.paidLead.textContent = buying ? "Already paid? Enter that email instead:" : "";
  el.justPaid = justPaid;
  stopAutoRetry();
  autoRetryFirstFailAt = 0;
  // <dialog> arrived in Safari 15.4, and an iPad left on an older iOS still
  // browses. Without showModal the click does nothing whatsoever — no dialog,
  // no error, no clue — and it is the click where the money is. `open` is the
  // plain attribute every engine has understood for years: it shows the same
  // element non-modally, which is worse than a modal and infinitely better
  // than a button that silently does nothing.
  if (typeof el.dialog.showModal === "function") el.dialog.showModal();
  else el.dialog.setAttribute("open", "");
  // Where the cursor lands is the whole argument. Somebody who has not paid
  // cannot fill an email box, and a focused text field says "type here" louder
  // than any heading. Put the focus on the thing they can actually do.
  const buyBtn = buying && el.buyLine.querySelector("a");
  (buyBtn || el.email).focus();
}

// close() came with showModal(), so an engine missing one is missing both —
// and a dialog that cannot be shut is a trap on a phone, where there is no
// Escape key. Same fallback, in reverse.
function closeUnlock() {
  if (typeof el.dialog.close === "function") el.dialog.close();
  else el.dialog.removeAttribute("open");
}
// Covers every way the dialog can shut — the button, Escape, a backdrop
// click, close() called from a successful verify — in one place, so a
// pending auto-retry never fires into a dialog the buyer already left.
el.dialog.addEventListener("close", stopAutoRetry);

// ---------- download ----------

async function loadFonts() {
  if (!fontsPromise) {
    fontsPromise = Promise.all([
      fetch("fonts/LiberationSans-Regular.ttf").then((r) => r.arrayBuffer()),
      fetch("fonts/LiberationSans-Bold.ttf").then((r) => r.arrayBuffer()),
    ]).then(([regular, bold]) => ({ regular, bold }));
  }
  return fontsPromise;
}

async function download() {
  px("click");
  const s = settings();
  // A press that does nothing and says nothing. Rare — "animals" is ticked by
  // default, so getting here means somebody deliberately cleared every theme —
  // but it is a dead end with no message, and a dead end nobody can see is
  // exactly the kind of thing that turns "7 stayed, 0 downloaded" into a
  // mystery. Its own beacon, so it stops being one.
  if (s.pools.length === 0) { px("empty"); return; }
  const lic = getLicense();
  const count = s.count;
  el.download.disabled = true;
  // Start the downloads now, and do not wait for them. Generating the puzzles
  // is the browser working; fetching the fonts and the renderer is the network
  // working; there is no reason they should take turns. These used to be first
  // touched further down, after every puzzle had been built.
  //
  // Measured, this bought nothing for the ordinary case: 24 word searches on a
  // throttled phone over slow 4G came out at 20.1 seconds either way. Most of
  // that "browser work" is laying out the pages, which needs the fonts and so
  // cannot start any earlier. What it does help is the case the fonts are not
  // blocking — 200 expert sudoku is minutes of generation, and there is no
  // reason a person should then wait for two megabytes that could have arrived
  // while they waited. Kept because it is right, not because it is fast.
  const fontsSoon = loadFonts();
  const renderSoon = loadRender();
  // Nothing is awaiting them yet, and an unhandled rejection would be reported
  // as a page error even though the await below handles it properly.
  fontsSoon.catch(() => {});
  renderSoon.catch(() => {});
  try {
    el.status.textContent = `Generating ${count} puzzles…`;
    const started = Date.now();
    await tick();
    const full = s.kind === "sudoku"
      ? await generateSudokuBookAsync({ ...s, count }, (done, total) => {
          // 200 expert puzzles is a minute on a laptop and several on a phone.
          // "37 of 200" is honest but says nothing about how long that is, so
          // once there is a rate to measure, say how long is left.
          const left = remaining(started, done, total);
          el.status.textContent = `Generating puzzle ${done} of ${total}…${left ? ` about ${left} left` : ""}`;
        })
      : s.kind === "maze"
        ? generateMazeBook({ ...s, count })
        : s.kind === "crisscross"
          ? generateCrissCrossBook({ ...s, count })
          : s.kind === "crossword"
            ? generateCrosswordBook({ ...s, builtinClues: await loadClues(), count })
            : generateBook({ ...s, count });
    el.warnings.textContent = full.warnings.join("\n");
    // A book with no puzzles in it is three pages of front matter and some
    // ruled paper. Refuse it and say why rather than hand someone a file that
    // makes them think the tool is broken.
    if (!full.puzzles.length) {
      el.status.textContent = "Nothing to put in the book — see the note above.";
      return;
    }
    el.status.textContent =
      full.puzzles.length < count
        ? `Laying out ${full.puzzles.length} puzzles (${count - full.puzzles.length} could not be built)…`
        : "Laying out pages…";
    await tick();
    const [fonts, { renderBook }] = await Promise.all([fontsSoon, renderSoon]);
    const bytes = await renderBook(full, {
      ...s,
      licensed: Boolean(lic),
      fonts,
      recipe: recipeLine(s, full.puzzles.length),
      // Drawing a long book is seconds of work; hand the browser a moment
      // between batches of pages so the tab stays alive and says where it is.
      onProgress: async (done, total) => {
        el.status.textContent = `Laying out page ${done} of ${total}…`;
        await tick();
      },
    });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(s.title)}-${s.trim}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    lastInterior = { key: settingsKey(s), pages: planPages(full.puzzles.length, solutionsPerPageFor(full.puzzles.length, solutionsThatFit(pageGeometry({ trim: s.trim, bleed: s.bleed })))).total, puzzles: full.puzzles.length };
    el.status.textContent =
      `Done — ${full.puzzles.length} puzzles, ${lastInterior.pages} pages, ${(blob.size / 1024).toFixed(0)} KB.` +
      (full.puzzles.length < count ? ` (${count - full.puzzles.length} could not be built — the cover will be sized for this book.)` : "");
    // A file actually reached the disk. The font fetch already proves a PDF was
    // rendered, but it cannot tell a finished download from one that fell over
    // at the last step, and it is silent for a second book on cached fonts.
    px("made");
  } catch (err) {
    console.error(err);
    el.status.textContent = `Something went wrong: ${err.message}`;
    // The message a visitor sees and I never do. "click but no made" was
    // previously indistinguishable from "click and gave up waiting".
    px("failed");
  } finally {
    el.download.disabled = false;
  }
}

// The cover is the paid half: the free tier makes a real interior, but a
// finished book needs a wrap sized to its own page count.
async function downloadCover() {
  const lic = getLicense();
  const s = settings();
  if (s.pools.length === 0) return;
  el.downloadCover.disabled = true;
  // Same as download(): fetch while the browser builds, not after.
  const fontsSoon = loadFonts();
  const coverSoon = loadCover();
  fontsSoon.catch(() => {});
  coverSoon.catch(() => {});
  try {
    el.status.textContent = "Building the cover…";
    await tick();
    const perPage = solutionsThatFit(pageGeometry({ trim: s.trim, bleed: s.bleed }));
    // Prefer the page count of the book actually made with these settings.
    const matches = lastInterior && lastInterior.key === settingsKey(s);
    const pages = matches ? lastInterior.pages : planPages(effectiveCount(s.count), perPage).total;
    const one = s.kind === "sudoku"
      ? generateSudokuBook({ ...s, count: 1 })
      : s.kind === "maze"
        ? generateMazeBook({ ...s, count: 1 })
        : s.kind === "crisscross"
          ? generateCrissCrossBook({ ...s, count: 1 })
          : s.kind === "crossword"
            ? generateCrosswordBook({ ...s, builtinClues: await loadClues(), count: 1 })
            : generateBook({ ...s, count: 1 });
    const [fonts, { renderCover }] = await Promise.all([fontsSoon, coverSoon]);
    const bytes = await renderCover({
      title: s.title,
      subtitle: s.subtitle,
      author: s.author,
      trim: s.trim,
      paper: s.paper,
      pageCount: pages,
      puzzleCount: s.count,
      samplePuzzle: one.puzzles[0],
      seed: s.seed,
      licensed: Boolean(lic),
      largePrint: s.largePrint,
      fonts,
    });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(s.title)}-cover-${s.trim}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    el.status.textContent = lic
      ? `Cover ready — sized for ${pages} pages on ${s.paper === "cream" ? "cream" : "white"} paper.`
      : `Preview cover ready — your title, your spine (${pages} pages). Unlock to get it without the PREVIEW mark.`;
    if (!lic) openUnlock();
  } catch (err) {
    console.error(err);
    el.status.textContent = `Could not build the cover: ${err.message}`;
  } finally {
    el.downloadCover.disabled = false;
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "book";
const escapeHtml = (s) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// ---------- events ----------

let timer = null;
const debounced = () => {
  clearTimeout(timer);
  timer = setTimeout(regenerate, 150);
};
// Large print is the biggest sub-niche in puzzle books. It was always possible
// (big trim, fewer words) but nobody found it, so make it one checkbox.
// Grid size is left automatic on purpose: pinning it to 15 made any pasted
// word over 15 letters vanish from the book. Measured 2026-09-14 over 240
// generated puzzles across eight word lists: fourteen words on an 8.5×11 page
// give 14–19 cells (median 16) and 18–25pt letters (median 22), against a
// median 14pt at 6×9. The spread is the word list, so do not quote a single
// number in public copy — see marketing/answers.md in the build-log repo,
// which has had to correct this twice off the round numbers here.
const LARGE_PRINT = { trim: "8.5x11", size: "", wpp: "14" };
el.largePrint.addEventListener("change", () => {
  if (!el.largePrint.checked) return;
  el.trim.value = LARGE_PRINT.trim;
  el.size.value = LARGE_PRINT.size;
  el.wpp.value = LARGE_PRINT.wpp;
  regenerate();
});
// Changing any of those by hand means you are no longer on the preset.
for (const id of ["trim", "size", "wpp"]) {
  el[id].addEventListener("change", () => {
    const onPreset = el.trim.value === LARGE_PRINT.trim && el.size.value === LARGE_PRINT.size && el.wpp.value === LARGE_PRINT.wpp;
    if (!onPreset) el.largePrint.checked = false;
  });
}

el.kind.addEventListener("change", () => {
  refreshKind();
  regenerate();
});
for (const id of ["9", "6", "4"]) {
  const v = SUDOKU_SIZES[id];
  const o = document.createElement("option");
  o.value = id;
  o.textContent = v.label;
  if (id === "9") o.selected = true;
  el.sudokuSize.append(o);
}
el.sudokuSize.addEventListener("change", () => {
  refreshKind(); // clue counts in the difficulty labels follow the size
  regenerate();
});

for (const id of ["title", "subtitle", "author", "trim", "paper", "list", "ink", "count", "bleed", "custom", "customTitle", "wpp", "difficulty", "size", "seed"]) {
  el[id].addEventListener("input", debounced);
  el[id].addEventListener("change", debounced);
}
// The untouched subtitle counts the puzzles, so it has to follow the count.
el.count.addEventListener("input", refreshKind);
el.themes.addEventListener("change", debounced);
el.reshuffle.addEventListener("click", () => {
  el.seed.value = randomSeed();
  regenerate();
});
el.prev.addEventListener("click", () => { px("browsed"); shown = Math.max(0, shown - 1); showPuzzle(); });
el.next.addEventListener("click", () => { px("browsed"); shown = Math.min(book.puzzles.length - 1, shown + 1); showPuzzle(); });
el.download.addEventListener("click", download);
el.downloadCover.addEventListener("click", downloadCover);

// The two beacons that are about the page rather than about a button.
//
// "tool": the generator itself came on screen. On a phone the hero is most of
// a screen and the form is under it, so this is the line between "read the
// pitch and left" and "got to the thing and did not use it". On a desktop it
// fires immediately, which is the correct answer there.
{
  const main = document.getElementById("tool");
  if (main && "IntersectionObserver" in window) {
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) { px("tool"); io.disconnect(); }
    }, { threshold: 0 });
    io.observe(main);
  } else if (main) {
    px("tool");
  }
}
// "touched": operated any control at all. Capture phase and one listener for
// the whole form, so it cannot drift out of step as controls are added — and
// scoped to #tool so the unlock dialog's email field is not in it.
for (const type of ["input", "change"]) {
  document.addEventListener(type, (e) => {
    if (e.target?.closest?.("#tool")) px("touched");
  }, true);
}
el.closeDialog.addEventListener("click", closeUnlock);

// The support address is the way out of every refusal here, and on a phone a
// plain string is not a way out — it is something to memorise and retype.
// Built from text nodes rather than innerHTML: the message comes from the
// server, and it is never worth parsing server text as markup to save a line.
const SUPPORT = "support@bananafest-destiny.com";
function showUnlockError(message) {
  el.unlockErr.textContent = "";
  const at = message.indexOf(SUPPORT);
  if (at === -1) {
    el.unlockErr.textContent = message;
    return;
  }
  const link = document.createElement("a");
  link.href = `mailto:${SUPPORT}`;
  link.textContent = SUPPORT;
  el.unlockErr.append(message.slice(0, at), link, message.slice(at + SUPPORT.length));
}

async function attemptVerify(email) {
  const rec = await verifyEmail(email);
  sessionLicense = rec; // so this tab stays unlocked even if storage is refused
  const stored = setLicense(rec);
  closeUnlock();
  refreshTier(stored ? "" : "storage");
  regenerate();
}

// Somebody back from Stripe seconds ago can genuinely arrive before the
// session is recorded, and telling them their payment does not exist is the
// wrong answer. But it is only the right answer for a while: the other way
// to reach this branch is a buyer typing a different address from the one on
// the receipt, and for them "the payment isn't recorded yet" is never true —
// it is permanently wrong, and leaving them staring at pure reassurance for
// the whole AUTO_RETRY_CEILING_MS with no way out is its own failure. So this
// still retries the whole time, but the message itself splits in two: quiet
// reassurance at first, then — once it has run long enough that a real typo
// is at least as likely as a real lag — the same message plus the support
// address, so a stuck buyer has an exit without the retrying ever stopping
// under them. Only past the ceiling does it give up and hand over the plain,
// unhedged message.
const SOFT_MENTION_AFTER_MS = 60000;
// "No completed payment" is not the only answer that means "try again, not
// never": a 429 ("Too many tries in a row...") or a 502 ("Could not reach the
// payment provider...") are exactly as transient, and the server's own text
// already says so. The first version of this only retried on the first one —
// so a single rate-limit reply during the retry window (which itself calls
// /api/verify every AUTO_RETRY_INTERVAL_MS) fell straight through to a
// permanent dead end with no support-email mention and no further retries,
// even though the server had just said "wait a minute and press Unlock
// again". Confirmed live: that exact gap produced a real payer stuck for the
// whole 5-minute ceiling with no visible message change at all.
const RETRYABLE = /No completed payment|Too many tries in a row|Could not reach the payment provider/i;
function handleVerifyFailure(email, err) {
  // Not gated on el.justPaid: that only reflects whether *this* dialog-open
  // happened to be the one auto-triggered by a ?paid=1 redirect. A buyer who
  // pays, closes that dialog, and reopens Unlock manually a minute later —
  // or, it turns out, the TEST-mode payment link's own redirect, which does
  // not carry ?paid=1 the way the live link does — hits the exact same
  // Stripe lag and deserves the exact same patient retry, not an immediate
  // dead end. The two-stage message (and the support-email mention from
  // SOFT_MENTION_AFTER_MS on) is what protects a genuinely-wrong-email buyer
  // from being stuck forever, regardless of how they got to this dialog.
  const race = RETRYABLE.test(err.message);
  if (race) {
    if (!autoRetryFirstFailAt) autoRetryFirstFailAt = Date.now();
    const elapsed = Date.now() - autoRetryFirstFailAt;
    if (elapsed < AUTO_RETRY_CEILING_MS) {
      showUnlockError(
        elapsed < SOFT_MENTION_AFTER_MS
          ? "Stripe has not finished recording that payment yet — your money is fine. " +
              "Checking again automatically; you don't need to press anything."
          : "Still checking with Stripe — this can take a few minutes right after paying, " +
              "and we keep trying automatically. If you are sure that is not the email on " +
              `your receipt, email ${SUPPORT} and we will find it and sort it out by hand.`,
      );
      stopAutoRetry();
      autoRetryTimer = setTimeout(async () => {
        autoRetryTimer = null;
        try {
          await attemptVerify(email);
        } catch (err2) {
          handleVerifyFailure(email, err2);
        }
      }, AUTO_RETRY_INTERVAL_MS);
      return;
    }
  }
  showUnlockError(err.message);
}

el.verify.addEventListener("click", async () => {
  const email = el.email.value.trim();
  if (!email.includes("@")) {
    showUnlockError("Enter the email you used at checkout.");
    return;
  }
  stopAutoRetry();
  el.verify.disabled = true;
  el.unlockErr.textContent = "";
  try {
    await attemptVerify(email);
  } catch (err) {
    handleVerifyFailure(email, err);
  } finally {
    el.verify.disabled = false;
  }
});

// The pricing block's Buy button opens the same dialog as the tier link.
document.getElementById("buyNow")?.addEventListener("click", (e) => {
  e.preventDefault();
  if (getLicense()) {
    document.getElementById("tool").scrollIntoView({ behavior: "smooth" });
    return;
  }
  openUnlock();
});

refreshTier();
// The type pages link here as /?kind=sudoku#tool: land with that type already
// chosen, so the first thing shown is the kind of book they came for.
{
  const q = new URLSearchParams(location.search);
  const kind = q.get("kind");
  if (kind && [...el.kind.options].some((o) => o.value === kind)) {
    el.kind.value = kind;
    refreshKind();
  }
  // The word-list pages link as /?theme=halloween#tool: that theme, only.
  const theme = q.get("theme");
  if (theme && THEMES[theme]) {
    for (const cb of el.themes.querySelectorAll("input")) cb.checked = cb.value === theme;
    if (!titleEdited) el.title.value = `${THEMES[theme].title} Word Search`;
  }
  // The calculators link as /?trim=6x9&count=120#tool.
  //
  // 2026-09-21: the boss's Search Console says the only page of this site that
  // has ever appeared in a live search is one of the calculators, and the only
  // page bingbot fetched in a day was /royalty-calculator. Search will carry
  // the free utilities before it carries the tool, so the calculators are the
  // front door whether or not they were meant to be.
  //
  // Somebody who arrives there has just typed the two things this form asks
  // for first — their trim size and their page count — into a different box on
  // the same site. Making them type it again is the same defect as the hero
  // CTA landing five screens above the Download button: the work is already
  // done, and the page throws it away. Carry it across instead.
  const trim = q.get("trim");
  if (trim && [...el.trim.options].some((o) => o.value === trim)) el.trim.value = trim;
  // Page count is not puzzle count — a book is puzzles plus solutions plus
  // front matter — so the calculators send `count` already converted by the
  // same planner the book uses, not the raw number from their own box.
  const count = Number(q.get("count"));
  if (Number.isInteger(count) && count >= 1 && count <= 200) el.count.value = String(count);
  // The royalty page also asks for ink and a list price, and the spine page
  // asks for paper. Every one of those is a control on this form with the same
  // values, so carry them too — the money figures under the preview then match
  // the ones they were just looking at, instead of quoting a different book.
  const ink = q.get("ink");
  if (ink && [...el.ink.options].some((o) => o.value === ink)) el.ink.value = ink;
  const paper = q.get("paper");
  if (paper && [...el.paper.options].some((o) => o.value === paper)) el.paper.value = paper;
  const list = Number(q.get("list"));
  if (Number.isFinite(list) && list > 0 && list < 1000) el.list.value = list.toFixed(2);
  // The margin page draws the gutter with bleed on or off; arrive with the one
  // they were looking at, not the default.
  if (q.get("bleed")) el.bleed.checked = true;
  // The large-print landing page links as /?largePrint=1#tool: same checkbox
  // a visitor would tick by hand, just pre-ticked so the first render is
  // already the large-print preset, not the default they'd have to find.
  if (q.get("largePrint") && el.kind.value === "wordsearch") {
    el.largePrint.checked = true;
    el.largePrint.dispatchEvent(new Event("change"));
  }
}
regenerate();

// Stripe's payment link sends the buyer back to /?paid=1. Open the unlock
// dialog so the next step is obvious.
if (new URLSearchParams(location.search).get("paid") && !getLicense()) {
  history.replaceState(null, "", location.pathname);
  openUnlock({ justPaid: true });
}

// Warm the heavy chunk while nobody is waiting.
//
// Measured against production on a phone at slow-4G speeds: the landing is
// cheap — 124 KiB and a usable preview grid in about a second. The expensive
// moment is the first press of Make my book, which pulls 2.1 MB it has not
// touched yet: pdf-lib and fontkit in one 1.3 MB chunk, plus two 400 KB
// TrueType files. At cell-network speeds that is roughly ten seconds of
// downloading before a single puzzle is laid out, and it arrives at the exact
// moment somebody has decided they want the thing.
//
// So pull the chunk during the idle time after the first render, while the
// visitor is reading and the connection is doing nothing. See pdf/heavy.js for
// why the warm-up goes through its own module instead of render.js: the launch
// dashboard reads the funnel out of request paths, and warming render.js would
// have made every visitor look like somebody who made a book. The fonts are
// deliberately not warmed here — they are fetched at the click instead, in
// parallel with puzzle generation, so they cost nothing speculatively and
// nothing on the clock either.
//
// Not on a metered connection. Save-Data is a person explicitly saying do not
// spend my bytes on things I did not ask for, and 2G is a connection where
// speculatively spending a megabyte could cost them the page they are on.
// Those two pay the wait at the click, which is what they asked for.
{
  const net = navigator.connection || {};
  const stingy = net.saveData === true || /^(slow-)?2g$/.test(net.effectiveType || "");
  if (!stingy) {
    const warm = () => { import("../pdf/heavy.js").catch(() => {}); };
    // requestIdleCallback is still missing from Safari, where this matters
    // most; a timer after load is the portable version of the same idea.
    const schedule = () =>
      typeof requestIdleCallback === "function"
        ? requestIdleCallback(warm, { timeout: 4000 })
        : setTimeout(warm, 1200);
    if (document.readyState === "complete") schedule();
    else addEventListener("load", schedule, { once: true });
  }
}
