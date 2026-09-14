# Puzzle Press

Makes a print-ready puzzle book for Amazon KDP — interior PDF and full-wrap
cover — in the browser. Nothing is uploaded.

**https://puzzlepress.bananafest-destiny.com**

Five puzzle types: word search, sudoku, mazes, criss-cross fill-ins, and
themed clued crosswords. Up to 200 puzzles, six KDP trim sizes, fonts embedded,
answer keys, front matter, page numbers, and a cover whose spine width comes
from the page count of the book you just made.

Free to use and it makes the entire book — watermarked with a footer line and
`PREVIEW` across the cover. $19 once removes both. No account, no subscription.

## Why the code is here

Because the central claim is a privacy claim — *your word lists never leave
your browser* — and there is no way to check that from the outside except by
reading the thing. Generation and PDF rendering are `src/generator` and
`src/pdf`, both client-side. The only request that ever carries user data is
the unlock email. `test/privacy.mjs` drives a real browser through making and
downloading a book and fails if anything else leaves the page.

## Licence — read this before you copy anything

**There is no LICENSE file, which means all rights reserved.** This is
source-available, not open source. Read it, check it, learn from it, quote it,
file an issue. Do not redeploy it.

## Layout

```
src/generator/   the five puzzle generators, each with a uniqueness guarantee
src/pdf/         page layout, imposition, cover wrap, spine arithmetic
src/ui/          the single-page app
src/worker.js    Cloudflare Worker: /config.js and /api/verify. Everything else is static.
public/          the site — generator, guides, word lists, calculators
test/            44 files
scripts/         build, deploy helpers, traffic dashboard, support lookup
marketing/       the launch plans and support runbook, in the open
```

## The uniqueness guarantees

Every puzzle type promises exactly one answer, and each promise is kept by
construction or by check rather than by hope — because a puzzle book with two
solutions to a printed puzzle is a book that gets returned.

- **Sudoku** — clues are dug out in symmetric pairs; before each removal a
  solver counts solutions with a cap of two, and the pair goes back if it finds
  two. Four difficulties, plus 6×6 and 4×4 for kids' books.
- **Mazes** — iterative DFS carve, so the maze is a spanning tree and the path
  between any two cells is unique by construction. No random openings punched
  afterwards, which is where other generators produce two routes or sealed
  pockets.
- **Word search** — after placing and filling, all eight directions are scanned
  for every word and exactly one occurrence is required (two for palindromes).
  Nested words are dropped from the list before placement, so BRIDE and
  BRIDESMAID never share a grid.
- **Criss-cross** — verified to have exactly one valid fill.
- **Crosswords** — open interlocking grids, 8–22 answers on a subject, with
  1,460 clues written for the tool. No clue contains its answer. Paste
  `word — clue` lines for your own.

## Running it

```
npm install
npx wrangler dev        # the whole site, locally
npm test                # the unit tests
npm run test:privacy    # real browser, watches the network
npm run test:unlock     # the paid path, against a stub Stripe, no money
```

The suites ending `.mjs` mostly drive a real browser with Playwright; a few
need `pdftotext` (poppler-utils) to read the generated PDFs. That matters more
than it sounds: the watermark test used to grep the PDF bytes for the words,
which can never match, because pdf-lib subsets the embedded font and the text
is glyph ids inside a compressed stream. The single claim the product makes
about what $19 buys was being checked by an assertion that could not fail.

## Who made it

An agent — Claude Opus 5 in Claude Code — running as the sole worker on the
project, under a boss who answers factual questions and buys things and does
not workshop the product. The full plan-and-outcome log, including the parts
that went wrong, is in the parent repository: what was planned each day in
`plan/`, what actually happened in `actual/`, and what was learned in
`LEARNED.md`.
