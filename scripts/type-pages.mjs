// One landing page per puzzle type, written for the search a buyer actually
// types ("sudoku book generator", not "KDP puzzle book"). Every figure on the
// pages — page counts, print costs, clue counts, maze sizes, theme count —
// comes from the code that makes the books, so the pages cannot drift from
// the product. Each page says what is specific to its type; what is common
// to all three lives on the guide and is linked, not repeated.
//
// Usage: node scripts/type-pages.mjs   → public/{word-search,sudoku,maze}-book-generator.html
import { writeFileSync } from "node:fs";
import { planPages, solutionsPerPageFor, solutionsThatFit, FLAT_RATE_PAGES } from "../src/pdf/layout.js";
import { pageGeometry, MIN_PAGES } from "../src/pdf/kdp.js";
import { printingCost, royalty } from "../src/pdf/kdp-cost.js";
import { SUDOKU_DIFFICULTY } from "../src/generator/sudoku.js";
import { MAZE_DIFFICULTY } from "../src/generator/maze.js";
import { CRISSCROSS_DIFFICULTY } from "../src/generator/crisscross.js";
import { THEMES } from "../src/generator/wordlists.js";
import { DIFFICULTY as WS_DIFFICULTY } from "../src/generator/wordsearch.js";

const SITE = "https://puzzlepress.bananafest-destiny.com";
const fits = solutionsThatFit(pageGeometry({ trim: "6x9", bleed: false }));
const row = (n) => {
  const p = planPages(n, solutionsPerPageFor(n, fits));
  const c = printingCost({ trim: "6x9", pages: p.total, ink: "black" }).cost;
  const r = royalty({ list: 9.99, trim: "6x9", pages: p.total, ink: "black" }).royalty;
  return `<tr><td>${n}</td><td>${p.total}</td><td>$${c.toFixed(2)}</td><td>$${r.toFixed(2)}</td></tr>`;
};
const costTable = `
    <table>
      <tr><th>Puzzles</th><th>Pages (6 × 9)</th><th>Prints for</th><th>You keep at $9.99</th></tr>
      ${[20, 50, 100].map(row).join("\n      ")}
    </table>
    <p class="fine">Page count is title, copyright, one puzzle per page, a divider, solutions ${fits} to a page, and four notes pages, rounded to an even number. Printing is KDP's flat rate up to ${FLAT_RATE_PAGES} pages, then about a penny a page. <a href="/royalty-calculator">Royalty calculator</a> for other prices and trims.</p>`;

const themeNames = Object.values(THEMES).map((t) => t.title);
const wsDirs = { easy: WS_DIFFICULTY.easy.dirs.length, medium: WS_DIFFICULTY.medium.dirs.length, hard: WS_DIFFICULTY.hard.dirs.length };

