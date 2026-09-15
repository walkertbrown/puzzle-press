# Answers, written before anyone asks

Written on launch eve. On launch day the boss is pasting and I am drafting, and
the slowest link in that chain is me writing three paragraphs from scratch while
a thread goes cold. So: the questions that actually get asked, answered now,
while there is time to check the facts rather than remember them.

**Every number in here was checked against the code or the live site on
2026-09-14.** If a number here disagrees with `test/copy.test.js`, the test is
right and this file is stale.

**How to use these.** They are drafts, not scripts. Read the question that was
actually asked, take the paragraph that fits, and cut it down — a reply that is
obviously a prepared block reads worse than two honest sentences. Never paste
one into a thread it does not answer.

The standing rule from `launch-day.md` applies to all of it: **answer the
question asked, correct a wrong thing once with a fact and stop, and never sell
the competition down.**

---

## The ones that decide whether somebody tries it

### "Is this AI?" / "Are the puzzles AI-generated?"

No, and it is worth being plain about it because it is a real differentiator
right now.

> No AI anywhere in it. The puzzles come out of ordinary algorithms running in
> your browser — a spanning tree for the mazes, constraint propagation for the
> sudoku, backtracking placement for the word search grids. Nothing is sent to a
> server, there is no model call, and there is no API bill behind the free tier.
> The whole thing is a static site and a small Worker that does one job: check
> whether a licence email has a payment behind it.

**Why this matters to a KDP seller specifically**, and worth adding if they seem
to be one: Amazon asks publishers to disclose AI-generated content. An
algorithmically generated puzzle is not AI-generated content in the sense KDP
means — it is the same category as a crossword compiled by software in 1995 —
but a seller who has read the KDP guidelines is right to ask, and "no model was
involved at any point" is the answer they need. **Do not give them legal advice
about what to tick on the KDP form.** Say what the tool does and let them
disclose accordingly.

### "Why is it free? What's the catch?"

> The free version makes the entire book. All the puzzles, the solutions
> section, the page numbers, the cover — nothing is shortened or locked. It is
> marked instead: one small line in the footer of each page, and PREVIEW across
> the cover. $19 once removes both marks, forever, for everything you make after
> that. No account, no subscription.
>
> The catch, such as it is: I would rather you find out the layout is wrong for
> you before you pay me than after.

### "Why $19 and not a subscription?"

> Because I could not write the sentence that justifies charging rent on a
> finished file. You use this in bursts — you make four books in a weekend and
> then nothing for two months — and a subscription would be charging you most
> for the months you did not open it. $19 once, and if the tool gets better you
> get that too.

### "What stops me removing the watermark myself?"

Answer it straight. Anyone who asks this already knows the answer and is testing
whether I will pretend otherwise.

> Nothing technical, really. It renders in your browser, so the marked PDF is on
> your machine and a determined person can get the mark off it. I did not build
> a DRM arms race into a $19 tool, because the version of it that stops you is
> also the version that breaks for the person who paid.
>
> It is priced at the point where paying is easier than not.

### "Can I actually sell the books? What's the licence?"

This is the question a KDP seller most needs answered and it must be answered
without hedging.

> Yes, commercially, no royalty, no attribution. The books are yours. I have no
> claim on anything the tool outputs.
>
> The fonts too, since that is the part people are right to check: the interior
> is set in Liberation Sans, which is under the SIL Open Font License. The OFL
> says in as many words that the requirement for fonts to stay under the licence
> "does not apply to any document created using the fonts" — so a book with it
> embedded is unencumbered, and you owe nobody a credit line. The licence is
> served next to the fonts if you want to read it:
> `puzzlepress.bananafest-destiny.com/fonts/LICENSE.txt`

### "How is this different from Book Bolt / [paid tool]?"

Do not run them down. `/compare` already says when they are the better choice
and the copy has been corrected once for overstating this.

> Book Bolt is a broader KDP suite — keyword research, niche hunting, listing
> tools — with a puzzle generator among the things it does. If you want the
> research side, that is a real reason to use it and I do not do any of it.
>
> This does one thing: it makes the finished book. Interior and cover, spine
> sized to the page count, margins and gutter and bleed already right. If your
> problem is "I know what book I want and I am tired of fighting the upload
> queue", that is the thing I built for.

### "How is this different from a free generator?"

> The free ones make good puzzles. What they hand you is puzzles — usually a
> browser print-to-PDF, with the layout left to you: no title page, no page
> numbers, no even page count, and no cover. KDP will bounce a manuscript for
> any of those.
>
> The gap I kept falling into was never the puzzle. It was the book.

**Do not say we pad books to a page minimum.** We do not — a one-puzzle book is
ten pages and stays ten pages. That sentence has been written and removed four
separate times and there is a test in the repo that now fails on it.

---

## The engineering ones (mostly Hacker News)

### "How do you guarantee a sudoku has one solution?"

> It is dug rather than filled. Start from a complete grid, then remove one
> symmetric pair of clues at a time, and after each removal run the solver and
> check the grid still solves exactly one way. If it does not, the pair goes
> back and it tries a different one.
>
> The reason to care is not elegance. A puzzle with two valid answers makes the
> solutions page at the back of *your own book* wrong, and you find out from a
> review.

### "Maze generation?"

> Spanning trees, so the invariants come free: exactly one route from start to
> finish, and no unreachable cell anywhere in the grid. Difficulty comes from
> size and from how the tree is grown rather than from adding loops.

### "Word search — anything interesting?"

Four things, all of which are failures I hit and fixed:

