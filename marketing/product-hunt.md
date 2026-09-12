# Product Hunt launch — Puzzle Press

Everything here is ready to paste. Nothing in it is invented: no user counts, no
testimonials, no "months of work". Every claim maps to something the product
actually does.

---

## Name

Puzzle Press

## Tagline (60 char limit)

**Print-ready puzzle books for Amazon KDP** — 39 chars ← recommended

Alternates:
- Make a KDP-ready puzzle book in about a minute — 46
- Word search, sudoku & maze books, KDP-ready — 43

## Description (260 char limit)

> Word search, sudoku or mazes. Puzzle Press lays out the whole paperback — puzzles, solutions, page numbers — then a matching cover with the spine measured to your page count. Runs entirely in your browser. Free to use; pay to remove the watermark.

226 chars.

## Links

- Website: https://puzzlepress.bananafest-destiny.com
- Free tools worth linking separately, and good replies to "how do I price this?":
  /spine-calculator and /royalty-calculator
- One page per type, for replies to "does it do sudoku?" / "mazes for kids?":
  /word-search-book-generator, /sudoku-book-generator, /maze-book-generator
  (each opens the tool with that type already chosen)
- The guide, for anyone who says they have never published on KDP:
  /how-to-make-a-puzzle-book
- The video: https://youtu.be/ph6q2ih6cBs (60 s, real time, no narration)
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

1. **Video** — https://youtu.be/ph6q2ih6cBs (60 s, real time, no narration; Product Hunt takes the YouTube link directly)
2. `social-card.png` — the card, sets the frame
3. `demo.gif` — the whole flow: a word search book, its cover, then sudoku and mazes, ending on real pages from each; this is the one that converts
4. `hero-book.jpg` — a puzzle page beside its solutions page
5. `gallery/04-the-tool.png` — the tool mid-use, preview showing
6. `gallery/05-solutions.png` — a solutions page, close
7. `gallery/06-sudoku.png` — a sudoku puzzle page and its solutions page
8. `gallery/07-mazes.png` — a maze page and its solutions page

All are in `app/public/` and regenerate with `npm run images`, `npm run gallery`
and `npm run demo`, so they never drift from what the product actually does.
Live copies: /social-card.png, /demo.gif, /hero-book.jpg,
/gallery/04-the-tool.png, /gallery/05-solutions.png, /gallery/06-sudoku.png,
/gallery/07-mazes.png

The video is on the Bananafest Destiny channel (uploaded by the boss
2026-09-11). Source: `npm run video` → `app/public/video/puzzle-press.webm`;
the vertical Short (`npm run video:short`) went out via Buffer the same day.

---

## First comment (post this yourself, right after launch)

> Low-content publishing on Amazon KDP is a real niche — puzzle books, journals, planners — and the tooling for it is oddly bad. Free generators make one puzzle at a time. The paid options are $10/month subscriptions or desktop software that looks like it stopped being updated in 2011.
>
> The hard part was never the puzzle. It's the book. KDP bounces manuscripts for boring reasons: the inside margin has to get wider as the book gets thicker, fonts have to be embedded, there's a 24-page minimum, the page count has to be even. Get one wrong and you're back in the upload queue.
>
> Puzzle Press does the whole book. Pick word search, sudoku or mazes and a trim size, and you get a PDF with the puzzles, a solutions section and page numbers — margins, gutter, bleed and embedded fonts already correct. Every book has the same shape: title page, copyright page, the puzzles, a Solutions divider, the answers packed as tightly as the page allows, and four ruled Notes pages at the back.
>
> Then it makes the cover, which is the part I expected to be easy and wasn't. A paperback spine is page count times paper thickness, so the cover can't be designed until the interior exists. Puzzle Press already knows the page count, because it just made the book — so the wrap comes out at the exact size, spine included, barcode area left clear. (Two of the top-ranked KDP spine calculators online add 0.06" to that number. Amazon's own documentation doesn't. That 0.06" is a hardcover rule, and it will get your cover rejected.)
>
> On the puzzles themselves. Mazes are spanning trees, so every one has exactly one route from start to finish and no unreachable corners. Every sudoku is dug out one symmetric pair of clues at a time, and a clue is only removed if the grid still solves exactly one way — a puzzle with two answers would make the solutions page at the back of your own book wrong. Word search draws on 32 themes or a list you paste. All three can be graded — easy at the front working up to expert at the back, the way published puzzle books are usually built, with the level printed on each puzzle.
>
> Four things I cared about in the word searches themselves:
>
> • **Every word appears exactly once.** Crossing words can accidentally spell a second copy of another answer. Layouts that do it are thrown away and rebuilt.
> • **No word hidden inside another** in the same grid — DEER inside REINDEER makes a puzzle feel broken.
> • **Filler letters are screened**, so a random fill never spells something you'd rather not print in a book for kids or grandparents.
> • **Every puzzle has its own word set.** A 100-puzzle book is 100 different puzzles, not a reshuffle of twenty.
>
> It also shows what the book is worth while you build it: printing cost and royalty for the page count you are actually at, using Amazon's own rate table — including the large-trim rates (6×9 is regular trim; 8.5×11 is not, and costs about 40% more per page). There are standalone calculators for that and for spine width on the site, free and no sign-up.
>
> There's also a large-print mode, which is the biggest sub-niche in puzzle books — one checkbox sets the trim and the word count so the letters come out around 23pt.
>
> It is free to use, and not in the crippled sense: make the entire book, all hundred puzzles, with solutions and a cover. The free version is marked rather than shortened — one small line in the footer of each page and a PREVIEW across the cover. $19 once removes both marks, forever. No account, no subscription, and nothing you type ever leaves your browser.
>
> There are sample books on the site — one of each kind, plus a cover — if you'd rather see the output before touching the tool. Or the 60-second video in the gallery, which is a real book being made in real time, nothing sped up.
>
> Happy to answer anything, including the KDP spec side — I went further down that rabbit hole than I expected to.

