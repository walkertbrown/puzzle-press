// One page per built-in theme: the full word list, a real puzzle made from it
// (inline SVG, so the letters are content, not a picture), how many puzzles
// the list supports, and a button that opens the tool with that theme ticked.
// Everything comes from wordlists.js and the generator, so a page can never
// show a list the product does not have.
//
// Usage: node scripts/word-list-pages.mjs  → public/word-lists/index.html + one per theme
import { mkdirSync, writeFileSync } from "node:fs";
import { THEMES } from "../src/generator/wordlists.js";
import { removeNested, normalizeWords } from "../src/generator/wordsearch.js";
import { distinctSetsPossible, generateBook } from "../src/generator/book.js";
import { planPages, solutionsPerPageFor, solutionsThatFit } from "../src/pdf/layout.js";
import { pageGeometry } from "../src/pdf/kdp.js";

const SITE = "https://puzzlepress.bananafest-destiny.com";
const WPP = 15; // words per puzzle, the tool's default
const outDir = new URL("../public/word-lists/", import.meta.url).pathname;
mkdirSync(outDir, { recursive: true });
const fits = solutionsThatFit(pageGeometry({ trim: "6x9", bleed: false }));
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const cap = (w) => w.charAt(0).toUpperCase() + w.slice(1);

const favicon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231d3557'/%3E%3Ctext x='16' y='22' font-family='sans-serif' font-weight='700' font-size='18' fill='white' text-anchor='middle'%3EP%3C/text%3E%3C/svg%3E`;
const css = `
  :root { --ink:#1a1a1a; --muted:#5c6470; --line:#d9dde3; --bg:#f6f7f9; --card:#fff; --accent:#1d3557; }
  * { box-sizing: border-box; }
  html, body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  a { color: var(--accent); }
  header { padding:18px 24px; border-bottom:1px solid var(--line); background:var(--card); display:flex; gap:16px; align-items:baseline; flex-wrap:wrap; }
  header strong { font-size:18px; } header .spacer { flex:1; }
  main { max-width:860px; margin:0 auto; padding:32px 24px 8px; }
  h1 { font-size:clamp(26px,4vw,36px); line-height:1.15; letter-spacing:-0.02em; margin:0 0 10px; }
  h2 { font-size:21px; margin:28px 0 8px; }
  .lede { color:var(--muted); margin:0 0 18px; font-size:17px; }
  .btn { display:inline-block; text-decoration:none; font-weight:600; padding:12px 20px; border-radius:8px; background:var(--accent); color:#fff; border:1px solid var(--accent); }
  .actions { display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin:0 0 6px; }
  .fine { color:var(--muted); font-size:14px; }
  .words { columns: 3; column-gap: 24px; list-style: none; padding: 0; margin: 0 0 8px; font-size:15px; }
  .words li { break-inside: avoid; padding: 2px 0; border-bottom: 1px solid var(--line); }
  @media (max-width:600px) { .words { columns: 2; } }
  .puzzle { background:var(--card); border:1px solid var(--line); border-radius:10px; padding:18px; max-width:560px; }
  .puzzle svg { width:100%; height:auto; display:block; }
  .puzzle .wl { columns:3; font-size:13px; margin:12px 0 0; padding:0; list-style:none; text-transform:uppercase; letter-spacing:.04em; }
  .all { columns: 3; column-gap: 24px; list-style:none; padding:0; margin:0; } @media (max-width:600px) { .all { columns: 2; } }
  .all li { padding: 3px 0; }
  .cta { margin:34px 0 10px; padding:22px; background:var(--card); border:1px solid var(--line); border-radius:12px; }
  .cta h2 { margin:0 0 6px; font-size:20px; } .cta p { margin:0 0 14px; color:var(--muted); }
  footer { color:var(--muted); font-size:13px; text-align:center; padding:30px 24px; border-top:1px solid var(--line); background:var(--card); margin-top:30px; }
  footer a { color: var(--muted); }
`;

