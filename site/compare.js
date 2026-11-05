const MAX_COMPARE = 4;
let loaded = [];
let missing = [];

function requestedSlugs() {
  const raw = new URLSearchParams(location.search).get("a");
  const slugs = raw ? raw.split(",") : Favourites.list();
  return [...new Set(slugs.map((s) => s.trim()).filter((s) => SLUG_RE.test(s)))].slice(0, MAX_COMPARE);
}

const fig = (a, group, index) => a.figures[group]?.[index] ?? 0;
const pieces = (a) => [...a.pistes, ...a.unnamed];

const KM = { format: (n) => I18N.km(n), digits: 1 };
const PCT = { format: (n) => I18N.pct(n), digits: 2 };
const METRES = { format: (n) => I18N.m(n), digits: 0 };
const PRICE = { format: (n) => n === null ? "–" : `€ ${I18N.num(n)}`, digits: 0 };
const PRICE_KM = { format: (n) => n === null ? "–" : euroPerKm(n), digits: 2 };
const highShare = (a) => (fig(a, "all", 0) ? fig(a, "all", 1) / fig(a, "all", 0) : 0);

function rows() {
  const kmRow = (label, group, index, swatchOf) => ({ label, swatchOf, ...KM, best: true, raw: (a) => fig(a, group, index) });
  const priceRow = (label, raw, format) => ({ label, ...format, best: "lowest", bestLabel: I18N.t("cheapest"), raw });
  return [
    priceRow(I18N.t("rowPrice"), Price.value, PRICE),
    priceRow(I18N.t("rowPricePerHighKm"), Price.perHighKm, PRICE_KM),
    priceRow(I18N.t("rowPricePerKm"), Price.perTotalKm, PRICE_KM),
    kmRow(I18N.t("rowTotal"), "all", 0),
    kmRow(I18N.t("rowHigh"), "all", 1),
    { label: I18N.t("rowPctHigh"), ...PCT, best: true, raw: highShare },
    ...COLOURS.flatMap((c) => [
      kmRow(I18N.t("rowColourTotal", { colour: I18N.t(c.key) }), c.key, 0, c),
      kmRow(I18N.t("rowColourHigh", { colour: I18N.t(c.key) }), c.key, 1, c),
    ]),
    { label: I18N.t("rowTop"), ...METRES, best: true, raw: (a) => Math.max(...pieces(a).map((p) => p.start_m)) },
    { label: I18N.t("rowBottom"), ...METRES, raw: (a) => Math.min(...pieces(a).map((p) => p.end_m)) },
    { label: I18N.t("rowQuality"), ...PCT, raw: (a) => a.unnamed_share },
  ];
}

function valueCell(text, isBest, bestLabel = I18N.t("best")) {
  if (!isBest) return el("td", {}, text);
  const td = el("td", { class: "best" }, text);
  td.append(el("span", { class: "visually-hidden" }, ` (${bestLabel})`));
  return td;
}

function headerRow() {
  const tr = el("tr");
  tr.append(el("td"));
  loaded.forEach((a) => {
    const th = el("th", { scope: "col" });
    th.append(Favourites.button(a.slug), " ", link(`area.html#${a.slug}`, a.name));
    tr.append(th);
  });
  return tr;
}

function bodyRow(row) {
  const tr = el("tr");
  const th = el("th", { scope: "row" });
  if (row.swatchOf) {
    const span = el("span", { class: "colour" });
    span.append(swatch(row.swatchOf), row.label);
    th.append(span);
  } else {
    th.append(row.label);
  }
  const values = loaded.map(row.raw);
  const best = new Set(row.best === "lowest"
    ? BestValue.lowestIndexes(values, row.digits)
    : row.best ? BestValue.bestIndexes(values, row.digits) : []);
  tr.append(th, ...values.map((v, i) => valueCell(row.format(v), best.has(i), row.bestLabel)));
  return tr;
}

function render() {
  const container = document.getElementById("main");
  if (loaded.length === 0) {
    container.replaceChildren(el("p", { class: "note" }, I18N.t("compareEmpty")));
    return;
  }
  const thead = el("thead");
  thead.append(headerRow());
  const tbody = el("tbody");
  tbody.append(...rows().map(bodyRow));
  const table = el("table", { id: "compare" });
  table.append(thead, tbody);
  const box = el("div", { class: "table-box" });
  box.append(table);
  const notes = missing.length ? [el("p", { class: "note" }, I18N.t("compareMissing", { slugs: missing.join(", ") }))] : [];
  container.replaceChildren(box, ...notes);
}

async function loadArea(slug) {
  const response = await fetch(`data/areas/${slug}.json`);
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`${slug}: HTTP ${response.status}`);
  const data = await response.json();
  const isValid = data && typeof data.name === "string" && data.figures && Array.isArray(data.pistes) && Array.isArray(data.unnamed);
  if (!isValid) throw new Error(`${slug}: unexpected area data`);
  return { ...data, slug };
}

document.getElementById("back").href = summaryHref();
initPage(render);
const slugs = requestedSlugs();
Promise.all(slugs.map(loadArea))
  .then((areas) => {
    loaded = areas.filter(Boolean);
    missing = slugs.filter((_, i) => !areas[i]);
    render();
  })
  .catch((e) => {
    console.error(e);
    showError(document.getElementById("main"), I18N.t("loadError"));
  });