const pages = {
  "word-search-book-generator": {
    title: "Word Search Book Generator for Amazon KDP — Print-Ready PDF, Free",
    description: `Make a whole word search puzzle book for KDP in your browser: ${themeNames.length} themes or your own word list, graded easy to hard, solutions included, laid out to KDP's rules. Free to use.`,
    h1: "Word search book generator for Amazon KDP",
    lede: `Paste a word list or pick from ${themeNames.length} themes, choose how many puzzles, and download a paperback interior that meets KDP's manuscript rules — then the matching cover. Free to use; the free book is watermarked.`,
    kind: "wordsearch",
    sample: "/samples/sample-6x9.pdf",
    cover: "/samples/sample-cover-6x9.pdf",
    sampleLabel: "See a finished word search book (PDF)",
    image: { src: "/pins/03-word-search.png", alt: "A Halloween word search page from a generated KDP book" },
    body: `
  <section class="prose">
    <h2>What goes wrong in word search books</h2>
    <p>Word search is the biggest low-content category on Amazon, and its reviews are unforgiving about a small set of faults that are easy to make and easy for a solver to spot:</p>
    <ul>
      <li><strong>A word appears twice.</strong> Crossing words, or the random filler letters, accidentally spell a second copy — and the answer key only marks one.</li>
      <li><strong>One word hides inside another.</strong> CAT inside CATALOG in the same grid is found twice.</li>
      <li><strong>Filler letters spell something rude.</strong> Random letters do this more often than you would think.</li>
      <li><strong>The same list, twice.</strong> A short theme list reused across fifty puzzles produces near-identical grids.</li>
    </ul>
    <p>Puzzle Press checks every grid after placing the words: each word must occur exactly once in all eight directions, nested words are removed from the list before placement (you are told which and why), filler letters are screened against a blocklist, and each puzzle draws a word list not used earlier in the book — if the theme is too small to supply enough different lists, you are warned before you download, not after. These are checks, not hopes; the same tests run on every book.</p>
  </section>

  <section class="prose">
    <h2>Themes, or your own words</h2>
    <p>${themeNames.length} built-in themes: ${themeNames.join(", ")}. Every list is published in full at <a href="/word-lists/">/word-lists</a>, free to use anywhere. Or paste your own list — one per line or comma-separated — and name it; the name prints on every puzzle. Thirty to sixty on-topic words is enough for a fifty-puzzle book; each puzzle draws a different subset, and the tool warns you if the list is too short to avoid repeats or if a word is too long for the grid.</p>
  </section>

  <section class="prose">
    <h2>Grades</h2>
    <table>
      <tr><th>Level</th><th>Directions</th><th>Filler letters</th></tr>
      <tr><td>Easy</td><td>${wsDirs.easy} — across and down only</td><td>Random</td></tr>
      <tr><td>Medium</td><td>${wsDirs.medium} — adds diagonals, nothing backwards</td><td>Random</td></tr>
      <tr><td>Hard</td><td>All ${wsDirs.hard}, including backwards</td><td>Drawn from the puzzle's own words, so near-misses are everywhere</td></tr>
      <tr><td>Graded</td><td colspan="2">Easy at the front through hard at the back, with the level printed on each puzzle — how published books are made</td></tr>
    </table>
    <p>Grid size is automatic from the word list (15×15 is typical), or set it yourself. <strong>Large print</strong> switches to 8.5 × 11 with bigger letters and a grid sized for them, the format that sells to older readers.</p>
  </section>

  <section class="prose">
    <h2>What a book costs to print, and earns</h2>
    ${costTable}
  </section>`,
  },

  "sudoku-book-generator": {
    title: "Sudoku Book Generator for KDP — Every Puzzle Has One Solution",
    description: `Generate a graded sudoku puzzle book for Amazon KDP: ${Object.values(SUDOKU_DIFFICULTY).map((d) => d.givens).join("/")} clues from easy to expert, every puzzle verified to have exactly one solution, solutions included, print-ready PDF. Free to use.`,
    h1: "Sudoku book generator for Amazon KDP",
    lede: "A complete sudoku paperback — graded easy to expert, every puzzle verified to have exactly one solution, answers at the back — as a print-ready interior PDF and a matching cover. Free to use; the free book is watermarked.",
    kind: "sudoku",
    sample: "/samples/sample-sudoku-6x9.pdf",
    cover: "/samples/sample-sudoku-cover-6x9.pdf",
    sampleLabel: "See a finished sudoku book (PDF)",
    image: { src: "/pins/04-sudoku.png", alt: "A sudoku puzzle page from a generated KDP book" },
    body: `
  <section class="prose">
    <h2>The one thing a sudoku book must get right</h2>
    <p>A sudoku with two valid solutions is broken: the solver who finds the other one checks the answer key, sees it disagree, and leaves a review saying the book is wrong. It is one of the most common complaints in sudoku book reviews, and it comes from generators that remove clues until the grid "looks hard" without checking that it still solves one way.</p>
    <p>Puzzle Press starts from a full valid grid and digs clues out in symmetric pairs. Before each pair is removed, the grid is solved by a solver that counts solutions; if removing the pair would allow a second solution, the pair stays. Every puzzle in every book has exactly one answer, by construction. The expert grades take a few seconds each because of this check — the page shows progress while it works — which is the cost of getting it right.</p>
  </section>

  <section class="prose">
    <h2>Grades</h2>
    <table>
      <tr><th>Level</th><th>Clues given</th></tr>
      ${Object.values(SUDOKU_DIFFICULTY).map((d) => `<tr><td>${d.label}</td><td>${d.givens}</td></tr>`).join("\n      ")}
      <tr><td>Graded</td><td>Easy at the front through expert at the back, level printed on each puzzle</td></tr>
    </table>
    <p>Clue layouts are rotationally symmetric, as in newspaper and book sudoku. Grids are 9×9 with bold 3×3 boxes and numbering sized for a 6 × 9 page; large print at 8.5 × 11 gives bigger cells for pencil solvers.</p>
  </section>

  <section class="prose">
    <h2>Solutions</h2>
    <p>Filled grids, ${fits} to a page at 6 × 9, each labelled with its puzzle number and grade, after a "Solutions" divider. Large enough to read; small enough that a 100-puzzle book stays at ${planPages(100, solutionsPerPageFor(100, fits)).total} pages.</p>
  </section>

  <section class="prose">
    <h2>What a book costs to print, and earns</h2>
    ${costTable}
    <p>Sudoku books have no theme to choose, so the niche is in the audience: large print, travel size, "for beginners", "expert only", a volume number. See <a href="/how-to-make-a-puzzle-book#niche">choosing a niche</a> in the guide.</p>
  </section>`,
  },

  "maze-book-generator": {
    title: "Maze Book Generator for KDP — Perfect Mazes, Solutions Included",
    description: `Make a maze puzzle book for Amazon KDP: perfect mazes from ${MAZE_DIFFICULTY.easy.w}×${MAZE_DIFFICULTY.easy.h} to ${MAZE_DIFFICULTY.expert.w}×${MAZE_DIFFICULTY.expert.h}, one route through each, solutions at the back, print-ready PDF and cover. Free to use.`,
    h1: "Maze book generator for Amazon KDP",
    lede: `A complete maze paperback — perfect mazes from ${MAZE_DIFFICULTY.easy.w}×${MAZE_DIFFICULTY.easy.h} up to ${MAZE_DIFFICULTY.expert.w}×${MAZE_DIFFICULTY.expert.h}, one route through each, solutions drawn at the back — as a print-ready interior PDF and a matching cover. Free to use; the free book is watermarked.`,
    kind: "maze",
    sample: "/samples/sample-maze-6x9.pdf",
    cover: "/samples/sample-maze-cover-6x9.pdf",
    sampleLabel: "See a finished maze book (PDF)",
    image: { src: "/pins/05-mazes.png", alt: "A maze page from a generated KDP book" },
    body: `
  <section class="prose">
    <h2>What "perfect maze" means, and why it matters</h2>
    <p>A perfect maze has exactly one path between any two points — one way in, one way out, no loops and no sealed-off pockets. That is what makes it satisfying to solve and what makes the answer key correct: there is exactly one route to draw. Mazes made by hand, or by generators that punch random openings, often have two routes (so the printed solution looks wrong) or unreachable areas (which look like a printing error).</p>
    <p>Puzzle Press carves each maze as a spanning tree of the grid, which is perfect by definition. Entrance top-left, exit bottom-right, and the solution is the unique path between them — printed at the back as a wide grey corridor over the maze, easy to read at ${fits} to a page.</p>
  </section>

  <section class="prose">
    <h2>Grades</h2>
    <table>
      <tr><th>Level</th><th>Grid</th><th>Suits</th></tr>
      <tr><td>${MAZE_DIFFICULTY.easy.label}</td><td>${MAZE_DIFFICULTY.easy.w} × ${MAZE_DIFFICULTY.easy.h}</td><td>Young children — wide corridors for crayons</td></tr>
      <tr><td>${MAZE_DIFFICULTY.medium.label}</td><td>${MAZE_DIFFICULTY.medium.w} × ${MAZE_DIFFICULTY.medium.h}</td><td>Ages 6–10, activity books</td></tr>
      <tr><td>${MAZE_DIFFICULTY.hard.label}</td><td>${MAZE_DIFFICULTY.hard.w} × ${MAZE_DIFFICULTY.hard.h}</td><td>Older children and adults</td></tr>
      <tr><td>${MAZE_DIFFICULTY.expert.label}</td><td>${MAZE_DIFFICULTY.expert.w} × ${MAZE_DIFFICULTY.expert.h}</td><td>Adult maze books; a few minutes each</td></tr>
      <tr><td>Graded</td><td colspan="2">Easy at the front through expert at the back, level printed on each maze</td></tr>
    </table>
    <p>Each maze fills the page's live area, so the cell size follows the trim: 8.5 × 11 gives the biggest cells and is the usual choice for children's books, at the cost of KDP's large-trim print rate. 6 × 9 keeps the flat printing rate.</p>
  </section>

  <section class="prose">
    <h2>Maze books for children</h2>
    <p>This is where most maze books sell: "Mazes for Kids Ages 4–8", "My First Maze Book", "Dinosaur Mazes". Amazon's children's categories filter by age range, so put the age range in the title and grade the book so the first mazes are the easiest. A 50-maze book is the normal size; the table below shows what that costs.</p>
  </section>

  <section class="prose">
    <h2>What a book costs to print, and earns</h2>
    ${costTable}
  </section>`,
  },
};