---

## Optional paragraph — your call

If you want to disclose how it was built, this is honest and it is interesting
to that audience. It also changes the conversation from "another generator" to
something people argue about, which is attention. Your name is on it, so it is
your decision, not mine:

> One more thing: I didn't write this. It was built end to end by an AI agent working as an employee — it picked the idea, wrote the generator and the PDF engine, deployed it, and wrote this page. I answered factual questions and provided accounts. The build log, including every plan and what actually happened, is public: https://github.com/walkertbrown/vibe-cider

## Before Tuesday — checklist

Boss:
- [x] Search Console indexing requested for the guide and the three type
      pages (boss, 09-11).
- [ ] Product Hunt: schedule the launch for Tue 2026-09-15 12:01am PT with the
      copy above; video as gallery item 1.
- [ ] Post the first comment right after it goes live; keep the type-page and
      guide links handy for replies.
- [x] Pinterest spam-block appeal submitted (boss, 09-12 ~1am). Waiting on Pinterest; pins stay drafted until it clears.

Me (Monday, before the 6:30pm reminder):
- [ ] `npm run test:livecheckout`, `test:paidreturn`, `test:browser`,
      `test:typepages`, `test:privacy` against production.
- [ ] `npm run traffic` for the honest pre-launch baseline, so Tuesday's
      numbers mean something.
- [ ] Retry one Pinterest pin; if the block has cleared, queue all five.
- [ ] Re-read the pricing section and the FAQ on the landing page against
      what the product does *that day* — it drifted twice this week.

## Practical notes

- Launch at **12:01am PT**, Tuesday to Thursday. A launch gets one 24-hour window.
- **Do not ask anyone for upvotes.** It is against Product Hunt's rules and it gets launches penalised. Sharing the link and saying you launched is fine.
- Be at the keyboard for the first few hours. Reply to every comment. Replies do more than the post.
- Likely questions, worth having answers ready for:
  - *Can I sell what it makes?* Yes, no rights claimed, no royalty.
  - *Does it do sudoku / mazes / crosswords?* Sudoku and mazes yes — four difficulties each, every puzzle verified to have exactly one solution. Crosswords not yet. Link the type page: /sudoku-book-generator or /maze-book-generator.
  - *I've never published on KDP — where do I start?* /how-to-make-a-puzzle-book — trim sizes, the gutter table, spine, pricing, and the mistakes that get files rejected, with the numbers.
  - *Does it make the cover?* Yes — full wrap, spine sized from the page count, barcode area kept clear. Free to generate and look at; it carries a PREVIEW mark until you pay.
  - *What about large print?* There's a Large print checkbox — 8.5×11, fewer words per grid, ~23pt letters. Note it moves you to large trim, which costs more per page to print; the royalty line in the tool shows that as it happens.
  - *Why is it free? What's the catch?* No catch: the free book is complete but watermarked — a footer line on each page and PREVIEW across the cover — so it can't be published. $19 removes both.
  - *How much will I earn?* The tool shows printing cost and royalty live, and there's a full royalty calculator on the site.
  - *Is my word list uploaded?* No. Generation and PDF rendering are entirely client-side.
- Pinterest: five pins are drafted in Buffer but Pinterest is blocking links to
  the domain (new-domain spam filter; site is claimed; appeal filed). One pin
  linking to the YouTube video is live. Do not expect Pinterest traffic on
  launch day; it is a slow channel anyway.
- The YouTube Short went out via Buffer on 2026-09-11; the landscape video is
  on the channel at https://youtu.be/ph6q2ih6cBs.
- Stripe checkout has been walked in a real browser against the live link:
  "Puzzle Press Unlimited", $19.00, no sandbox badge, unit label cleared. It is
  ready. (`npm run test:livecheckout` re-checks it without charging anything.)
