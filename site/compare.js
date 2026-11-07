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
const highShare = (a) => (fig(a, "all", 0) ? fig(a, "all", 1) / fig(a, "all", 0) : 0);

function aspectShare(a, directions) {
  const metres = a.aspect && typeof a.aspect === "object" ? a.aspect : {};
  const total = Object.values(metres).reduce((sum, m) => sum + (Number.isFinite(m) ? m : 0), 0);
  return total ? directions.reduce((sum, d) => sum + (metres[d] || 0), 0) / total : null;
}

function rows() {
  const pair = (group) => [(a) => fig(a, group, 0), (a) => fig(a, group, 1)];
  const kmRow = (label, group, swatchOf) => ({ label, swatchOf, ...KM, best: true, cells: pair(group) });
  return [
    kmRow(I18N.t("rowTotal"), "all"),
    { label: I18N.t("rowPctHigh"), ...PCT, best: true, cells: [highShare] },
    ...COLOURS.map((c) => kmRow(I18N.t(c.key), c.key, c)),
    { label: I18N.t("rowTop"), ...METRES, best: true, cells: [(a) => Math.max(...pieces(a).map((p) => p.start_m))] },
    { label: I18N.t("rowBottom"), ...METRES, cells: [(a) => Math.min(...pieces(a).map((p) => p.end_m))] },
    { label: I18N.t("rowShady"), info: "aspectNote", ...PCT, best: true, cells: [(a) => aspectShare(a, ["N", "NE"])] },
    { label: I18N.t("rowSunny"), ...PCT, cells: [(a) => aspectShare(a, ["S", "SW"])] },
  ];
}

function valueCell(text, isBest, colspan, isStart) {
  const cls = [isStart ? "start" : "", isBest ? "best" : ""].filter(Boolean).join(" ");
  const td = el("td", cls ? { class: cls, colspan } : { colspan }, text);
  if (isBest) td.append(el("span", { class: "visually-hidden" }, ` (${I18N.t("best")})`));
  return td;
}

function headerRows() {
  const names = el("tr");
  const subs = el("tr", { class: "sub" });
  names.append(el("td"));
  subs.append(el("td"));
  loaded.forEach((a) => {
    const th = el("th", { scope: "colgroup", colspan: 2, class: "start" });
    th.append(Favourites.button(a.slug), " ", link(`area.html#${a.slug}`, a.name));
    names.append(th);
    subs.append(el("th", { scope: "col", class: "start" }, I18N.t("colTotal")), el("th", { scope: "col" }, I18N.t("colHigh")));
  });
  return [names, subs];
}

function bestOf(row, values) {
  return new Set(row.best ? BestValue.bestIndexes(values, row.digits) : []);
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
  if (row.info) th.append(" ", infoButton("aspectInfo", row.info));
  const colspan = 2 / row.cells.length;
  const columns = row.cells.map((raw) => {
    const values = loaded.map(raw);
    return { values, best: bestOf(row, values) };
  });
  tr.append(th, ...loaded.flatMap((_, i) => columns.map((c, k) =>
    valueCell(c.values[i] === null ? "–" : row.format(c.values[i]), c.best.has(i), colspan, k === 0))));
  return tr;
}

function roseCell(a) {
  const src = roseSrc(a);
  const td = el("td", { colspan: 2, class: "rose-cell start" }, src ? undefined : "–");
  if (!src) return td;
  const img = el("img", { src, alt: I18N.t("roseAlt", { name: a.name }), loading: "lazy", width: 160, height: 160 });
  img.addEventListener("error", () => { td.textContent = "–"; });
  td.append(img);
  return td;
}

function roseRow() {
  const tr = el("tr");
  tr.append(el("th", { scope: "row" }, I18N.t("roseTitle")), ...loaded.map(roseCell));
  return tr;
}

const mapLines = new Map();
let miniMaps = [];
let showLow = true;

function showLowToggle() {
  const box = el("input", { id: "show-low", type: "checkbox" });
  box.checked = showLow;
  box.addEventListener("change", () => {
    showLow = box.checked;
    miniMaps.forEach(drawMiniLines);
  });
  const label = el("label", { class: "check" });
  label.append(box, el("span", {}, I18N.t("mapShowLow")));
  return label;
}

function mapRow() {
  const tr = el("tr");
  const th = el("th", { scope: "row" });
  th.append(el("div", {}, I18N.t("mapTitle")), showLowToggle(), mapLegend());
  tr.append(th,
    ...loaded.map((a) => {
      const td = el("td", { colspan: 2, class: "map-cell start" });
      td.append(el("div", { class: "cmp-map", "data-slug": a.slug }));
      return td;
    }));
  return tr;
}

async function drawMiniMap(box) {
  const slug = box.dataset.slug;
  if (!mapLines.has(slug)) mapLines.set(slug, loadMapLines(slug));
  const lines = await mapLines.get(slug);
  const segments = lines ? [...lines.pistes, ...lines.unnamed].flat() : [];
  if (!box.isConnected) return;
  if (!segments.length || typeof L === "undefined") {
    box.replaceWith("–");
    return;
  }
  const map = L.map(box, { scrollWheelZoom: false, attributionControl: false });
  L.tileLayer(MAP_TILES, { maxZoom: 17, opacity: 0.55 }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  const mini = { layer: L.layerGroup().addTo(map), segments, lifts: lines.lifts };
  miniMaps.push(mini);
  drawMiniLines(mini);
  map.setView(L.latLngBounds(segments.flatMap((s) => s.line)).getCenter(), START_ZOOM);
}

function drawMiniLines({ layer, segments, lifts }) {
  layer.clearLayers();
  segments.filter((s) => showLow || !isLowSegment(s))
    .sort((a, b) => Number(!isLowSegment(a)) - Number(!isLowSegment(b)))
    .forEach((s) => L.polyline(s.line, lineStyle(s)).addTo(layer));
  drawLifts(layer, lifts, showLow);
}

function mapCredit() {
  const credit = el("p", { class: "note" });
  credit.innerHTML = MAP_ATTRIBUTION;
  return credit;
}

function render() {
  const container = document.getElementById("main");
  if (loaded.length === 0) {
    container.replaceChildren(el("p", { class: "note" }, I18N.t("compareEmpty")));
    return;
  }
  const thead = el("thead");
  thead.append(...headerRows());
  const tbody = el("tbody");
  tbody.append(...rows().map(bodyRow), roseRow(), mapRow());
  const cols = el("colgroup");
  cols.append(el("col", { class: "label-col" }), ...loaded.flatMap(() => [el("col"), el("col")]));
  const table = el("table", { id: "compare", style: `min-width: calc(var(--label-w) + ${loaded.length} * var(--area-w))` });
  table.append(cols, thead, tbody);
  const box = el("div", { class: "table-box" });
  box.append(table);
  const notes = missing.length ? [el("p", { class: "note" }, I18N.t("compareMissing", { slugs: missing.join(", ") }))] : [];
  container.replaceChildren(box, roseCredit(), mapCredit(), ...notes);
  miniMaps = [];
  container.querySelectorAll(".cmp-map").forEach(drawMiniMap);
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
