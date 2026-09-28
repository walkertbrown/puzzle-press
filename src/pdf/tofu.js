// A character the embedded font has no glyph for prints as an empty box: a
// title typed as "Grandma's Puzzles 🌸", or in Chinese, came out of both the
// interior and the cover with boxes where the flower and the characters were,
// ready to upload (found 2026-09-28 by rendering titles nobody picks for a
// sample). Every string pdf-lib draws goes through the font's encodeText, and
// every measurement through widthOfTextAtSize, so guarding those two on the
// font instance covers every line on every page, and centring still measures
// exactly what is drawn. What was left out is collected so the page can say so.
export function guardFont(font, missing) {
  const set = new Set(font.getCharacterSet());
  const printable = (text) => {
    let out = "";
    let hit = false;
    for (const ch of String(text)) {
      // Joiners and variation selectors are the plumbing of an emoji, not
      // characters anyone typed. They draw nothing, so they always go
      // (Liberation has a ZWJ glyph, which kept a "❤️ 👨‍👩‍👧" title out of
      // Lilita) and are never reported; the emoji they belonged to is.
      if (/[\u200B-\u200D\u2060\uFE00-\uFE0F]/.test(ch)) hit = true;
      else if (/\s/.test(ch) || set.has(ch.codePointAt(0))) out += ch;
      else {
        hit = true;
        missing.add(ch);
      }
    }
    return hit ? out.replace(/[ \t]{2,}/g, " ").trim() : out;
  };
  const encode = font.encodeText.bind(font);
  const width = font.widthOfTextAtSize.bind(font);
  font.encodeText = (text) => encode(printable(text));
  font.widthOfTextAtSize = (text, size) => width(printable(text), size);
  font.printable = printable;
  return font;
}
