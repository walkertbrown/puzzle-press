import { THEMES } from "../generator/wordlists.js";
import { generateBook } from "../generator/book.js";
import { TRIMS } from "../pdf/kdp.js";
import { renderBook, planPages, solutionsThatFit } from "../pdf/render.js";
import { renderCover, coverGeometry, spineWidthInches, SPINE_TEXT_MIN_PAGES } from "../pdf/cover.js";
import { pageGeometry } from "../pdf/kdp.js";
import { FREE_LIMIT, PRICE_LABEL, getLicense, setLicense, verifyEmail } from "./license.js";

// The pay link is injected by the Worker at request time (config.js) or is
// absent in local dev. No link, no Buy button.
const PAY_URL = window.PUZZLE_PRESS_PAY_URL || "";

const $ = (id) => document.getElementById(id);
const el = {
  title: $("title"), subtitle: $("subtitle"), author: $("author"), trim: $("trim"), count: $("count"), bleed: $("bleed"),
  themes: $("themes"), custom: $("custom"), customTitle: $("customTitle"),
  wpp: $("wpp"), difficulty: $("difficulty"), size: $("size"), seed: $("seed"), largePrint: $("largePrint"),
  download: $("download"), downloadCover: $("downloadCover"), coverNote: $("coverNote"), paper: $("paper"), reshuffle: $("reshuffle"), status: $("status"), tier: $("tier"), warnings: $("warnings"),
  meta: $("meta"), page: $("page"), prev: $("prev"), next: $("next"), navLabel: $("navLabel"),
  dialog: $("unlockDialog"), buyLine: $("buyLine"), email: $("email"), unlockErr: $("unlockErr"), verify: $("verify"), closeDialog: $("closeDialog"),
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
el.seed.value = randomSeed();

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
    trim: el.trim.value,
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
  const perPage = solutionsThatFit(pageGeometry({ trim: s.trim, bleed: s.bleed }));
  const pages = planPages(s.count, perPage).total;
  el.meta.textContent = `${s.count} puzzles · ${TRIMS[s.trim].label} · ${pages} pages`;
  const spine = spineWidthInches(pages, s.paper);
  el.coverNote.textContent =
    `Cover: ${(coverGeometry({ trim: s.trim, pageCount: pages, paper: s.paper }).width / 72).toFixed(3)}" × ` +
    `${(coverGeometry({ trim: s.trim, pageCount: pages, paper: s.paper }).height / 72).toFixed(3)}" ` +
    `(spine ${spine.toFixed(3)}")` +
    (pages < SPINE_TEXT_MIN_PAGES ? ` — under ${SPINE_TEXT_MIN_PAGES} pages, so KDP wants the spine blank` : "");
  el.warnings.textContent = book.warnings.join("\n");
}

function showPuzzle() {
  if (!book || !book.puzzles.length) return;
  const p = book.puzzles[shown];
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

// ---------- tier ----------

function refreshTier() {
  const lic = getLicense();
  if (lic) {
    el.tier.className = "tier licensed";
    el.tier.innerHTML = `<b>Unlocked</b> for ${escapeHtml(lic.email)}. Unlimited puzzles, no watermark.`;
  } else {
    el.tier.className = "tier";
    el.tier.innerHTML = `<b>Free:</b> books up to ${FREE_LIMIT} puzzles, with a small footer line on each page. ` +
      `<a href="#" id="unlockLink">Unlock unlimited books — ${PRICE_LABEL}</a>`;
    el.tier.querySelector("#unlockLink").addEventListener("click", (e) => {
      e.preventDefault();
      openUnlock();
    });
  }
}

function openUnlock() {
  el.unlockErr.textContent = "";
  if (PAY_URL) {
    el.buyLine.innerHTML = `<a href="${escapeHtml(PAY_URL)}" target="_blank" rel="noopener"><b>Buy now — ${PRICE_LABEL}</b></a> (opens Stripe checkout)`;
  } else {
    el.buyLine.textContent = "Checkout is not available yet.";
  }
  el.dialog.showModal();
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
  let count = s.count;
  if (!lic && count > FREE_LIMIT) {
    count = FREE_LIMIT;
    el.status.textContent = `Free tier: making ${FREE_LIMIT} of ${s.count} puzzles.`;
  }
  el.download.disabled = true;
  try {
    el.status.textContent = `Generating ${count} puzzles…`;
    await tick();
    const full = generateBook({ ...s, count });
    el.warnings.textContent = full.warnings.join("\n");
    el.status.textContent = "Laying out pages…";
    await tick();
    const fonts = await loadFonts();
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
  if (!getLicense()) {
    openUnlock();
    return;
  }
  const s = settings();
  if (s.pools.length === 0) return;
  el.downloadCover.disabled = true;
  try {
    el.status.textContent = "Building the cover…";
    await tick();
    const perPage = solutionsThatFit(pageGeometry({ trim: s.trim, bleed: s.bleed }));
    const pages = planPages(s.count, perPage).total;
    const one = generateBook({ ...s, count: 1 });
    const fonts = await loadFonts();
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
      fonts,
    });
    const blob = new Blob([bytes], { type: "application/pdf" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = `${slug(s.title)}-cover-${s.trim}.pdf`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    el.status.textContent = `Cover ready — sized for ${pages} pages on ${s.paper === "cream" ? "cream" : "white"} paper.`;
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

for (const id of ["title", "subtitle", "author", "trim", "paper", "count", "bleed", "custom", "customTitle", "wpp", "difficulty", "size", "seed"]) {
  el[id].addEventListener("input", debounced);
  el[id].addEventListener("change", debounced);
}
el.themes.addEventListener("change", debounced);
el.reshuffle.addEventListener("click", () => {
  el.seed.value = randomSeed();
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
  } catch (err) {
    el.unlockErr.textContent = err.message;
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
  openUnlock();
}
