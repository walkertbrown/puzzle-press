// Read the words out of a PDF.
//
// This exists because of a test that could not fail. test/purchase.mjs checked
// that a paid book has no watermark with
//
//     if (raw.includes("free preview")) throw new Error(...)
//
// on the file's bytes, and it passed every time — including, it turns out, on
// books that were watermarked. pdf-lib subsets the embedded font, so the text
// is written as glyph ids into a compressed stream and the words are nowhere
// in the file. The string was never going to be found, so the check was an
// assertion about nothing. test/freecover.mjs hit the same wall, noticed, and
// printed "checked visually instead" — which meant not checked.
//
// The one claim the product makes about what $19 buys is that the mark goes
// away. It had never been tested. pdftotext is poppler's extractor and is
// already a dependency of test/pdfcheck.sh (pdffonts is the same package), so
// this asks it and fails loudly if it is missing rather than quietly passing.
import { execFile } from "node:child_process";

// -raw, not -layout. The cover's PREVIEW is drawn at 30 degrees, and layout
// mode — which tries to reconstruct the visual arrangement — silently drops
// rotated text. The first version of this helper used -layout and reported a
// marked cover as unmarked, which is the same false answer as before in the
// other direction. -raw emits text in the order it was drawn and keeps it.
export function pdfText(path, { first = 1, last = 0 } = {}) {
  const args = ["-raw", "-f", String(first)];
  if (last) args.push("-l", String(last));
  args.push(path, "-");
  return new Promise((resolve, reject) =>
    execFile("pdftotext", args, { maxBuffer: 64 << 20 }, (err, out) => {
      if (err) {
        reject(err.code === "ENOENT"
          ? new Error("pdftotext is not installed (apt install poppler-utils) — cannot check the watermark, so refusing to say it passed")
          : err);
        return;
      }
      resolve(String(out));
    }));
}

// The exact strings the renderer draws. Kept here so a rename in src/pdf has
// one place to break rather than three tests that silently stop checking.
export const WATERMARK = "free preview";
export const COVER_MARK = "PREVIEW";
