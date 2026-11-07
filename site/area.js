const COLUMNS = [
  { key: "label", label: "colPiste" },
  { key: "difficulty", label: "colDifficulty" },
  { key: "length_m", label: "colLength", num: true },
  { key: "high_m", label: "colHigh", num: true },
  { key: "start_m", label: "colStart", num: true },
  { key: "end_m", label: "colEnd", num: true },
  { key: "drop_m", label: "colDrop", num: true },
];
const DIFF_ORDER = Object.fromEntries(COLOURS.map((c, i) => [c.key, i]));
const PAGE_SIZE = 10;

let area = null;
let related = { parent: null, children: [] };
let active = new Set(COLOURS.map((c) => c.key));
let sort = { key: "start_m", dir: -1 };
let page = 1;
let hideShort = true;
let showLow = true;
let mapLines = null;
const loadedRoses = new Set();

const main = () => document.getElementById("main");
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

function renderHeader({ all }) {
  const header = el("header");
  const title = el("div", { class: "title-line" });
  title.append(el("h1", {}, area.name), Favourites.button(area.slug));
  const stats = el("div", { class: "stats" });
  const [totalKm, highKm] = area.figures.all;
  stats.append(stat(I18N.km(totalKm), "statTotal"), stat(I18N.km(highKm), "statHigh"),
    stat(I18N.m(Math.max(...all.map((p) => p.start_m))), "statTop"),
    stat(I18N.m(Math.min(...all.map((p) => p.end_m))), "statBottom"));
  const links = el("div", { class: "header-links" });
  links.append(link(osmUrl(area.id, area.lat, area.lng, 13), I18N.t("openOnMap")));
  header.append(el("div", { class: "eyebrow" }, [...area.regions, ...area.countries.map(I18N.country)].join(" · ")),
    title, stats);
  if (related.parent) {
    const partOf = el("p", { class: "header-links" }, `${I18N.t("partOf")} `);
    partOf.append(link(`area.html#${related.parent.slug}`, related.parent.name));
    header.append(partOf);
  }
  const quality = unnamedHint(area.unnamed_share, "qualityLine");
  if (quality) header.append(quality);
  header.append(links);
  return header;
}

function breakdownRow(first, [totalKm, highKm]) {
  const tr = el("tr");
  const label = el("td");
  label.append(...first);
  tr.append(label, el("td", { class: "num" }, I18N.km(totalKm)), el("td", { class: "num" }, I18N.km(highKm)));
  return tr;
}

function renderBreakdown() {
  const head = el("tr");
  head.append(...["colDifficulty", "colLength", "colFullyHigh"]
    .map((k, i) => el("th", i ? { class: "num" } : {}, I18N.t(k))));
  const body = el("tbody");
  body.append(...COLOURS.filter((c) => area.figures[c.key])
    .map((c) => breakdownRow([swatch(c), I18N.t(c.key)], area.figures[c.key])));
  const foot = el("tfoot");
  foot.append(breakdownRow([I18N.t("colAll")], area.figures.all));
  const thead = el("thead");
  thead.append(head);
  const table = el("table", { class: "breakdown" });
  table.append(thead, body, foot);
  const box = el("div", { class: "table-box breakdown-box" });
  box.append(table);
  return section("byDifficulty", box);
}

function renderRose() {
  const src = roseSrc(area);
  const img = el("img", { src, alt: I18N.t("roseAlt", { name: area.name }), loading: "lazy", width: 300, height: 300 });
  const figure = el("figure", { class: "rose" });
  figure.append(img, roseCredit("figcaption"));
  const s = el("section");
  s.append(headingWithInfo("roseTitle", "roseInfo", "roseNote"), figure);
  if (loadedRoses.has(src)) return s;
  s.classList.add("rose-pending");
  img.addEventListener("load", () => { loadedRoses.add(src); s.classList.remove("rose-pending"); });
  return s;
}

const hasRose = () => roseSrc(area) !== null;

function renderPair(all) {
  const pair = el("div", { class: "pair" });
  pair.append(renderBreakdown(), ...(hasRose() ? [renderRose()] : []));
  return pair;
}