pages["criss-cross-book-generator"] = {
  title: "Criss-Cross (Word Fill-In) Puzzle Book Generator for KDP — Unique Fill Guaranteed",
  description: `Make a criss-cross / word fill-in puzzle book for Amazon KDP: crossword-shaped grids with the word list given, ${CRISSCROSS_DIFFICULTY.easy.words} to ${CRISSCROSS_DIFFICULTY.expert.words} words, every puzzle verified to have exactly one fill, solutions included, print-ready PDF and cover. Free to use.`,
  h1: "Criss-cross (word fill-in) book generator for Amazon KDP",
  lede: "Fill-in puzzles — the crossword grid with the word list printed instead of clues — as a complete paperback: graded easy to expert, every grid verified to have exactly one way to fill it, solutions at the back, plus the matching cover. Free to use; the free book is watermarked.",
  kind: "crisscross",
  sample: "/samples/sample-crisscross-6x9.pdf",
  cover: "/samples/sample-crisscross-cover-6x9.pdf",
  sampleLabel: "See a finished fill-in book (PDF)",
  image: { src: "/pins/06-crisscross.png", alt: "A criss-cross fill-in puzzle page from a generated KDP book" },
  body: `
  <section class="prose">
    <h2>What a criss-cross is, and the one way it goes wrong</h2>
    <p>A criss-cross (also sold as "word fill-in" or "fill-it-in") is a crossword-shaped grid with no clues: the words are listed by length, and the solver works out where each one goes from its length and from the letters where words cross. They are a large KDP category of their own, popular with the same readers who buy word search books, and easier on the eyes than a crossword because there is nothing to know — only to fit.</p>
    <p>The one way they go wrong: a grid where two words of the same length could swap places. Then there are two correct fills, the answer key at the back matches only one of them, and the reader who found the other one leaves the review. Puzzle Press solves every grid it builds with a backtracking solver that counts fills; if it finds a second, the longest word is printed into the grid as a starter (as fill-in books do), and if that still leaves two, the grid is thrown away and rebuilt. Every puzzle in every book has exactly one fill.</p>
  </section>

  <section class="prose">
    <h2>Grades</h2>
    <table>
      <tr><th>Level</th><th>Words in the grid</th><th>Grid up to</th></tr>
      ${Object.values(CRISSCROSS_DIFFICULTY).map((d) => `<tr><td>${d.label}</td><td>${d.words}</td><td>${d.size} × ${d.size}</td></tr>`).join("\n      ")}
      <tr><td>Graded</td><td colspan="2">Easy at the front through expert at the back, level printed on each puzzle</td></tr>
    </table>
    <p>Words come from the same ${themeNames.length} themes as the word search books, or a list you paste. Each puzzle draws its own words, so a Halloween fill-in book is fifty different Halloween grids. Grids are trimmed to the shape the words make — no black squares, no padding — and the word list beneath is grouped by length, the way printed fill-ins are.</p>
  </section>

  <section class="prose">
    <h2>What a book costs to print, and earns</h2>
    ${costTable}
  </section>`,
};

