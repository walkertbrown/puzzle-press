# Product Hunt — the scheduling packet

Everything needed to fill the form, in form order, nothing else. Written
2026-09-14 for a **Tuesday 2026-09-15, 12:01am PT / 2:01am CT** launch, with
every asset URL and character count checked live that morning.

`product-hunt.md` is the fuller document — reasoning, rejected options, reply
bank. This file is just the form.

---

## 0. Before you start

Sign in at <https://www.producthunt.com>, then go to
**<https://www.producthunt.com/posts/new>** (it redirects to a login page if you
are signed out — that is the only reason it would look wrong).

Have the eight image files downloaded before you begin. The form will not let
you save a half-finished draft on some steps, and hunting for files mid-form is
how the wrong image ends up in slot 1. Download links are in §5.

---

## 1. Name

```
Puzzle Press
```

## 2. Tagline — 39 of 60 characters

```
Print-ready puzzle books for Amazon KDP
```

## 3. Description — 250 of 260 characters

```
Word search, sudoku, mazes, fill-ins or crosswords. Puzzle Press lays out the whole paperback — puzzles, solutions, page numbers — then a matching cover with the spine sized to your page count. Runs in your browser. Free; pay to remove the watermark.
```

Note the em dashes are real em dashes. Paste, do not retype.

## 4. Links

**Website**

```
https://puzzlepress.bananafest-destiny.com
```

No other link field is required. If it offers X/Twitter or a pricing URL, leave
them blank rather than inventing one.

## 5. Images — download these first

| Slot | What | Download |
|---|---|---|
| Thumbnail | 512×512 square | <https://puzzlepress.bananafest-destiny.com/thumbnail.png> |
| Gallery 1 | Video (paste the URL, no file) | <https://youtu.be/ph6q2ih6cBs> |
| Gallery 2 | The card | <https://puzzlepress.bananafest-destiny.com/gallery/01-card.png> |
| Gallery 3 | The animated demo | <https://puzzlepress.bananafest-destiny.com/demo.gif> |
| Gallery 4 | Puzzle page + solutions | <https://puzzlepress.bananafest-destiny.com/gallery/02-pages.png> |
| Gallery 5 | The tool mid-use | <https://puzzlepress.bananafest-destiny.com/gallery/03-the-tool.png> |
| Gallery 6 | Solutions, close | <https://puzzlepress.bananafest-destiny.com/gallery/04-solutions.png> |
| Gallery 7 | Sudoku | <https://puzzlepress.bananafest-destiny.com/gallery/05-sudoku.png> |
| Gallery 8 | Mazes | <https://puzzlepress.bananafest-destiny.com/gallery/06-mazes.png> |

All eight verified live (HTTP 200) on 2026-09-14. The six numbered frames are
2540×1520 — Product Hunt's recommended 1270×760 at 2× — and the largest is
1.1 MB against their 3 MB ceiling.

**Order matters more than any of the images.** Most people see frames 1–3 and
stop. Video, then the card, then the GIF: the GIF is the one that converts,
because it is the whole flow in motion, but it needs the card in front of it to
say what it is.

**One known imperfection:** `demo.gif` is 900×620, not the 1.671:1 the still
frames use, so their viewer may letterbox it slightly. It is a real recording
of the product and re-rendering it at a new aspect ratio is not something to
start the night before a launch. Ship it as is.

## 6. Topics

Take these three, in this order, and take as many as the form allows:

1. **Printing** — the closest fit by a distance, and it holds only ~32
   products, so a launch there is visible rather than buried. This is the one
   that matters.
2. **Design Tools**
3. **Writing**

Do **not** add Books, Productivity, Side Projects, or Adult Coloring Books.
Books sounds perfect and is not (5,108 generic products); Side Projects
undercuts a paid product; the rest read as tag-stuffing.

## 7. Schedule

**Tuesday 2026-09-15, 12:01am PT.** Product Hunt's day runs on Pacific time and
a launch gets one 24-hour window, so a minute past midnight buys the whole day.
That is 2:01am Central — you are scheduling it, not staying up for it.

---

## 8. After it goes live — the first comment

Post this yourself as the maker, right after launch. It is long on purpose:
the first comment is where the launch is actually made, and this one is all
specifics.

> Low-content publishing on Amazon KDP is a real niche — puzzle books, journals, planners — and the tooling for it is oddly split. There are free generators that will happily make you fifty puzzles with answer keys, and then hand you a browser print-to-PDF. The paid options are $10/month subscriptions or desktop software that looks like it stopped being updated in 2011. Nothing in either camp makes the book.
>
> The hard part was never the puzzle. It's the book. KDP bounces manuscripts for boring reasons: the inside margin has to get wider as the book gets thicker, fonts have to be embedded, there's a 24-page minimum, the page count has to be even. Get one wrong and you're back in the upload queue.
>
> Puzzle Press does the whole book. Pick word search, sudoku, mazes, criss-cross fill-ins or themed crosswords and a trim size, and you get a PDF with the puzzles, a solutions section and page numbers — margins, gutter, bleed and embedded fonts already correct. Every book has the same shape: title page, copyright page, the puzzles, a Solutions divider, the answers packed as tightly as the page allows, and four ruled Notes pages at the back (five where one is needed to make the count even).
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
> There's also a large-print mode, which is the biggest sub-niche in puzzle books — one checkbox sets the trim and the word count, and the grid letters come out around 22pt instead of about 14.
>
> It is free to use, and not in the crippled sense: make the entire book, all two hundred puzzles if you want them, with solutions and a cover. The free version is marked rather than shortened — one small line in the footer of each page and a PREVIEW across the cover. $19 once removes both marks, forever. No account, no subscription, and nothing you type ever leaves your browser.
>
> There are sample books on the site — one of each kind, plus a cover — if you'd rather see the output before touching the tool. Or the 60-second video in the gallery, which is a real book being made in real time, nothing sped up.
>
> Happy to answer anything, including the KDP spec side — I went further down that rabbit hole than I expected to.

### The AI-disclosure paragraph — your call, not mine

Append this to the first comment if you want it. It is honest, it is interesting
to that audience, and it changes the conversation from "another generator" into
something people argue about, which is attention. Your name is on the launch, so
it is your decision:

> One more thing: I didn't write this. It was built end to end by an AI agent working as an employee — it picked the idea, wrote the generator and the PDF engine, deployed it, and wrote this page. I answered factual questions and provided accounts. The build log, including every plan and what actually happened, is public: https://github.com/walkertbrown/vibe-cider

My recommendation, for whatever it is worth: include it on Show HN (that crowd
will find out and being second to say it reads badly) and treat Product Hunt as
genuinely optional — the product stands on its own there.

---

## 9. Three things not to do

- **Do not ask anyone to upvote.** It is against Product Hunt's rules and it
  gets launches penalised. Saying "I launched, here's the link" is fine.
- **Do not say "free generators only make one puzzle at a time."** It was true
  when this copy was first drafted and it is not true now — several bulk-make
  fifty with answer keys, free. The real difference is puzzles versus a book,
  and it is the stronger point anyway.
- **Do not claim a user count, a revenue figure, or a testimonial.** There
  aren't any yet. Nothing in this packet asserts one.

---

## 10. Send me the link

The moment it is scheduled, paste the Product Hunt URL into the conversation. I
can read the thread and draft replies within minutes of a comment landing, but
I cannot find the page on my own. Without the link I am launching blind.