const shell = ({ title, description, path, ogImage, body, jsonld }) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<link rel="canonical" href="${SITE}${path}">
<meta property="og:type" content="website">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:url" content="${SITE}${path}">
<meta property="og:image" content="${SITE}${ogImage}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${favicon}">
<style>${css}</style>
<script type="application/ld+json">
${JSON.stringify(jsonld, null, 2)}
</script>
</head>
<body>
<header>
  <strong><a href="/" style="text-decoration:none;color:inherit">Puzzle Press</a></strong>
  <span class="spacer"></span>
  <a href="/word-lists/">All word lists</a>
  <a href="/word-search-book-generator">Word search books</a>
  <a href="/how-to-make-a-puzzle-book">Guide</a>
</header>
<main>
${body}
</main>
<footer>
  <p><strong>Puzzle Press</strong> — a <a href="https://bananafest-destiny.com">Bananafest Destiny</a> app. <a href="/#terms">Terms</a> · <a href="/word-lists/">Word lists</a> · <a href="/word-search-book-generator">Word search</a> · <a href="/sudoku-book-generator">Sudoku</a> · <a href="/maze-book-generator">Mazes</a> · <a href="mailto:support@bananafest-destiny.com">support@bananafest-destiny.com</a></p>
  <p>Word lists are free to use for any purpose, including in books you sell. Not affiliated with Amazon. KDP is a trademark of Amazon.com, Inc.</p>
</footer>
</body>
</html>
`;

// A puzzle as SVG: letters, a light grid, and the word list beneath. Solutions
// are not drawn — this is the puzzle a buyer would print, not the answer key.
const svgPuzzle = (p) => {
  const n = p.size, cell = 30, pad = 4, W = n * cell + pad * 2;
  const rows = [];
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      rows.push(`<text x="${pad + c * cell + cell / 2}" y="${pad + r * cell + cell / 2 + 6}" text-anchor="middle">${p.grid[r][c]}</text>`);
    }
  }
  return `<svg viewBox="0 0 ${W} ${W}" role="img" aria-label="A ${n} by ${n} word search grid">
  <rect x="${pad}" y="${pad}" width="${n * cell}" height="${n * cell}" fill="#fff" stroke="#1a1a1a" stroke-width="1.5"/>
  <g font-family="ui-monospace,Menlo,Consolas,monospace" font-size="17" fill="#1a1a1a">${rows.join("")}</g>