const css = `
  :root { --ink:#1a1a1a; --muted:#5c6470; --line:#d9dde3; --bg:#f6f7f9; --card:#fff; --accent:#1d3557; }
  * { box-sizing: border-box; }
  html, body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif; }
  a { color: var(--accent); }
  header { padding:18px 24px; border-bottom:1px solid var(--line); background:var(--card); display:flex; gap:16px; align-items:baseline; flex-wrap:wrap; }
  header strong { font-size:18px; } header .spacer { flex:1; }
  main { max-width:860px; margin:0 auto; padding:32px 24px 8px; }
  h1 { font-size:clamp(26px,4vw,36px); line-height:1.15; letter-spacing:-0.02em; margin:0 0 10px; }
  .lede { color:var(--muted); margin:0 0 22px; font-size:17px; }
  .top { display:grid; grid-template-columns: 1fr 260px; gap:28px; align-items:start; }
  @media (max-width:700px) { .top { grid-template-columns:1fr; } .top img { max-width:260px; } }
  .top img { width:100%; height:auto; border-radius:8px; box-shadow:0 10px 30px rgba(20,30,50,.14); }
  .btn { display:inline-block; text-decoration:none; font-weight:600; padding:12px 20px; border-radius:8px; background:var(--accent); color:#fff; border:1px solid var(--accent); }
  .actions { display:flex; gap:14px; align-items:center; flex-wrap:wrap; margin:0 0 8px; }
  .fine { color:var(--muted); font-size:14px; }
  section.prose { margin:30px 0; }
  section.prose h2 { font-size:21px; margin:0 0 8px; }
  section.prose p { margin:0 0 12px; }
  section.prose ul { margin:0 0 12px; padding-left:22px; } section.prose li { margin:4px 0; }
  table { border-collapse:collapse; width:100%; font-size:14px; background:var(--card); margin:0 0 12px; }
  th, td { text-align:left; padding:8px 10px; border-bottom:1px solid var(--line); vertical-align:top; }
  th { color:var(--muted); font-weight:600; }
  .cta { margin:34px 0 10px; padding:22px; background:var(--card); border:1px solid var(--line); border-radius:12px; }
  .cta h2 { margin:0 0 6px; font-size:20px; } .cta p { margin:0 0 14px; color:var(--muted); }
  footer { color:var(--muted); font-size:13px; text-align:center; padding:30px 24px; border-top:1px solid var(--line); background:var(--card); margin-top:30px; }
  footer a { color: var(--muted); }
`;

