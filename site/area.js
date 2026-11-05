const COLUMNS = [
  { key: "label", label: "colPiste" },
  { key: "difficulty", label: "colDifficulty" },
  { key: "length_m", label: "colLength", num: true },
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
const loadedRoses = new Set();

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

function priceStats() {
  const price = Price.value(area);
  if (price === null) return [];
  return [stat(`€ ${I18N.num(price)}`, "statPrice"),
    ...[[Price.perTotalKm(area), "statPerKm"], [Price.perHighKm(area), "statPerHighKm"]]
      .filter(([v]) => v !== null).map(([v, label]) => stat(euroPerKm(v), label))];
}

function renderHeader({ all }) {
  const header = el("header");
  const title = el("div", { class: "title-line" });
  title.append(el("h1", {}, area.name), Favourites.button(area.slug));
  const stats = el("div", { class: "stats" });
  stats.append(stat(I18N.km(sumKm(all)), "statTotal"), stat(I18N.km(sumKm(all.filter((p) => !isLow(p)))), "statHigh"),
    stat(I18N.m(Math.max(...all.map((p) => p.start_m))), "statTop"),
    stat(I18N.m(Math.min(...all.map((p) => p.end_m))), "statBottom"), ...priceStats());
  const links = el("div", { class: "header-links" });
  links.append(link(osmUrl(area.id, area.lat, area.lng, 13), I18N.t("openOnMap")));
  header.append(el("div", { class: "eyebrow" }, [...area.regions, ...area.countries.map(I18N.country)].join(" · ")),
    title, stats);
  if (related.parent) {
    const partOf = el("p", { class: "header-links" }, `${I18N.t("partOf")} `);
    partOf.append(link(`area.html#${related.parent.slug}`, related.parent.name));
    header.append(partOf);
  }
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
  tr.append(label, el("td", { class: "num" }, I18N.km(sumKm(both))), el("td", { class: "num" }, I18N.km(sumKm(both.filter((p) => !isLow(p))))));
  return tr;
}

function renderBreakdown({ named, unnamed }) {
  const head = el("tr");
  head.append(...["colDifficulty", "colLength", "colFullyHigh"]
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

function renderRose() {
  const src = `https://openskistats.org/ski-areas/roses-openskimap/${encodeURIComponent(area.id)}.svg`;
  const img = el("img", { src, alt: I18N.t("roseAlt", { name: area.name }), loading: "lazy", width: 360, height: 360 });
  const links = { ost: link("https://openskistats.org", "OpenSkiStats"), cc: link("https://creativecommons.org/licenses/by/4.0/", "CC BY 4.0") };
  const caption = el("figcaption", { class: "note" });
  caption.append(...I18N.t("roseCredit").split(/\{(\w+)\}/).map((part, i) => (i % 2 ? links[part] : part)));
  const figure = el("figure", { class: "rose" });
  figure.append(img, caption);
  const s = section("roseTitle", el("p", { class: "note" }, I18N.t("roseNote")), figure);
  if (loadedRoses.has(src)) return s;
  s.classList.add("rose-pending");
  img.addEventListener("load", () => { loadedRoses.add(src); s.classList.remove("rose-pending"); });
  return s;
}

const hasRose = () => typeof area.id === "string" && area.id !== "" && area.kind !== "municipality";

function renderPair(all) {
  const pair = el("div", { class: "pair" });
  pair.append(renderBreakdown(all), ...(hasRose() ? [renderRose()] : []));
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

function pagerButton(key, target, isDisabled) {
  const b = el("button", { class: "chip", type: "button", "data-pager": key }, I18N.t(key));
  b.disabled = isDisabled;
  b.addEventListener("click", () => {
    page = target;
    refreshTable();
    const pressed = document.querySelector(`[data-pager="${key}"]`);
    (pressed?.disabled ? document.querySelector(".pager button:not(:disabled)") : pressed)?.focus();
  });
  return b;
}

function renderPager({ page: current, pages, from, to, total }) {
  const status = el("p", { class: "pager-status", "aria-live": "polite" });
  const text = I18N.t("pageStatus", { from: I18N.num(from), to: I18N.num(to), total: I18N.num(total) });
  requestAnimationFrame(() => { status.textContent = text; });
  const pager = el("nav", { class: "pager", "aria-label": I18N.t("pagerLabel") });
  pager.append(pagerButton("pagePrev", current - 1, current === 1), status, pagerButton("pageNext", current + 1, current === pages));
  return pager;
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
  const s = section("tableTitle", renderFilters(all, "filterTableLabel", "table"), box,
    ...(slice.total > PAGE_SIZE ? [renderPager(slice)] : []), el("p", { class: "note" }, I18N.t("tableNote")));
  s.id = "pistes";
  return s;
}

function renderHideShort() {
  const box = el("input", { id: "hide-short", type: "checkbox" });
  box.checked = hideShort;
  box.addEventListener("change", () => {
    hideShort = box.checked;
    render();
    document.getElementById("hide-short")?.focus();
  });
  const label = el("label", { class: "check" });
  label.append(box, el("span", {}, I18N.t("hideShort", { m: I18N.m(SHORT_PISTE_M) })));
  return label;
}

function renderChartSection(all) {
  const shown = all.all.filter((p) => active.has(p.difficulty));
  const bars = hideShort ? shown.filter((p) => !isShort(p)) : shown;
  const svg = el("svg:svg", { id: "chart", role: "img", "aria-label": I18N.t("chartAria") });
  const chartBox = el("div", { class: "chart-box" });
  chartBox.append(svg);
  renderChart(svg, bars, all.all, focusRow, shown.length - bars.length);
  return section("chartTitle", el("p", { class: "note" }, I18N.t("chartNote")), renderHideShort(), chartBox);
}

function render() {
  if (!area) return;
  document.title = `${area.name} · ${I18N.t("siteTitle")}`;
  const all = items();
  main().replaceChildren(renderHeader(all), ...(related.children.length ? [renderChildren()] : []),
    renderPair(all), renderFilters(all.all, "filterLabel", "chart"), renderChartSection(all), renderTable(all));
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
  const slug =decodeURIComponent(location.hash.slice(1));
  if (!SLUG_RE.test(slug)) return renderNotFound();
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