> - **Every word appears exactly once.** Two crossing answers can accidentally
>   spell a third one somewhere else in the grid. Layouts that do it are thrown
>   away and rebuilt rather than patched.
> - **No word hidden inside another** in the same grid. DEER inside REINDEER
>   makes a puzzle feel broken even though it is technically correct.
> - **Filler letters are screened**, so a random fill never spells something you
>   would rather not print in a book aimed at kids or grandparents.
> - **Every puzzle gets its own word set.** A 100-puzzle book is 100 different
>   puzzles, not twenty reshuffled five times.

### "Why browser-side? Why no server?"

> Three reasons, in the order they actually mattered.
>
> The honest first one: a server that renders PDFs for free users is a bill that
> scales with people who are not paying. Browser-side, the free tier costs me
> static asset bandwidth and nothing else, which is why the free tier can be the
> whole book instead of a teaser.
>
> The second: it makes a promise I can actually keep. Nothing you type — your
> word lists, your book title, your name on the copyright page — leaves your
> machine, because there is nowhere for it to go. I do not have to be trusted
> about that; there is no endpoint.
>
> The third: it is instant after the first load, and it works on a plane.

### "What generates the PDF?"

> pdf-lib, plus the two Liberation Sans faces embedded as subsets. The font
> files and the render code are in a chunk that is only fetched when you
> actually click Download — which is also, usefully, how the traffic dashboard
> tells "somebody made a book" apart from "somebody opened the page", without
> any analytics script on the site.

### "Isn't KDP already flooded with low-effort puzzle books? Aren't you making that worse?"

The hostile one, and it deserves a real answer rather than a dodge. It will come
up on HN and it is not an unfair question.

> It is a fair hit and I am not going to pretend the category is short of
> books. Two things I would say against it.
>
> The floor matters. A lot of what is in that category is genuinely broken —
> sudoku with multiple solutions, word searches where the answer key is wrong,
> mazes with unreachable sections, interiors that print with the text in the
> gutter. Those are exactly the failures this refuses to emit. A tool that makes
> it harder to publish a broken book is not obviously additive to the flood.
>
> And the work that distinguishes a good puzzle book from a bad one is not the
> layout. It is the theme, the difficulty curve, the audience you had in mind.
> This takes over the part that is mechanical and gives you back the part that
> is not. Whether someone uses that time well is not something I can control
> from here.

Do not argue past this. If they are unconvinced, they are allowed to be.

### "Is it open source?"

> The repo is public — github.com/walkertbrown/puzzle-press — so the generators,
> the KDP layout maths and the tests are all readable. I have not put a licence
> on it saying "go run your own copy", because the $19 is the only thing paying
> for it. Read it, check my arithmetic, tell me where it is wrong.

### "What happens when my browser clears its storage? Do I lose the licence I paid for?"

> No. The licence is not a file on your machine — it is your payment, in Stripe.
> You re-enter the email you paid with and it unlocks again, on any machine, as
> many times as you like. If the email does not match, mail
> support@bananafest-destiny.com and the exact address Stripe has gets looked up
> by hand.

---

## The product ones

### "Does it do [kakuro / cryptic / nonogram / word scramble / cross sums]?"

Thank them, promise nothing, write it down. Two people asking for the same thing
is the best signal available about what to build next, and that is the actual
value of launch day.

> Not yet — right now it is word search, sudoku, mazes, criss-cross fill-ins and
> clued crosswords. Noting it; that is genuinely how I am deciding what is next.

**Keep a tally.** Every repeat request goes in `actual/2026-09-15.md` by name and
count, not as "several people asked for more types".

### "What trim sizes / is there large print?"

> Large print is a checkbox — it sets the trim and the word count together
> (8.5×11, fourteen words a page) so the grid auto-sizes to about 15–16 cells,
> which puts the letters at roughly 22–23pt. It is the biggest sub-category in
> puzzle books and the most common thing to get half-right.

*Say "roughly 22–23pt", not a single number.* The grid size is derived from the
page width rather than set, so the exact point size moves with the word list;
the code's own two comments about it say 22 and 23. The range is true, either
single number is a hostage.

*(Before quoting a list of trim sizes, read them off `src/pdf/kdp.js`. Do not
recite them from memory into a public thread.)*

### "Does it tell me what the book will earn?"

> It shows printing cost and royalty as you build, for the page count you are
> actually at, off Amazon's own rate table — including the large-trim rates,
> which is where the arithmetic usually goes wrong. 6×9 is regular trim; 8.5×11
> is not, and costs roughly 40% more per page. There are standalone calculators
> for that and for spine width on the site, free, no sign-up.

### "Does it work on a phone?"

> It runs, and the calculators and samples are genuinely fine on a phone. But
> you are laying out a paperback — do it on something with a screen. The mobile
> work I did was so that somebody arriving from a link can look at it properly,
> not so that anyone would build a 100-puzzle book with their thumbs.

### "Can I use my own word list / my own cover art?"

> Your own word list, yes — paste it in and it builds the puzzles from that
> instead of the 32 built-in themes. Cover art, not yet: the cover it makes is
> the correct wrap for your page count, which is the part that gets rejected.
> Bringing your own artwork into a correctly sized wrap is the obvious next
> thing and nobody has asked for it yet, so say so if they do.

---

## Three things not to say

1. **Never that we pad a book to KDP's 24-page minimum.** We do not.
2. **Never a sales figure, a user count, or "people are loving it."** On day one
   the true number is small and the false one is unrecoverable.
3. **Never a promise with a date on it.** "Noting it" is a real answer. "Next
   week" is a debt.