function renderChildren() {
  const list = el("ul", { class: "villages" });
  list.append(...related.children.map((v) => {
    const li = el("li");
    li.append(link(`area.html#${v.slug}`, v.name));
    return li;
  }));
  return section(`title${childKind(area)}`, list);
}

function renderFilters(all, labelKey, where) {
  const box = el("div", { class: "filters", role: "group", "aria-label": I18N.t(labelKey), "data-filter": where });
  box.append(...COLOURS.filter((c) => all.some((p) => p.difficulty === c.key)).map((c) => {
    const b = el("button", { class: "chip", type: "button", "aria-pressed": active.has(c.key), "data-key": c.key });
    b.append(swatch(c), `${I18N.t(c.key)} · ${I18N.num(all.filter((p) => p.difficulty === c.key).length)}`);
    b.addEventListener("click", () => {
      const next = new Set(active);
      if (next.has(c.key)) next.delete(c.key); else next.add(c.key);
      active = next;
      page = 1;
      render();
      document.querySelector(`[data-filter="${where}"] [data-key="${c.key}"]`)?.focus();
    });
    return b;
  }));
  return box;
}

const tableRows = (named) => [...named.filter((p) => active.has(p.difficulty)).sort(compare),
  ...area.unnamed_groups.filter((g) => active.has(g.difficulty)).map((g) => ({ ...g, rowId: `g-${g.difficulty}`, isGroup: true }))];

const refreshTable = () => document.getElementById("pistes")?.replaceWith(renderTable(items()));

