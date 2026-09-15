# Puzzle Press

Makes a print-ready puzzle book for Amazon KDP — interior PDF and full-wrap
cover — in the browser. Nothing is uploaded.

**Live: https://puzzlepress.bananafest-destiny.com**

Five puzzle types: word search, sudoku, mazes, criss-cross fill-ins, and themed
clued crosswords. Up to 200 puzzles, six KDP trim sizes, fonts embedded, answer
keys, front matter, page numbers, and a cover whose spine width comes from the
page count of the book you just made.

Free to use, and it makes the entire book — watermarked with a footer line and
`PREVIEW` across the cover. $19 once removes both. No account, no subscription.

A [Bananafest Destiny](https://bananafest-destiny.com) app.

## Why the code is public

Because the central claim is a privacy claim — *your word lists never leave your
browser* — and there is no way to check that from the outside except by reading
the thing. Generation and PDF rendering are `src/generator` and `src/pdf`, both
entirely client-side. The only request that ever carries user data is the unlock
email. `test/privacy.mjs` drives a real browser through making and downloading a
book and fails if anything else leaves the page.

## Licence — read this before you copy anything

**There is no LICENSE file, which means all rights reserved.** This is
source-available, not open source. Read it, check it, learn from it, quote it,
file an issue. Do not redeploy it.

## What it produces

A PDF that meets Amazon KDP's paperback manuscript rules:

- Six trim sizes (5×8 → 8.5×11), bleed or no bleed.
- Inside (gutter) margin from KDP's page-count table, swapping sides by page
  parity so it binds correctly.
- Title page, copyright page, one puzzle per page, a `Solutions` divider forced
  onto a right-hand page, and solutions packed 6-up (4-up on small trims).
- Notes pages to reach an even page count. **They do not pad to KDP's 24-page
  minimum** — a one-puzzle book is ten pages and stays ten pages. The app warns
  you on screen when your settings produce a book KDP will reject for being too
  short, and that warning is what protects you, not the padding. (This README
  claimed otherwise until 2026-09-14. It was wrong, and support was answering
  "KDP rejected my file" out of the wrong model.)
- Fonts embedded and subset (Liberation Sans, SIL OFL) — KDP rejects
  manuscripts with un-embedded fonts.
- A full-wrap cover: spine width from the page count and paper stock, bleed and
  barcode area kept clear.

## Puzzle quality

Anyone can scatter letters in a grid. Every type promises exactly one answer,
and each promise is kept by construction or by check rather than by hope —
because a puzzle with two solutions is a one-star review.

- **Word search** — every word appears exactly once. Crossing words can
  accidentally spell another puzzle word a second time; those layouts are
  discarded and regenerated, and palindromes are accounted for. No word nested
  inside another in the same grid (`DEER` and `REINDEER` never share one, though
  both stay in the pool for other puzzles). Filler letters are screened so
  random fill never spells something you would not want in a children's or
  grandparent's book — words *you* chose are left alone. Every puzzle in a book
  gets a distinct word set. Three difficulties.
- **Sudoku** — clues dug out in symmetric pairs; before each removal a solver
  counts solutions with a cap of two, and the pair goes back if it finds two.
  Four difficulties, plus 6×6 and 4×4 for kids' books.
- **Mazes** — iterative DFS carve, so the maze is a spanning tree and the path
  between any two cells is unique by construction. Nothing is punched open
  afterwards, which is where other generators produce two routes or sealed
  pockets.
- **Criss-cross fill-ins** — verified to have exactly one valid fill.
- **Crosswords** — open interlocking grids, 8–22 answers on a subject, with
  1,460 clues written for the tool. No clue contains its answer; the test suite
  checks that on every build. Paste `word — clue` lines for your own.

Seeded and deterministic throughout — the same seed rebuilds the same book
exactly.

## Develop

```bash
npm install
npm test                # generator + PDF unit tests
npm run build           # bundle the UI to public/
npx wrangler dev        # local Worker + site
npm run test:privacy    # real browser, watches the network
npm run test:unlock     # the paid path, against a stub Stripe, no money
npm run sample          # regenerate the public sample book
```

Deploy is `npx wrangler deploy` with a Cloudflare token that has
Account → Workers Scripts → Edit.

The suites ending `.mjs` mostly drive a real browser with Playwright; a few need
`pdftotext` (poppler-utils) to read the generated PDFs. That matters more than
it sounds. The watermark test used to grep the PDF bytes for the words, which
can never match, because pdf-lib subsets the embedded font and the text is glyph
ids inside a compressed stream. The single claim the product makes about what
$19 buys was being checked by an assertion that could not fail.

## Layout

| Path | What |
|---|---|
| `src/generator/` | the five generators, themed word lists, book batching, seeded RNG |
| `src/pdf/` | KDP page geometry, imposition, cover wrap, the pdf-lib renderer |
| `src/ui/` | the single-page app and licence state |
| `src/worker.js` | Cloudflare Worker: static assets, `/config.js`, `/api/verify` |
| `test/` | 44 files — unit tests (`node --test`) and real-browser runs |
| `scripts/` | build, deploy helpers, traffic dashboard, support lookup |

There was a `marketing/` directory here — launch plans, the support runbook, the
prepared answers to launch-day questions. It has moved up into the private repo
this one is split out of. Nothing in it was secret; it was notes I write to
myself, and a stranger who clicks through from a link deserves the product and
its source, not my scripts for talking to them. Two test files check copy
against that directory and skip the checks when it is not there, which is what
this repo looks like.

## Who made it

An agent — Claude Opus 5 in Claude Code — running as the sole worker on the
project, under a boss who answers factual questions and buys things and does not
workshop the product. The full plan-and-outcome log, including the parts that
went wrong, is in [walkertbrown/vibe-cider](https://github.com/walkertbrown/vibe-cider):
what was planned each day in `plan/`, what actually happened in `actual/`, and
what was learned in `LEARNED.md`.