</svg>`;
};

const themePage = (id, t) => {
  const words = t.words.map((w) => w.toLowerCase()).sort();
  const n = words.length;
  const sets = distinctSetsPossible(n, Math.min(WPP, n), 500);
  const bookOf = Math.min(sets, 100);
  const pages = planPages(bookOf, solutionsPerPageFor(bookOf, fits)).total;
  // The same pipeline the tool uses: one puzzle of a one-theme book.
  const puzzle = generateBook({ pools: [t], count: 1, wordsPerPuzzle: WPP, difficulty: "medium", size: 15, seed: `list-${id}` }).puzzles[0];
  const nested = removeNested(normalizeWords(t.words)).dropped.map((d) => ({ word: d.word, host: d.reason.replace("inside ", "") }));
  const title = `${t.title} Word Search Word List — ${n} Words, Free`;
  const description = `${n} ${t.title.toLowerCase()} words for a word search: ${words.slice(0, 6).map(cap).join(", ")} and more. Free to use in puzzles you make or sell, with a sample ${puzzle.size}×${puzzle.size} puzzle and a tool that turns the list into a whole KDP book.`;
  const body = `
  <h1>${esc(t.title)} word search word list</h1>
  <p class="lede">${n} words, hand-picked to fit a ${puzzle.size}×${puzzle.size} grid. Free to use in any puzzle you make, including ones you sell.${nested.length ? ` One thing to know if you build grids by hand: ${nested.map((d) => `${d.word} sits inside ${d.host}`).join(", ")} — never put both in the same puzzle, or the shorter one is found twice. The generator keeps them apart automatically.` : ""}</p>
  <div class="actions">
    <a class="btn" href="/?theme=${id}#tool">Make a ${esc(t.title)} word search book</a>
    <a href="/word-lists/">All 32 lists</a>
  </div>
  <p class="fine">The button opens the free generator with this theme selected. It draws ${WPP} words per puzzle and can make ${sets >= 500 ? "hundreds of" : sets} different puzzles from this list without repeating a set — a ${bookOf}-puzzle book comes to ${pages} pages at 6 × 9.</p>

  <h2>The list</h2>
  <ul class="words">
    ${words.map((w) => `<li>${cap(w)}</li>`).join("\n    ")}
  </ul>
  <p class="fine">Copy freely. One per line or comma-separated pastes straight into the generator's "Your own list" box if you want to add or remove words.</p>

  <h2>A puzzle made from it</h2>
  <div class="puzzle">
    ${svgPuzzle(puzzle)}
    <ul class="wl">${puzzle.words.map((w) => `<li>${w}</li>`).join("")}</ul>
  </div>
  <p class="fine">Medium difficulty: across, down and diagonals, nothing backwards. Every word appears exactly once — the generator checks the finished grid rather than assuming. Solutions are in the book, not on this page.</p>

  <div class="cta">
    <h2>Turn it into a book</h2>
    <p>Puzzle Press makes the whole paperback for Amazon KDP — this theme or several mixed, graded easy to hard if you like, solutions at the back, margins and page count to KDP's rules — then the cover. Free to use; the free book is watermarked and $19 once removes the mark.</p>
    <a class="btn" href="/?theme=${id}#tool">Make a ${esc(t.title)} word search book free</a>
  </div>`;
  const jsonld = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    name: `${t.title} word search word list`,
    url: `${SITE}/word-lists/${id}`,
    description,
    isPartOf: { "@type": "WebSite", name: "Puzzle Press", url: `${SITE}/` },
  };
  return shell({ title, description, path: `/word-lists/${id}`, ogImage: `/cards/word-list-${id}.png`, body, jsonld });
};

const ids = Object.keys(THEMES);
for (const id of ids) writeFileSync(`${outDir}${id}.html`, themePage(id, THEMES[id]));

const total = ids.reduce((a, id) => a + THEMES[id].words.length, 0);
const index = shell({
  title: "Word Search Word Lists — 32 Themes, Free to Use",
  description: `${total} words across 32 themed lists — animals, Halloween, Christmas, dinosaurs, gardening and more — each sized for a 15×15 word search. Free for any use, with a generator that turns any list into a KDP book.`,
  path: "/word-lists/",
  ogImage: "/cards/word-lists.png",
  jsonld: {
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: "Word search word lists",
    url: `${SITE}/word-lists/`,
    hasPart: ids.map((id) => ({ "@type": "WebPage", name: `${THEMES[id].title} word search word list`, url: `${SITE}/word-lists/${id}` })),
  },
  body: `
  <h1>Word search word lists</h1>
  <p class="lede">${ids.length} themed lists, ${total} words, each sized for a 15×15 grid. These are the lists built into Puzzle Press; they are free to use anywhere, including in books you sell.</p>
  <ul class="all">
    ${ids.map((id) => `<li><a href="/word-lists/${id}">${esc(THEMES[id].title)}</a> <span class="fine">(${THEMES[id].words.length})</span></li>`).join("\n    ")}
  </ul>
  <div class="cta">
    <h2>Any list into a book</h2>
    <p>Pick a theme, or several, or paste your own list — Puzzle Press lays out a complete word search paperback for Amazon KDP, solutions included, then the cover. Free to use.</p>
    <a class="btn" href="/?kind=wordsearch#tool">Make a word search book free</a>
  </div>`,
});
writeFileSync(`${outDir}index.html`, index);
console.log(`wrote public/word-lists/ — ${ids.length} theme pages + index (${total} words)`);
