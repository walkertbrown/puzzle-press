// The royalty calculator page. Imports the same cost module the generator
// quotes from, so the page and the product cannot disagree about money.
import { TRIMS } from "../pdf/kdp.js";
import { printingCost, royalty, INKS, MARKETPLACE, ROYALTY_THRESHOLD } from "../pdf/kdp-cost.js";

const $ = (id) => document.getElementById(id);
const el = {
  trim: $("trim"), pages: $("pages"), ink: $("ink"), list: $("list"),
  printing: $("printing"), earn: $("earn"), rate: $("rate"), minList: $("minList"),
  sum: $("sum"), warn: $("warn"), band: $("band"), market: $("market"), per100: $("per100"),
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
  el.rate.textContent = `${Math.round(r.rate * 100)}% royalty rate — KDP pays 60% at ${money(ROYALTY_THRESHOLD)} and above, 50% below it.`;
  el.minList.textContent = `${money(r.minList)} is the lowest list price that still covers printing.`;
  el.band.textContent = `${cost.large ? "Large trim" : "Regular trim"} · ${cost.band}`;
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
update();
