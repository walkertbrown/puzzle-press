import { THEMES } from "../generator/wordlists.js";
import { generateBook } from "../generator/book.js";
import { generateSudokuBook, generateSudokuBookAsync, SUDOKU_DIFFICULTY } from "../generator/sudoku.js";
import { generateMazeBook, wallSegments, MAZE_DIFFICULTY } from "../generator/maze.js";
import { TRIMS } from "../pdf/kdp.js";
// pdf-lib and fontkit are about 90% of this bundle and are only needed once
// somebody actually asks for a file, so they load on the first download
// instead of before the page is usable.
import { planPages, solutionsThatFit, solutionsPerPageFor, puzzlesForMinimum } from "../pdf/layout.js";

let pdfModules = null;
async function loadPdf() {
  if (!pdfModules) {
    const [render, cover] = await Promise.all([import("../pdf/render.js"), import("../pdf/cover.js")]);
    pdfModules = { renderBook: render.renderBook, renderCover: cover.renderCover };
  }
  return pdfModules;
}
import { coverGeometry, spineWidthInches, SPINE_TEXT_MIN_PAGES } from "../pdf/cover-geometry.js";
import { royalty } from "../pdf/kdp-cost.js";
import { pageGeometry } from "../pdf/kdp.js";
import { FREE_LIMIT, PRICE_LABEL, getLicense, setLicense, verifyEmail } from "./license.js";

// The pay link is injected by the Worker at request time (config.js) or is
// absent in local dev. No link, no Buy button.
const PAY_URL = window.PUZZLE_PRESS_PAY_URL || "";

const $ = (id) => document.getElementById(id);
const el = {
  title: $("title"), subtitle: $("subtitle"), author: $("author"), trim: $("trim"), count: $("count"), bleed: $("bleed"),
  themes: $("themes"), custom: $("custom"), customTitle: $("customTitle"),
  wpp: $("wpp"), difficulty: $("difficulty"), size: $("size"), seed: $("seed"), largePrint: $("largePrint"), kind: $("kind"),
  download: $("download"), downloadCover: $("downloadCover"), coverNote: $("coverNote"), moneyNote: $("moneyNote"), list: $("list"), ink: $("ink"), paper: $("paper"), reshuffle: $("reshuffle"), status: $("status"), tier: $("tier"), warnings: $("warnings"),
  meta: $("meta"), lengthWarn: $("lengthWarn"), page: $("page"), prev: $("prev"), next: $("next"), navLabel: $("navLabel"),
  dialog: $("unlockDialog"), dialogTitle: $("dialogTitle"), dialogLede: $("dialogLede"), buyLine: $("buyLine"), email: $("email"), unlockErr: $("unlockErr"), verify: $("verify"), closeDialog: $("closeDialog"),
};

let book = null;
let shown = 0;
let fontsPromise = null;

// ---------- setup ----------

for (const [id, t] of Object.entries(TRIMS)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = t.label + (id === "6x9" ? " (most common)" : "");
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
  easy: "Easy — across and down",
  medium: "Medium — plus diagonals",
  hard: "Hard — all directions, backwards too",
  graded: "Graded — easy at the front, hard at the back",
};
const GRADED_LABEL = "Graded — easy at the front, expert at the back";

function refreshKind() {
  const kind = el.kind.value;
  const wordless = kind !== "wordsearch";
  for (const node of document.querySelectorAll(".ws-only")) node.classList.toggle("hidden", wordless);
  const opts =
    kind === "sudoku"
      ? { ...Object.fromEntries(Object.entries(SUDOKU_DIFFICULTY).map(([k, v]) => [k, `${v.label} — ${v.givens} clues`])), graded: GRADED_LABEL }
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
  if (wordless) el.largePrint.checked = false;
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
  const customWords = el.custom.value.split(/[\n,;]+/).map((w) => w.trim()).filter(Boolean);
  if (customWords.length >= 2) pools.push({ title: el.customTitle.value.trim() || "My Words", words: customWords });
  const n = (v, lo, hi, d) => Math.min(hi, Math.max(lo, parseInt(v, 10) || d));
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
    size: el.size.value ? n(el.size.value, 8, 30, 15) : null,
    seed: el.seed.value.trim() || "book",
    pools,
  };
}

