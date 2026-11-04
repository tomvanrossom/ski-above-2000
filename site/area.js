const COLUMNS = [
  { key: "label", label: "colPiste" },
  { key: "difficulty", label: "colDifficulty" },
  { key: "length_m", label: "colLength", num: true },
  { key: "start_m", label: "colStart", num: true },
  { key: "end_m", label: "colEnd", num: true },
  { key: "drop_m", label: "colDrop", num: true },
];
const DIFF_ORDER = Object.fromEntries(COLOURS.map((c, i) => [c.key, i]));

let area = null;
let active = new Set(COLOURS.map((c) => c.key));
let sort = { key: "start_m", dir: -1 };

const main = () => document.getElementById("main");
const sumKm = (list) => list.reduce((s, p) => s + p.length_m, 0) / 1000;
const pisteLabel = (p) => (p.name && p.ref ? `${p.name} (${p.ref})` : p.name || p.ref);

function items() {
  const named = area.pistes.map((p, i) => ({ ...p, label: pisteLabel(p), rowId: `p-${i}`, drop_m: p.start_m - p.end_m }));
  const unnamed = area.unnamed.map((u) => ({ ...u, label: I18N.t("unnamedPiste"), rowId: `g-${u.difficulty}` }));
  return { named, unnamed, all: [...named, ...unnamed] };
}

function section(titleKey, ...children) {
  const s = el("section");
  s.append(el("h2", {}, I18N.t(titleKey)), ...children);
  return s;
}

function stat(value, labelKey) {
  const d = el("div");
  d.append(el("b", {}, value), el("span", {}, I18N.t(labelKey)));
  return d;
}

function renderHeader({ named, unnamed, all }) {
  const header = el("header");
  const title = el("div", { class: "title-line" });
  title.append(el("h1", {}, area.name), Favourites.button(area.slug));
  const stats = el("div", { class: "stats" });
  stats.append(stat(I18N.num(named.length), "statNamed"));
  if (unnamed.length) stats.append(stat(I18N.num(unnamed.length), "statUnnamed"));
  stats.append(stat(I18N.km(sumKm(all)), "statTotal"), stat(I18N.km(sumKm(all.filter((p) => !isLow(p)))), "statHigh"),
    stat(I18N.m(Math.max(...all.map((p) => p.start_m))), "statTop"),
    stat(I18N.m(Math.min(...all.map((p) => p.end_m))), "statBottom"));
  const links = el("div", { class: "header-links" });
  links.append(link(osmUrl(area.id, area.lat, area.lng, 13), I18N.t("openOnMap")));
  header.append(el("div", { class: "eyebrow" }, [...area.regions, ...area.countries.map(I18N.country)].join(" · ")),
    title, stats);
  if (area.unnamed_share >= UNNAMED_HINT_SHARE) {
    header.append(el("p", { class: "note" }, I18N.t("qualityLine", { p: I18N.pct(area.unnamed_share) })));
  }
  header.append(links);
  return header;
}

function breakdownRow(first, named, unnamed, tag = "tr") {
  const both = [...named, ...unnamed];
  const tr = el(tag);
  const label = el("td");
  label.append(...first);
  tr.append(label, el("td", { class: "num" }, I18N.num(named.length)), el("td", { class: "num" }, I18N.num(unnamed.length)),
    el("td", { class: "num" }, I18N.km(sumKm(both))), el("td", { class: "num" }, I18N.km(sumKm(both.filter((p) => !isLow(p))))));
  return tr;
}

function renderBreakdown({ named, unnamed }) {
  const head = el("tr");
  head.append(...["colDifficulty", "colNamed", "colSegments", "colLength", "colFullyHigh"]
    .map((k, i) => el("th", i ? { class: "num" } : {}, I18N.t(k))));
  const body = el("tbody");
  body.append(...COLOURS
    .map((c) => [c, named.filter((p) => p.difficulty === c.key), unnamed.filter((p) => p.difficulty === c.key)])
    .filter(([, n, u]) => n.length + u.length > 0)
    .map(([c, n, u]) => breakdownRow([swatch(c), I18N.t(c.key)], n, u)));
  const foot = el("tfoot");
  foot.append(breakdownRow([I18N.t("colAll")], named, unnamed));
  const thead = el("thead");
  thead.append(head);
  const table = el("table", { class: "breakdown" });
  table.append(thead, body, foot);
  const box = el("div", { class: "table-box breakdown-box" });
  box.append(table);
  return section("byDifficulty", box);
}

function renderFilters(all) {
  const box = el("div", { class: "filters", role: "group", "aria-label": I18N.t("filterLabel") });
  box.append(...COLOURS.filter((c) => all.some((p) => p.difficulty === c.key)).map((c) => {
    const b = el("button", { class: "chip", type: "button", "aria-pressed": active.has(c.key) });
    b.append(swatch(c), `${I18N.t(c.key)} · ${I18N.num(all.filter((p) => p.difficulty === c.key).length)}`);
    b.addEventListener("click", () => {
      const next = new Set(active);
      if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
      active = next;
      render();
    });
    return b;
  }));
  return box;
}

