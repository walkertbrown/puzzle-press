# Product Hunt launch — Puzzle Press

Everything here is ready to paste. Nothing in it is invented: no user counts, no
testimonials, no "months of work". Every claim maps to something the product
actually does.

---

## Name

Puzzle Press

## Tagline (60 char limit)

**Print-ready puzzle books for Amazon KDP** — 41 chars ← recommended

Alternates:
- Make a KDP-ready puzzle book in about a minute — 46
- Word search books, laid out to Amazon KDP spec — 46

## Description (260 char limit)

> Word search, sudoku or mazes. Puzzle Press lays out the whole paperback — puzzles, solutions, page numbers — then a matching cover with the spine measured to your page count. Runs entirely in your browser. Free up to 5 puzzles.

226 chars.

## Links

- Website: https://puzzlepress.bananafest-destiny.com
- Also try: the sample PDFs linked in the header (word search, sudoku and maze
  books, plus a cover) — people click those, and they do the selling

## Topics

Verified against Product Hunt's live topic pages on 2026-09-10. There is no
"Publishing", "PDF" or "E-commerce" topic — those 404. Pick in this order and
take as many as the submission form allows (it caps you at a handful):

1. **Printing** — the best fit by a distance. Its own description is "tools to
   create, sell, and output print-ready docs and products — from stickers, art
   to journals and handouts". That is literally this product. And it holds only
   **32 products**, so a launch here is visible instead of buried, and the topic
   page keeps sending traffic long after launch day.
2. **Design Tools** — 7,478 products, so no ranking hope, but it is credibly
   what this is (a layout and output tool) and it is where PH regulars browse.
3. **Writing** — where the self-publishing crowd sits. Adjacent rather than
   exact, but the audience overlap is the point.

Considered and rejected:
- **Books** (5,108 products) — sounds perfect, is not. The listings are generic
  software, so relevance is diluted and ranking is hopeless.
- **Productivity** — enormous and generic. Invisible.
- **Side Projects** — signals hobby. This is a paid product; do not undercut it.
- **Adult Coloring Books** — genuinely adjacent (same low-content KDP niche) but
  this is not a coloring book. Picking it would read as tag-stuffing.

## Gallery, in order

1. `social-card.png` — the card, sets the frame
2. `demo.gif` — the whole flow in seven beats; this is the one that converts
3. `hero-book.png` — a puzzle page beside its solutions page
4. `gallery/04-the-tool.png` — the tool mid-use, preview showing
5. `gallery/05-solutions.png` — a solutions page, close
6. `gallery/06-sudoku.png` — a sudoku puzzle page and its solutions page
7. `gallery/07-mazes.png` — a maze page and its solutions page

All are in `app/public/` and regenerate with `npm run images`, `npm run gallery`
and `npm run demo`, so they never drift from what the product actually does.
Live copies: /social-card.png, /demo.gif, /hero-book.png,
/gallery/04-the-tool.png, /gallery/05-solutions.png

---

## First comment (post this yourself, right after launch)

> Low-content publishing on Amazon KDP is a real niche — puzzle books, journals, planners — and the tooling for it is oddly bad. Free generators make one puzzle at a time. The paid options are $10/month subscriptions or desktop software that looks like it stopped being updated in 2011.
>
> The hard part was never the puzzle. It's the book. KDP bounces manuscripts for boring reasons: the inside margin has to get wider as the book gets thicker, fonts have to be embedded, there's a 24-page minimum, the page count has to be even. Get one wrong and you're back in the upload queue.
>
> Puzzle Press does the whole interior. Pick from 32 themes or paste your own word list, choose a trim size, and you get a PDF with puzzles, word banks, a solutions section and page numbers — margins, gutter, bleed and embedded fonts already correct.
>
> Then it makes the cover, which is the part I expected to be easy and wasn't. A paperback spine is page count times paper thickness, so the cover can't be designed until the interior exists. Puzzle Press already knows the page count, because it just made the book — so the wrap comes out at the exact size, spine included, barcode area left clear. (Two of the top-ranked KDP spine calculators online add 0.06" to that number. Amazon's own documentation doesn't. That 0.06" is a hardcover rule, and it will get your cover rejected.)
>
> It does sudoku and mazes as well. Mazes are spanning trees, so every one has exactly one route from start to finish and no unreachable corners. Sudoku comes in four difficulties. Every sudoku is dug out one symmetric pair of clues at a time and a clue is only removed if the grid still solves exactly one way — a puzzle with two answers would make the solutions page at the back of your own book wrong.
>
> Four things I cared about in the word searches themselves:
>
> • **Every word appears exactly once.** Crossing words can accidentally spell a second copy of another answer. Layouts that do it are thrown away and rebuilt.
> • **No word hidden inside another** in the same grid — DEER inside REINDEER makes a puzzle feel broken.
> • **Filler letters are screened**, so a random fill never spells something you'd rather not print in a book for kids or grandparents.
> • **Every puzzle has its own word set.** A 100-puzzle book is 100 different puzzles, not a reshuffle of twenty.
>
> There's also a large-print mode, which is the biggest sub-niche in puzzle books — one checkbox sets the trim, the grid and the word count so the letters come out around 23pt.
>
> Free for books up to 5 puzzles — real books, just shorter, with a small footer line. $19 once removes the limits for good and unlocks cover generation. No account, no subscription, and nothing you type ever leaves your browser.
>
> There's a full sample book (PDF) on the site if you'd rather see the output before touching the tool.
>
> Happy to answer anything, including the KDP spec side — I went further down that rabbit hole than I expected to.

---

## Optional paragraph — your call

If you want to disclose how it was built, this is honest and it is interesting
to that audience. It also changes the conversation from "another generator" to
something people argue about, which is attention. Your name is on it, so it is
your decision, not mine:

> One more thing: I didn't write this. It was built end to end by an AI agent working as an employee — it picked the idea, wrote the generator and the PDF engine, deployed it, and wrote this page. I answered factual questions and provided accounts. The build log, including every plan and what actually happened, is public: https://github.com/walkertbrown/vibe-cider

## Practical notes

- Launch at **12:01am PT**, Tuesday to Thursday. A launch gets one 24-hour window.
- **Do not ask anyone for upvotes.** It is against Product Hunt's rules and it gets launches penalised. Sharing the link and saying you launched is fine.
- Be at the keyboard for the first few hours. Reply to every comment. Replies do more than the post.
- Likely questions, worth having answers ready for:
  - *Can I sell what it makes?* Yes, no rights claimed, no royalty.
  - *Does it do sudoku / mazes / crosswords?* Sudoku and mazes yes — four difficulties each, every puzzle verified to have exactly one solution. Crosswords not yet.
  - *Does it make the cover?* Yes — full wrap, spine sized from the page count, barcode area kept clear. Part of the paid unlock.
  - *What about large print?* There's a Large print checkbox — 8.5×11, 15×15 grid, ~23pt letters.
  - *Is my word list uploaded?* No. Generation and PDF rendering are entirely client-side.
- Before launching, clear the Stripe product's **unit label** so checkout stops
  reading "$19.00 per unlimited".
