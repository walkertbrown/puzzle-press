# Puzzle Press

A browser app that turns a word list into a print-ready word-search puzzle book PDF for Amazon KDP.

**Live: https://puzzlepress.bananafest-destiny.com**

Pick themes or paste your own words, choose a trim size, download a finished paperback interior — puzzles, word banks, solutions, page numbers, the lot. Everything runs client-side; word lists never leave the browser.

A [Bananafest Destiny](https://bananafest-destiny.com) app.

## What it produces

A PDF that meets Amazon KDP's paperback manuscript rules:

- Six trim sizes (5×8 → 8.5×11), bleed or no bleed.
- Inside (gutter) margin from KDP's page-count table, swapping sides by page parity so it binds correctly.
- Title page, copyright page, one puzzle per page, a `Solutions` divider forced onto a right-hand page, solutions packed 6-up (4-up on small trims), and Notes pages to reach KDP's 24-page minimum and an even page count.
- Fonts embedded and subset (Liberation Sans, SIL OFL) — KDP rejects manuscripts with un-embedded fonts.

## Puzzle quality

Anyone can scatter letters in a grid. The things that produce one-star reviews are handled:

- **Every word appears exactly once.** Crossing words can accidentally spell another puzzle word a second time; those layouts are discarded and regenerated. Palindromes are accounted for.
- **No word nested inside another** in the same puzzle (`DEER` and `REINDEER` never share a grid — but both stay in the pool for other puzzles).
- **Filler letters are screened** so random fill never spells something you would not want in a children's or grandparent's puzzle book. Words that *you* chose are left alone.
- **Every puzzle in a book has a distinct word set**, drawn from the pool without repeats.
- Three difficulties: across/down, plus diagonals, or all eight directions with filler drawn from the puzzle's own letters.
- Seeded and deterministic — the same seed rebuilds the same book exactly.

## Develop

```bash
npm install
npm test              # generator + PDF unit tests
npm run build         # bundle the UI to public/app.js
npx wrangler dev      # local Worker + site
npm run test:browser  # end-to-end in real Chromium (needs a server running)
npm run sample        # regenerate the public sample book
```

Deploy is `npx wrangler deploy` with a Cloudflare token that has Account → Workers Scripts → Edit.

## Layout

| Path | What |
|---|---|
| `src/generator/` | word placement, themed word lists, book batching, seeded RNG |
| `src/pdf/` | KDP page geometry and the pdf-lib renderer |
| `src/ui/` | the single-page app and licence state |
| `src/worker.js` | Cloudflare Worker: static assets, `/config.js`, `/api/verify` |
| `test/` | unit tests (`node --test`) and a Playwright end-to-end run |

Build log, plans and daily actuals live in [walkertbrown/vibe-cider](https://github.com/walkertbrown/vibe-cider).
