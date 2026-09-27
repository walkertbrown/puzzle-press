// Cover colour sets, as plain hex so the page can show a swatch without
// loading pdf-lib. cover.js turns them into PDF colours.
//
// Puzzle books on Amazon sell on a colour you can see across a page of
// thumbnails, so the wrap is one strong colour edge to edge. Each set is a
// background dark enough to carry a white title, a deeper shade for the card's
// shadow, and a bright accent for the answer highlight and the selling strip.
// The title picks the set, so the same book always gets the same cover.
export const PALETTE_HEX = [
  { name: "teal", bg: "#12707a", deep: "#0a3f45", accent: "#ffc93c" },
  { name: "tomato", bg: "#c8412b", deep: "#6b1d10", accent: "#ffd978" },
  { name: "plum", bg: "#5b3f8c", deep: "#2c1d47", accent: "#ffcb47" },
  { name: "forest", bg: "#2f6b3a", deep: "#16361c", accent: "#f6d55c" },
  { name: "ocean", bg: "#1f5fa8", deep: "#0f2f57", accent: "#ffb627" },
  { name: "berry", bg: "#a8174f", deep: "#520a26", accent: "#ffe08a" },
  { name: "navy", bg: "#1b2a49", deep: "#0b1222", accent: "#f47c6b" },
  { name: "rust", bg: "#b5541c", deep: "#57260a", accent: "#fde68a" },
];

// An explicit name wins; otherwise a hash of the title picks one.
export function paletteIndex(title, name = "") {
  const named = PALETTE_HEX.findIndex((p) => p.name === name);
  if (named >= 0) return named;
  let h = 2166136261;
  for (const ch of String(title).toLowerCase()) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  return h % PALETTE_HEX.length;
}
