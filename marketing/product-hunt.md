# Product Hunt launch — Puzzle Press

Everything here is ready to paste. Nothing in it is invented: no user counts, no
testimonials, no "months of work". Every claim maps to something the product
actually does.

---

## Name

Puzzle Press

## Tagline (60 char limit)

**Print-ready word search books for Amazon KDP** — 44 chars ← recommended

Alternates:
- Make a KDP-ready puzzle book in about a minute — 46
- Word search books, laid out to Amazon KDP spec — 46

## Description (260 char limit)

> Pick a theme or paste your own words. Puzzle Press lays out the whole paperback interior — puzzles, word banks, solutions, page numbers — as one PDF that meets Amazon KDP's margin, bleed and font rules. Runs entirely in your browser. Free up to 5 puzzles.

255 chars.

## Links

- Website: https://puzzlepress.bananafest-destiny.com
- Also try: the sample book PDF, linked in the header — people will click it

## Topics

Publishing · Design Tools · Productivity · Writing

## Gallery, in order

1. `social-card.png` — the card, sets the frame
2. `demo.gif` — the whole flow in seven beats; this is the one that converts
3. `hero-book.png` — a puzzle page beside its solutions page
4. A screenshot of the tool with the preview showing
5. A solutions page close-up

All are in `app/public/` and regenerate with `npm run images` / `npm run demo`.

---

## First comment (post this yourself, right after launch)

> Low-content publishing on Amazon KDP is a real niche — puzzle books, journals, planners — and the tooling for it is oddly bad. Free generators make one puzzle at a time. The paid options are $10/month subscriptions or desktop software that looks like it stopped being updated in 2011.
>
> The hard part was never the puzzle. It's the book. KDP bounces manuscripts for boring reasons: the inside margin has to get wider as the book gets thicker, fonts have to be embedded, there's a 24-page minimum, the page count has to be even. Get one wrong and you're back in the upload queue.
>
> Puzzle Press does the whole interior. Pick themes or paste your own word list, choose a trim size, and you get a PDF with puzzles, word banks, a solutions section and page numbers — margins, gutter, bleed and embedded fonts already correct.
>
> Four things I cared about in the puzzles themselves:
>
> • **Every word appears exactly once.** Crossing words can accidentally spell a second copy of another answer. Layouts that do it are thrown away and rebuilt.
> • **No word hidden inside another** in the same grid — DEER inside REINDEER makes a puzzle feel broken.
> • **Filler letters are screened**, so a random fill never spells something you'd rather not print in a book for kids or grandparents.
> • **Every puzzle has its own word set.** A 100-puzzle book is 100 different puzzles, not a reshuffle of twenty.
>
> Free for books up to 5 puzzles — real books, just shorter, with a small footer line. $19 once removes both limits for good. No account, no subscription, and nothing you type ever leaves your browser.
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
  - *Does it do sudoku / mazes / crosswords?* Not yet. Same pipeline, planned as updates to this app.
  - *What about large print?* Pick 8.5×11 with fewer words per puzzle — the grid scales to the page.
  - *Is my word list uploaded?* No. Generation and PDF rendering are entirely client-side.
- Before launching, clear the Stripe product's **unit label** so checkout stops
  reading "$19.00 per unlimited".