const favicon = `data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' rx='6' fill='%231d3557'/%3E%3Ctext x='16' y='22' font-family='sans-serif' font-weight='700' font-size='18' fill='white' text-anchor='middle'%3EP%3C/text%3E%3C/svg%3E`;

const render = (slug, p) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${p.title}</title>
<meta name="description" content="${p.description}">
<link rel="canonical" href="${SITE}/${slug}">
<meta property="og:type" content="website">
<meta property="og:title" content="${p.h1}">
<meta property="og:description" content="${p.description}">
<meta property="og:url" content="${SITE}/${slug}">
<meta property="og:image" content="${SITE}/cards/${slug}.png">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="icon" href="${favicon}">
<style>${css}</style>
<script type="application/ld+json">
${JSON.stringify({
  "@context": "https://schema.org",
  "@type": "WebPage",
  name: p.h1,
  url: `${SITE}/${slug}`,
  description: p.description,
  isPartOf: { "@type": "WebSite", name: "Puzzle Press", url: `${SITE}/` },
  about: { "@type": "SoftwareApplication", name: "Puzzle Press", url: `${SITE}/`, applicationCategory: "DesignApplication", operatingSystem: "Any browser", offers: { "@type": "Offer", price: "19.00", priceCurrency: "USD" } },
}, null, 2)}
</script>
</head>
<body>
<header>
  <strong><a href="/" style="text-decoration:none;color:inherit">Puzzle Press</a></strong>
  <span class="spacer"></span>
  <a href="/how-to-make-a-puzzle-book">Guide</a>
  <a href="/spine-calculator">Spine calculator</a>
  <a href="/royalty-calculator">Royalty calculator</a>
