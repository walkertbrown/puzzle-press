// The royalty calculator page. Imports the same cost module the generator
// quotes from, so the page and the product cannot disagree about money.
import { TRIMS } from "../pdf/kdp.js";
import { printingCost, royalty, INKS, MARKETPLACE, ROYALTY_THRESHOLD } from "../pdf/kdp-cost.js";
import { toolLink, carryNote } from "./tool-link.js";
import { px } from "./px.js";

const $ = (id) => document.getElementById(id);
const el = {
  trim: $("trim"), pages: $("pages"), ink: $("ink"), list: $("list"),
  printing: $("printing"), earn: $("earn"), rate: $("rate"), minList: $("minList"),
  sum: $("sum"), warn: $("warn"), band: $("band"), market: $("market"), per100: $("per100"),
  make: $("makeBtn"), makeTop: $("makeBtnTop"), carry: $("carry"),
};

for (const [id, t] of Object.entries(TRIMS)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = t.label + (id === "6x9" ? " (most common)" : "");
  if (id === "6x9") o.selected = true;
  el.trim.append(o);
}
for (const [id, ink] of Object.entries(INKS)) {
  const o = document.createElement("option");
  o.value = id;
  o.textContent = ink.label;
  if (id === "black") o.selected = true;
  el.ink.append(o);
}
el.market.textContent = MARKETPLACE;

const money = (n) => `$${n.toFixed(2)}`;

function update() {
  const trim = el.trim.value;
  const pages = Math.max(24, Math.min(828, parseInt(el.pages.value, 10) || 24));
  const ink = el.ink.value;
  const list = Math.max(0, parseFloat(el.list.value) || 0);

  // Their numbers, carried into the generator: same trim, same ink, same list
  // price, and their page count converted to the puzzle count that reaches it.
  const link = toolLink({ trim, pages, ink, list: list > 0 ? list.toFixed(2) : "" });
  el.make.href = link.href;
  el.makeTop.href = link.href;
  el.carry.textContent = carryNote(link, trim, list > 0 ? `, priced at ${money(list)}` : "");

  const cost = printingCost({ trim, pages, ink });
  if (cost.cost === null) {
    el.printing.textContent = "—";
    el.earn.textContent = "—";
    el.rate.textContent = "—";
    el.minList.textContent = "—";
    el.band.textContent = "";
    el.per100.textContent = "";
    el.sum.textContent = "";
    el.warn.textContent = cost.note;
    el.warn.hidden = false;
    return;
  }

  const r = royalty({ list, trim, pages, ink });
  el.printing.textContent = money(r.printing);
  el.earn.textContent = money(r.royalty);
  // The threshold, and what it is actually costing them right now. The rule
  // itself was already on the page; the consequence was not, and the
  // consequence is the whole point. A book at $9.98 earns $2.69 and the same
  // book at $9.99 earns $3.69 — a dollar for a cent, because the rate steps
  // from 50% to 60%. That is the worst price on the table and it is exactly
  // where the just-under-the-round-number instinct puts you. The calculator
  // knew this and said nothing, so anyone who did not already understand the
  // threshold could read every number on the page and still price at $9.98.
  const better = list > 0 && list < ROYALTY_THRESHOLD
    ? royalty({ list: ROYALTY_THRESHOLD, trim, pages, ink }).royalty - r.royalty
    : 0;
  el.rate.textContent = `${Math.round(r.rate * 100)}% royalty rate — KDP pays 60% at ${money(ROYALTY_THRESHOLD)} and above, 50% below it.`
    + (better > 0 ? ` Listing at ${money(ROYALTY_THRESHOLD)} instead of ${money(list)} would earn ${money(better)} more a copy.` : "");
  el.minList.textContent = `${money(r.minList)} is the lowest list price that still covers printing.`;
  // The flat band is the most useful fact on this page and it was printed as
  // jargon. Black ink on regular trim costs $2.30 whether the book is 24 pages
  // or 110 — at 6x9 that is 13 puzzles against 88, so seventy-five puzzles are
  // free to print. Someone padding to the 24-page minimum to keep costs down is
  // paying the full price for a quarter of a book, and the page said "flat rate
  // up to 110 pages" at them without ever saying what it was worth.
  const freePages = cost.flatMax ? cost.flatMax - pages : 0;
  el.band.textContent = `${cost.large ? "Large trim" : "Regular trim"} · ${cost.band}`
    + (freePages > 0
      ? ` — ${freePages} more pages would cost you nothing to print.`
      : freePages === 0 && cost.flatMax
        ? ` — this is the last page at the flat rate.`
        : cost.perPage
          ? ` — past the flat band, each extra page costs ${(cost.perPage * 100).toFixed(1)}¢.`
          : "");
  el.sum.textContent = `(${money(list)} × ${r.rate}) − ${money(r.printing)} = ${money(r.royalty)}`;
  el.per100.textContent = r.royalty > 0 ? `${money(r.royalty * 100)} if you sell a hundred copies.` : "";

  if (r.royalty < 0) {
    el.warn.textContent = `At ${money(list)} this book loses ${money(Math.abs(r.royalty))} a copy. KDP will not let you publish below ${money(r.minList)}.`;
    el.warn.hidden = false;
  } else {
    el.warn.hidden = true;
  }
}

for (const node of [el.trim, el.pages, el.ink, el.list]) {
  node.addEventListener("input", update);
  node.addEventListener("change", update);
}

// The handoff into the generator, and the one number the whole strategy rests
// on. These three calculators are the only pages search has ever carried, and
// the boss's ruling was distribution over content — so "somebody used a free
// utility and then went on to make a book" is the measurement that decides
// whether the free utilities are a front door or a dead end. It cannot be read
// out of the request log: the handoff lands on /?trim=..&count=..#tool, and
// Cloudflare logs the path without the query, so it is indistinguishable from
// any other landing. One content-free beacon makes it visible. See ./px.js.
for (const [node, where] of [[el.make, "handoff"], [el.makeTop, "handofftop"]]) {
  node.addEventListener("click", () => {
    // Both buttons count as the handoff, so the strategic number stays one
    // number — and the top one says so twice, so I can tell whether putting
    // the door beside the answer is what made the difference.
    px("handoff", { keep: true });
    if (where !== "handoff") px(where, { keep: true });
  });
}

// The load beacon, added 2026-09-23 for the same reason the guide and the
// comparison page got one that morning. "Used a calculator" was counted as a
// fetch of this bundle, and a crawler that reads a <script src> fetches it
// too. The guide's version of that number was six people; all six were
// crawlers. A module body only runs in something that executes JavaScript, so
// this line is the first honest evidence that a person is on the page — and
// naming it per calculator answers the question the handoff cannot: which of
// the three free utilities search actually carries.
px("royalty");

update();