function focusRow(p) {
  const row = document.getElementById(p.rowId);
  if (!row) return;
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  row.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
  row.classList.add("flash");
  setTimeout(() => row.classList.remove("flash"), 1500);
}

function compare(a, b) {
  if (sort.key === "label") return I18N.collator().compare(a.label, b.label) * sort.dir;
  if (sort.key === "difficulty") return (DIFF_ORDER[a.difficulty] - DIFF_ORDER[b.difficulty]) * sort.dir;
  return (a[sort.key] - b[sort.key]) * sort.dir;
}

function diffCell(key) {
  const td = el("td");
  const span = el("span", { class: "diff" });
  span.append(swatch(colourOf(key)), I18N.t(key));
  td.append(span);
  return td;
}

function pisteRow(p) {
  const tr = el("tr", isLow(p) ? { id: p.rowId, class: "low" } : { id: p.rowId });
  const name = el("td");
  name.append(link(osmUrl(p.id, p.lat, p.lng, 15), p.label));
  tr.append(name, diffCell(p.difficulty), ...[p.length_m, p.start_m, p.end_m, p.drop_m]
    .map((v) => el("td", { class: "num" }, I18N.m(v))));
  return tr;
}

function groupRow(g) {
  const tr = el("tr", { id: `g-${g.difficulty}`, class: "group" });
  const label = `${I18N.t(`unnamed_${g.difficulty}`)} · ${I18N.t("segments", { n: I18N.num(g.segments) })} · ${I18N.km(g.length_m / 1000)}`;
  tr.append(el("td", {}, label), diffCell(g.difficulty), el("td", { class: "num" }, I18N.m(g.length_m)),
    el("td", { class: "num" }, I18N.m(g.start_m)), el("td", { class: "num" }, I18N.m(g.end_m)), el("td"));
  return tr;
}

function renderTable(named) {
  const head = el("tr");
  head.append(...COLUMNS.map((c) => {
    const th = el("th", c.num ? { class: "num" } : {});
    const b = el("button", { type: "button" }, I18N.t(c.label));
    if (sort.key === c.key) b.setAttribute("aria-sort", sort.dir > 0 ? "ascending" : "descending");
    b.addEventListener("click", () => {
      sort = { key: c.key, dir: sort.key === c.key ? -sort.dir : (c.num ? -1 : 1) };
      render();
    });
    th.append(b);
    return th;
  }));
  const body = el("tbody");
  body.append(...named.filter((p) => active.has(p.difficulty)).sort(compare).map(pisteRow),
    ...area.unnamed_groups.filter((g) => active.has(g.difficulty)).map(groupRow));
  const thead = el("thead");
  thead.append(head);
  const table = el("table");
  table.append(thead, body);
  const box = el("div", { class: "table-box" });
  box.append(table);
  return section("tableTitle", box, el("p", { class: "note" }, I18N.t("tableNote")));
}

function render() {
  if (!area) return;
  document.title = `${area.name} · ${I18N.t("siteTitle")}`;
  const all = items();
  const svg = el("svg:svg", { id: "chart", role: "img", "aria-label": I18N.t("chartAria") });
  const chartBox = el("div", { class: "chart-box" });
  chartBox.append(svg);
  renderChart(svg, all.all.filter((p) => active.has(p.difficulty)), all.all, focusRow);
  main().replaceChildren(renderHeader(all), renderBreakdown(all), renderFilters(all.all),
    section("chartTitle", el("p", { class: "note" }, I18N.t("chartNote")), chartBox), renderTable(all.named));
}

function renderNotFound() {
  document.title = I18N.t("notFound");
  const header = el("header");
  const back = el("p");
  back.append(link(summaryHref(), I18N.t("backToSummary")));
  header.append(el("h1", {}, I18N.t("notFound")), el("p", {}, I18N.t("notFoundText")), back);
  main().replaceChildren(header);
}

function isValidArea(a) {
  return a && typeof a.name === "string" && Array.isArray(a.pistes) && Array.isArray(a.unnamed) &&
    Array.isArray(a.unnamed_groups) && Array.isArray(a.regions) && Array.isArray(a.countries) &&
    a.pistes.length + a.unnamed.length > 0;
}

async function load() {
  area = null;
  const slug = decodeURIComponent(location.hash.slice(1));
  if (!SLUG_RE.test(slug)) return renderNotFound();
  try {
    const response = await fetch(`data/areas/${slug}.json`);
    if (response.status === 404) return renderNotFound();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!isValidArea(data)) throw new Error("unexpected area data");
    area = data;
    render();
  } catch (e) {
    console.error(e);
    showError(main(), I18N.t("loadError"));
  }
}

document.getElementById("back").href = summaryHref();
initPage(() => (area ? render() : load()));
addEventListener("hashchange", load);
load();