// ---------- generate + preview ----------

function regenerate() {
  const s = settings();
  if (s.kind === "maze") {
    book = generateMazeBook({ count: Math.min(s.count, 3), difficulty: s.difficulty, seed: s.seed });
    shown = 0;
    showPuzzle();
    showMeta(s);
    el.warnings.textContent = "";
    return;
  }
  if (s.kind === "sudoku") {
    // Only a few, and only for the preview — an expert puzzle is real work.
    book = generateSudokuBook({ count: Math.min(s.count, 3), difficulty: s.difficulty, seed: s.seed });
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
  book = generateBook({ ...s, count: previewCount });
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
  el.meta.textContent =
    `${effective} puzzle${effective === 1 ? "" : "s"} · ${TRIMS[s.trim].label} · ${pages} pages`;

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
  if (!book || !book.puzzles.length) return;
  const p = book.puzzles[shown];
  if (p.kind === "sudoku") return showSudoku(p);
  if (p.kind === "maze") return showMaze(p);
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
  el.navLabel.textContent = `${shown + 1} / ${book.puzzles.length} (preview)`;
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

// The free tier no longer shortens a book — it watermarks it — so what is
// quoted on screen is simply what you asked for.
function effectiveCount(requested) {
  return requested;
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
  el.navLabel.textContent = `${shown + 1} / ${book.puzzles.length} (preview)`;
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

function showSudoku(p) {
  const grid = document.createElement("div");
  grid.className = "sudoku";
  p.puzzle.forEach((v, i) => {
    const d = document.createElement("div");
    d.textContent = v || "";
    const c = i % 9;
    const r = Math.floor(i / 9);
    if (c === 2 || c === 5) d.classList.add("br");
    if (r === 2 || r === 5) d.classList.add("bb");
    grid.append(d);
  });
  const h = document.createElement("h3");
  h.append(`Puzzle ${p.index}`, Object.assign(document.createElement("span"), { textContent: `${p.title} · ${p.givens} clues` }));
  el.page.replaceChildren(h, grid);
  el.navLabel.textContent = `${shown + 1} / ${book.puzzles.length} (preview)`;
  el.prev.disabled = shown === 0;
  el.next.disabled = shown >= book.puzzles.length - 1;
}

// ---------- tier ----------

function refreshTier() {
  const lic = getLicense();
  if (lic) {
    el.tier.className = "tier licensed";
    el.tier.innerHTML = `<b>Unlocked</b> for ${escapeHtml(lic.email)}. Unlimited puzzles, no watermark.`;
  } else {
    el.tier.className = "tier";
    el.tier.innerHTML = `<b>Free:</b> full-length books, with one small line in the footer of every page and a cover marked PREVIEW. ` +
      `<a href="#" id="unlockLink">Remove both — ${PRICE_LABEL}</a>`;
    el.tier.querySelector("#unlockLink").addEventListener("click", (e) => {
      e.preventDefault();
      openUnlock();
    });
  }
}

function openUnlock({ justPaid = false } = {}) {
  el.unlockErr.textContent = "";
  el.dialogTitle.textContent = justPaid ? "Thanks — one last step" : "Unlock full books";
  el.dialogLede.textContent = justPaid
    ? "Enter the email you used at checkout and everything unlocks on this device."
    : "Pay once, make unlimited books with no watermark. After paying, enter the email you used at checkout.";
  if (justPaid) {
    // Offering to sell again to somebody who has just paid reads as a failed
    // payment. Show them the next step instead.
    el.buyLine.textContent = "";
  } else if (PAY_URL) {
    el.buyLine.innerHTML = `<a href="${escapeHtml(PAY_URL)}" target="_blank" rel="noopener"><b>Buy now — ${PRICE_LABEL}</b></a> (opens Stripe checkout)`;
  } else {
    el.buyLine.textContent = "Checkout is not available yet.";
  }
  el.justPaid = justPaid;
  el.dialog.showModal();
  el.email.focus();
}

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
  const s = settings();
  if (s.pools.length === 0) return;
  const lic = getLicense();
  const count = s.count;
  el.download.disabled = true;
  try {
    el.status.textContent = `Generating ${count} puzzles…`;
    await tick();
    const full = s.kind === "sudoku"
      ? await generateSudokuBookAsync({ ...s, count }, (done, total) => {
          el.status.textContent = `Generating puzzle ${done} of ${total}…`;
        })
      : s.kind === "maze"
        ? generateMazeBook({ ...s, count })
        : generateBook({ ...s, count });
    el.warnings.textContent = full.warnings.join("\n");
    el.status.textContent = "Laying out pages…";
    await tick();
    const [fonts, { renderBook }] = await Promise.all([loadFonts(), loadPdf()]);
    const bytes = await renderBook(full, { ...s, licensed: Boolean(lic), fonts });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(s.title)}-${s.trim}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    el.status.textContent = `Done — ${full.puzzles.length} puzzles, ${(blob.size / 1024).toFixed(0)} KB.`;
  } catch (err) {
    console.error(err);
    el.status.textContent = `Something went wrong: ${err.message}`;
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
  try {
    el.status.textContent = "Building the cover…";
    await tick();
    const perPage = solutionsThatFit(pageGeometry({ trim: s.trim, bleed: s.bleed }));
    const pages = planPages(effectiveCount(s.count), perPage).total;
    const one = s.kind === "sudoku"
      ? generateSudokuBook({ ...s, count: 1 })
      : s.kind === "maze"
        ? generateMazeBook({ ...s, count: 1 })
        : generateBook({ ...s, count: 1 });
    const [fonts, { renderCover }] = await Promise.all([loadFonts(), loadPdf()]);
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
const LARGE_PRINT = { trim: "8.5x11", size: "15", wpp: "14" };
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

for (const id of ["title", "subtitle", "author", "trim", "paper", "list", "ink", "count", "bleed", "custom", "customTitle", "wpp", "difficulty", "size", "seed"]) {
  el[id].addEventListener("input", debounced);
  el[id].addEventListener("change", debounced);
}
el.themes.addEventListener("change", debounced);
el.reshuffle.addEventListener("click", () => {
  const WS_DIFFICULTY = {
  easy: "Easy — across and down",
  medium: "Medium — plus diagonals",
  hard: "Hard — all directions, backwards too",
  graded: "Graded — easy at the front, hard at the back",
};
const GRADED_LABEL = "Graded — easy at the front, expert at the back";

function refreshKind() {
  const kind = el.kind.value;
  const wordless = kind !== "wordsearch";
  for (const node of document.querySelectorAll(".ws-only")) node.classList.toggle("hidden", wordless);
  const opts =
    kind === "sudoku"
      ? { ...Object.fromEntries(Object.entries(SUDOKU_DIFFICULTY).map(([k, v]) => [k, `${v.label} — ${v.givens} clues`])), graded: GRADED_LABEL }
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
  if (wordless) el.largePrint.checked = false;
}

el.seed.value = randomSeed();
refreshKind();
  regenerate();
});
el.prev.addEventListener("click", () => { shown = Math.max(0, shown - 1); showPuzzle(); });
el.next.addEventListener("click", () => { shown = Math.min(book.puzzles.length - 1, shown + 1); showPuzzle(); });
el.download.addEventListener("click", download);
el.downloadCover.addEventListener("click", downloadCover);
el.closeDialog.addEventListener("click", () => el.dialog.close());
el.verify.addEventListener("click", async () => {
  const email = el.email.value.trim();
  if (!email.includes("@")) {
    el.unlockErr.textContent = "Enter the email you used at checkout.";
    return;
  }
  el.verify.disabled = true;
  el.unlockErr.textContent = "";
  try {
    setLicense(await verifyEmail(email));
    el.dialog.close();
    refreshTier();
    regenerate();
  } catch (err) {
    el.unlockErr.textContent =
      el.justPaid && /No completed payment/i.test(err.message)
        ? "Stripe has not finished recording that payment yet. Give it a few seconds and press Unlock again — your money is fine."
        : err.message;
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
regenerate();

// Stripe's payment link sends the buyer back to /?paid=1. Open the unlock
// dialog so the next step is obvious.
if (new URLSearchParams(location.search).get("paid") && !getLicense()) {
  history.replaceState(null, "", location.pathname);
  openUnlock({ justPaid: true });
}