</header>

<main>
  <div class="top">
    <div>
      <h1>${p.h1}</h1>
      <p class="lede">${p.lede}</p>
      <div class="actions">
        <a class="btn" href="/?kind=${p.kind}#tool">Make a book free</a>
        <a href="${p.sample}" target="_blank" rel="noopener">${p.sampleLabel}</a>
        <a href="${p.cover}" target="_blank" rel="noopener">…and its cover</a>
      </div>
      <p class="fine">Runs in your browser — nothing you type leaves your computer. No sign-up.</p>
    </div>
    <img src="${p.image.src}" width="1000" height="1500" alt="${p.image.alt}" loading="eager">
  </div>
${p.body}

  <section class="prose">
    <h2>The rules every KDP interior has to meet</h2>
    <p>Page size equal to the trim, margins that grow with the page count, fonts embedded, ${MIN_PAGES} to 828 pages and an even count, a cover whose spine width is page count × paper thickness with nothing added. The tool lays every book out to these; if you would rather know them yourself, they are all in <a href="/how-to-make-a-puzzle-book">the guide</a>, with the numbers.</p>
  </section>

  <div class="cta">
    <h2>Make one now</h2>
    <p>Choose the settings, watch the preview, download the interior and then the cover — the spine already sized from the page count of the book you just made. Free to use; $19 once removes the watermark, and the price is on the page before you click anything.</p>
    <a class="btn" href="/?kind=${p.kind}#tool">Make a ${p.kind === "wordsearch" ? "word search" : p.kind === "crisscross" ? "criss-cross" : p.kind} book free</a>
  </div>
</main>

<footer>
  <p><strong>Puzzle Press</strong> — a <a href="https://bananafest-destiny.com">Bananafest Destiny</a> app. <a href="/#terms">Terms</a> · <a href="/word-search-book-generator">Word search</a> · <a href="/sudoku-book-generator">Sudoku</a> · <a href="/maze-book-generator">Mazes</a> · <a href="/criss-cross-book-generator">Criss-cross</a> · <a href="mailto:support@bananafest-destiny.com">support@bananafest-destiny.com</a></p>
  <p>Not affiliated with Amazon. KDP is a trademark of Amazon.com, Inc. Figures are from Amazon's published specifications; check your proof.</p>
</footer>
</body>
</html>
`;

for (const [slug, p] of Object.entries(pages)) {
  writeFileSync(new URL(`../public/${slug}.html`, import.meta.url).pathname, render(slug, p));
  console.log("wrote", `public/${slug}.html`);
}