function focusRow(p) {
  const index = tableRows(items().named).findIndex((r) => r.rowId === p.rowId);
  if (index >= 0 && Paging.pageOf(index, PAGE_SIZE) !== page) {
    page = Paging.pageOf(index, PAGE_SIZE);
    refreshTable();
  }
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

const containsText = (hardest) => I18N.t("containsColour", { colour: I18N.t(hardest).toLowerCase() });

function diffCell(key, hardest) {
  const td = el("td");
  const span = el("span", { class: "diff" });
  span.append(swatch(colourOf(key)), I18N.t(key));
  td.append(span);
  if (hardest) td.append(el("span", { class: "contains" }, containsText(hardest)));
  return td;
}

function pisteRow(p) {
  const tr = el("tr", isLow(p) ? { id: p.rowId, class: "low" } : { id: p.rowId });
  const name = el("td");
  name.append(link(osmUrl(p.id, p.lat, p.lng, 15), p.label));
  tr.append(name, diffCell(p.difficulty, p.hardest), ...[p.length_m, p.high_m, p.start_m, p.end_m, p.drop_m]
    .map((v) => el("td", { class: "num" }, I18N.m(v))));
  return tr;
}

function groupRow(g) {
  const tr = el("tr", { id: `g-${g.difficulty}`, class: "group" });
  const label = `${I18N.t(`unnamed_${g.difficulty}`)} · ${I18N.t("segments", { n: I18N.num(g.segments) })} · ${I18N.km(g.length_m / 1000)}`;
  tr.append(el("td", {}, label), diffCell(g.difficulty), el("td", { class: "num" }, I18N.m(g.length_m)),
    el("td", { class: "num" }, I18N.m(g.high_m)), el("td", { class: "num" }, I18N.m(g.start_m)),
    el("td", { class: "num" }, I18N.m(g.end_m)), el("td"));
  return tr;
}

function renderTable({ named, all }) {
  const head = el("tr");
  head.append(...COLUMNS.map((c) => {
    const th = el("th", c.num ? { class: "num" } : {});
    const b = el("button", { type: "button" }, I18N.t(c.label));
    if (sort.key === c.key) b.setAttribute("aria-sort", sort.dir > 0 ? "ascending" : "descending");
    b.addEventListener("click", () => {
      sort = { key: c.key, dir: sort.key === c.key ? -sort.dir : (c.num ? -1 : 1) };
      page = 1;
      render();
    });
    th.append(b);
    return th;
  }));
  const body = el("tbody");
  const slice = Paging.slice(tableRows(named), page, PAGE_SIZE);
  body.append(...slice.rows.map((r) => (r.isGroup ? groupRow(r) : pisteRow(r))));
  const thead = el("thead");
  thead.append(head);
  const table = el("table");
  table.append(thead, body);
  const box = el("div", { class: "table-box" });
  box.append(table);
  const s = el("section", { id: "pistes" });
  s.append(headingWithInfo("tableTitle", "tableInfo", "tableNote"), renderFilters(all, "filterTableLabel", "table"), box,
    ...(slice.total > PAGE_SIZE ? [pager(slice, (p) => { page = p; refreshTable(); })] : []));
  return s;
}

function checkbox(id, isChecked, text, onChange) {
  const box = el("input", { id, type: "checkbox" });
  box.checked = isChecked;
  box.addEventListener("change", () => {
    onChange(box.checked);
    render();
    document.getElementById(id)?.focus();
  });
  const label = el("label", { class: "check" });
  label.append(box, el("span", {}, text));
  return label;
}

const renderHideShort = () => checkbox("hide-short", hideShort, I18N.t("hideShort", { m: I18N.m(SHORT_PISTE_M) }),
  (v) => { hideShort = v; });

function renderMap(all) {
  if (mapLines?.slug !== area.slug) return [];
  const node = el("div", { class: "chart-controls" });
  node.append(renderFilters(all.all, "filterMapLabel", "map"),
    checkbox("show-low", showLow, I18N.t("mapShowLow"), (v) => { showLow = v; }));
  return renderMapSection(all, mapLines, { node, showLow });
}

function renderChartSection(all) {
  const shown = all.all.filter((p) => active.has(p.difficulty));
  const bars = hideShort ? shown.filter((p) => !isShort(p)) : shown;
  const svg = el("svg:svg", { id: "chart", role: "img", "aria-label": I18N.t("chartAria") });
  const chartBox = el("div", { class: "chart-box" });
  chartBox.append(svg);
  renderChart(svg, bars, all.all, focusRow, shown.length - bars.length);
  const controls = el("div", { class: "chart-controls" });
  controls.append(renderFilters(all.all, "filterLabel", "chart"), renderHideShort());
  const s = el("section");
  s.append(headingWithInfo("chartTitle", "chartInfo", "chartNote"), controls, chartBox);
  return s;
}

function render() {
  if (!area) return;
  document.title = `${area.name} · ${I18N.t("siteTitle")}`;
  const all = items();
  main().replaceChildren(renderHeader(all), ...(related.children.length ? [renderChildren()] : []),
    renderPair(all), ...renderMap(all), renderChartSection(all), renderTable(all));
  settleMap();
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

async function loadRelated(data) {
  const none = { parent: null, children: [] };
  if (!data.parent && childSlugs(data).length === 0) return none;
  try {
    const all = await fetchJSON("data/areas.json");
    const bySlug = new Map(all.filter((a) => a && SLUG_RE.test(a.slug) && typeof a.name === "string").map((a) => [a.slug, a]));
    return {
      parent: bySlug.get(data.parent) ?? null,
      children: childSlugs(data).map((s) => bySlug.get(s)).filter(Boolean),
    };
  } catch (e) {
    console.warn("Parent and children unavailable:", e);
    return none;
  }
}

async function load() {
  area = null;
  related = { parent: null, children: [] };
  page = 1;
  hideShort = true;
  showLow = true;
  mapLines = null;
  const slug = decodeURIComponent(location.hash.slice(1));
  if (!SLUG_RE.test(slug)) return renderNotFound();
  loadMapLines(slug).then((lines) => {
    if (!lines || decodeURIComponent(location.hash.slice(1)) !== slug) return;
    mapLines = lines;
    render();
  });
  try {
    const response = await fetch(`data/areas/${slug}.json`);
    if (response.status === 404) return renderNotFound();
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const data = await response.json();
    if (!isValidArea(data)) throw new Error("unexpected area data");
    related = await loadRelated(data);
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
