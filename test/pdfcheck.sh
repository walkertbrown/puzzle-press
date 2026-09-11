#!/usr/bin/env bash
# Render every book type and cover, then check each the way a print validator
# would: Ghostscript interprets it end to end with stop-on-error, and pdffonts
# confirms every font is embedded. This is the nearest thing to a KDP upload
# that can run on this machine.
set -euo pipefail
cd "$(dirname "$0")/.."
node - <<'JS'
(async () => {
  const fs = await import("node:fs");
  const { generateBook } = await import("./src/generator/book.js");
  const { generateSudokuBook } = await import("./src/generator/sudoku.js");
  const { generateMazeBook } = await import("./src/generator/maze.js");
  const { THEMES } = await import("./src/generator/wordlists.js");
  const { renderBook } = await import("./src/pdf/render.js");
  const { renderCover } = await import("./src/pdf/cover.js");
  const fonts = { regular: fs.readFileSync("public/fonts/LiberationSans-Regular.ttf"), bold: fs.readFileSync("public/fonts/LiberationSans-Bold.ttf") };
  fs.mkdirSync("samples/kdp", { recursive: true });
  const jobs = [
    ["ws-paid", generateBook({ pools: [THEMES.animals], count: 50, wordsPerPuzzle: 15, seed: "k" }), { licensed: true }],
    ["ws-free", generateBook({ pools: [THEMES.animals], count: 50, wordsPerPuzzle: 15, seed: "k" }), { licensed: false }],
    ["ws-bleed", generateBook({ pools: [THEMES.animals], count: 50, wordsPerPuzzle: 15, seed: "k" }), { licensed: true, bleed: true }],
    ["sudoku-paid", generateSudokuBook({ count: 50, difficulty: "graded", seed: "k" }), { licensed: true }],
    ["maze-paid", generateMazeBook({ count: 50, difficulty: "graded", seed: "k" }), { licensed: true }],
    ["ws-large", generateBook({ pools: [THEMES.garden], count: 100, wordsPerPuzzle: 14, seed: "k" }), { licensed: true, trim: "8.5x11" }],
  ];
  for (const [name, book, opts] of jobs) {
    fs.writeFileSync(`samples/kdp/${name}.pdf`, await renderBook(book, { title: "KDP Check", subtitle: "x", author: "A", trim: "6x9", ...opts, fonts }));
    fs.writeFileSync(`samples/kdp/${name}-cover.pdf`, await renderCover({ title: "KDP Check", author: "A", trim: opts.trim || "6x9", paper: "cream", pageCount: 66, puzzleCount: 50, samplePuzzle: book.puzzles[0], licensed: opts.licensed, fonts }));
  }
})();
JS
fail=0
for f in samples/kdp/*.pdf; do
  name=$(basename "$f")
  if ! out=$(timeout 180 gs -dNOPAUSE -dBATCH -dQUIET -sDEVICE=nullpage -dPDFSTOPONERROR "$f" 2>&1); then
    echo "FAIL $name: ghostscript could not interpret it"; echo "$out" | head -3; fail=1; continue
  fi
  nonemb=$(pdffonts "$f" 2>/dev/null | tail -n +3 | awk '$(NF-4)=="no"' | wc -l)
  if [ "$nonemb" != "0" ]; then echo "FAIL $name: $nonemb font(s) not embedded"; fail=1; continue; fi
  printf 'ok   %-24s %s pages, %s\n' "$name" "$(pdfinfo "$f" | awk '/^Pages/{print $2}')" "$(pdfinfo "$f" | grep 'Page size' | sed 's/Page size: *//')"
done
[ "$fail" = 0 ] && echo "PDF CHECK OK" || { echo "PDF CHECK FAILED"; exit 1; }
