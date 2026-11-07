const GROUPS = [{ key: "all" }, ...COLOURS];
const MAX_COMPARE = CompareTargets.MAX;
const PAGE_SIZE = 50;

let areas = [];  // top-level only; villages and municipalities are reached through bySlug
let bySlug = new Map();
let state = UrlState.parse(location.search);
let selected = new Set();
let expanded = new Set();
let pendingRender = false;
let page = 1;

const childrenOf = (area) => childSlugs(area).map((s) => bySlug.get(s)).filter(Boolean);
const withChildren = (list) => list.flatMap((a) => [a, ...childrenOf(a)]);

const fig = (area, group, index) => area.figures[group]?.[index] ?? 0;
const PRICE_SORTS = { price: Price.value, "price-high": Price.perHighKm };
const sortValue = (area, key) => {
  const [group, kind] = key.split("-");
  return fig(area, group, kind === "high" ? 1 : 0);
};

function visible() {
  const text = state.q.trim().toLocaleLowerCase();
  return areas.filter((a) =>
    (state.countries.length === 0 || a.countries.some((c) => state.countries.includes(c))) &&
    (!text || a.name.toLocaleLowerCase().includes(text)) &&
    fig(a, "all", 1) >= state.min &&
    (state.maxPrice === 0 || (Price.value(a) !== null && Price.value(a) <= state.maxPrice)) &&
    (!state.fav || withChildren([a]).some((v) => Favourites.has(v.slug))));
}

function compare(a, b) {
  const collator = I18N.collator();
  if (state.sort === "name") return collator.compare(a.name, b.name) * state.dir;
  if (state.sort === "country") return collator.compare(a.countries.join(), b.countries.join()) * state.dir;
  if (state.sort in PRICE_SORTS) {
    const aPrice = PRICE_SORTS[state.sort](a);
    const bPrice = PRICE_SORTS[state.sort](b);
    if (aPrice === null && bPrice !== null) return 1;
    if (aPrice !== null && bPrice === null) return -1;
    if (aPrice !== null && bPrice !== null && aPrice !== bPrice) return (aPrice - bPrice) * state.dir;
    return collator.compare(a.name, b.name);
  }
  return (sortValue(a, state.sort) - sortValue(b, state.sort)) * state.dir || collator.compare(a.name, b.name);
}

function setState(changes, renderNow = true) {
  state = { ...state, ...changes };
  page = 1;
  history.replaceState(null, "", location.pathname + UrlState.serialize(state));
  rememberSummaryUrl();
  if (renderNow) render();
}

function scheduleRender() {
  if (pendingRender) return;
  pendingRender = true;
  requestAnimationFrame(() => {
    pendingRender = false;
    render();
  });
}

function sortButton(key, label, isNumeric = true) {
  const b = el("button", { type: "button" }, label);
  if (state.sort === key) b.setAttribute("aria-sort", state.dir > 0 ? "ascending" : "descending");
  b.addEventListener("click", () =>
    setState({ sort: key, dir: state.sort === key ? -state.dir : (isNumeric ? -1 : 1) }));
  return b;
}

function renderHead() {
  const top = el("tr");
  top.append(el("th", { class: "c-fav" }), el("th", { class: "c-cmp" }), el("th", { class: "c-name" }), el("th"));
  const priceGroup = el("th", { class: "group start", colspan: 2, scope: "colgroup" });
  priceGroup.append(el("span", {}, I18N.t("colPrice")));
  top.append(priceGroup);
  GROUPS.forEach((g) => {
    const th = el("th", { class: "group start", colspan: 2, scope: "colgroup" });
    const span = el("span");
    if (g.color) span.append(swatch(g));
    span.append(I18N.t(g.key === "all" ? "colAll" : g.key));
    th.append(span);
    top.append(th);
  });
  const sub = el("tr");
  const favTh = el("th", { class: "c-fav", scope: "col", title: I18N.t("colFav") });
  favTh.append(el("span", { "aria-hidden": "true" }, "★"), el("span", { class: "visually-hidden" }, I18N.t("colFav")));
  const compareTh = el("th", { class: "c-cmp", scope: "col", title: I18N.t("compareLimit") }, I18N.t("colCompare"));
  const areaTh = el("th", { class: "c-name" });
  areaTh.append(sortButton("name", I18N.t("colArea"), false));
  const countryTh = el("th", { class: "left" });
  countryTh.append(sortButton("country", I18N.t("colCountry"), false));
  const priceTotal = el("th", { class: "start" });
  priceTotal.append(sortButton("price", I18N.t("colTotal")));
  const priceHigh = el("th");
  priceHigh.append(sortButton("price-high", I18N.t("colHigh")));
  sub.append(favTh, compareTh, areaTh, countryTh, priceTotal, priceHigh);
  GROUPS.forEach((g) => {
    const total = el("th", { class: "start" });
    total.append(sortButton(`${g.key}-total`, I18N.t("colTotal")));
    const high = el("th");
    high.append(sortButton(`${g.key}-high`, I18N.t("colHigh")));
    sub.append(total, high);
  });
  document.getElementById("head").replaceChildren(top, sub);
}

function kmCell(value, extraClass = "") {
  const cls = [extraClass, value === 0 ? "zero" : ""].filter(Boolean).join(" ");
  return el("td", cls ? { class: cls } : {}, value === 0 ? "–" : I18N.km(value));
}

const missingCell = (extraClass = "") => el("td", { class: `${extraClass} zero`.trim() }, "–");

function priceCells(area) {
  const price = Price.value(area);
  const perHighKm = Price.perHighKm(area);
  const perKmLine = (perKm) => el("div", { class: "price-per-km" }, `${euroPerKm(perKm)}/km`);
  const high = perHighKm === null ? missingCell() : el("td", { class: "price-cell" });
  if (perHighKm !== null) high.append(el("div", { "aria-hidden": "true" }, " "), perKmLine(perHighKm));
  if (price === null) return [missingCell("start"), high];
  const total = el("td", { class: "price-cell start" });
  total.append(el("div", {}, `€ ${I18N.num(price)}`));
  const perKm = Price.perTotalKm(area);
  if (perKm !== null) total.append(perKmLine(perKm));
  return [total, high];
}

function shareBar(total, high, maxTotal) {
  const bar = el("span", { class: "bar", style: `width: ${(total / maxTotal) * 100}%`, "aria-hidden": "true" });
  bar.append(el("i", { style: `width: ${total ? (high / total) * 100 : 0}%` }));
  return bar;
}

function compareCell(area) {
  const td = el("td", { class: "c-cmp" });
  const box = el("input", { type: "checkbox", "aria-label": `${I18N.t("selectForCompare")}: ${area.name}` });
  box.checked = selected.has(area.slug);
  box.disabled = !box.checked && selected.size >= MAX_COMPARE;
  box.addEventListener("change", () => {
    const next = new Set(selected);
    if (box.checked) next.add(area.slug); else next.delete(area.slug);
    setSelected(next);
  });
  td.append(box);
  return td;
}

function favCell(a) {
  const td = el("td", { class: "c-fav" });
  td.append(Favourites.button(a.slug, () => { if (state.fav) render(); else renderCompareButton(); }));
  return td;
}

const villageRowId = (slug) => `village-${slug}`;

function villageToggle(a, children) {
  const isOpen = expanded.has(a.slug);
  const button = el("button", {
    type: "button", class: "village-toggle", "aria-expanded": isOpen,
    "aria-controls": children.map((v) => villageRowId(v.slug)).join(" "),
  });
  button.append(el("span", { "aria-hidden": "true" }, isOpen ? "▾ " : "▸ "),
    I18N.t(`${isOpen ? "hide" : "show"}${childKind(a)}`, { n: children.length }), el("span", { class: "visually-hidden" }, `: ${a.name}`));
  button.addEventListener("click", () => {
    const next = new Set(expanded);
    if (isOpen) next.delete(a.slug); else next.add(a.slug);
    expanded = next;
    render();
    document.querySelector(`[aria-controls="${button.getAttribute("aria-controls")}"]`)?.focus();
  });
  return button;
}

function areaCell(a, parent) {
  const td = el("td", { class: "c-name" });
  const meta = el("div", { class: "area-meta" });
  if (a.regions.length) meta.append(el("span", {}, a.regions.join(" · ")));
  meta.append(link(osmUrl(a.id, a.lat, a.lng, 13), I18N.t("openSkiMap")));
  td.append(el("a", { href: `area.html#${a.slug}`, class: "name" }, a.name));
  if (parent) td.append(el("span", { class: "visually-hidden" }, ` (${I18N.t("partOf")} ${parent.name})`));
  td.append(meta);
  const hint = unnamedHint(a.unnamed_share);
  if (hint) td.append(hint);
  const children = childrenOf(a);
  if (children.length) td.append(villageToggle(a, children));
  return td;
}

function areaRow(a, maxTotal, attrs = {}, parent = null) {
  const tr = el("tr", attrs);
  tr.append(favCell(a), compareCell(a), areaCell(a, parent), el("td", { class: "country" }, a.countries.map(I18N.country).join(" · ")), ...priceCells(a));
  GROUPS.forEach((g) => {
    const total = kmCell(fig(a, g.key, 0), "start");
    if (g.key === "all") total.append(shareBar(fig(a, "all", 0), fig(a, "all", 1), maxTotal));
    tr.append(total, kmCell(fig(a, g.key, 1)));
  });
  return tr;
}

function renderPager(slice) {
  const box = document.getElementById("pager");
  box.replaceChildren(...(slice.total > PAGE_SIZE ? [pager(slice, (p) => {
    page = p;
    render();
    document.getElementById("table-box").scrollIntoView({ block: "start" });
  })] : []));
}

function renderRows(list) {
  const maxTotal = Math.max(...list.map((a) => fig(a, "all", 0)), 1);
  const slice = Paging.slice([...list].sort(compare), page, PAGE_SIZE);
  page = slice.page;
  renderPager(slice);
  const rows = slice.rows.flatMap((a) => {
    const isOpen = expanded.has(a.slug);
    const children = childrenOf(a).sort(compare);
    return [areaRow(a, maxTotal, isOpen && children.length ? { class: "expanded" } : {}),
      ...children.map((v, i) => {
        const tr = areaRow(v, maxTotal, { id: villageRowId(v.slug), class: i === children.length - 1 ? "village last-child" : "village" }, a);
        tr.hidden = !isOpen;
        return tr;
      })];
  });
  document.getElementById("rows").replaceChildren(...rows);
}

function compareTargets() {
  return CompareTargets.targets({
    selected: [...selected],
    favourites: Favourites.list(),
    known: [...bySlug.keys()],
  });
}

const shownSlugs = (list) => new Set(list.flatMap((a) => [a.slug, ...(expanded.has(a.slug) ? childSlugs(a) : [])]));

function setSelected(next) {
  selected = next;
  render();
}

function selectionChip(area, isShown) {
  const parent = bySlug.get(area.parent);
  const name = parent ? `${area.name} · ${parent.name}` : area.name;
  const chip = el("li", { class: isShown ? "chip" : "chip is-hidden" });
  chip.append(el("span", {}, name));
  if (!isShown) chip.append(el("span", { class: "visually-hidden" }, ` ${I18N.t("hiddenItem")}`));
  const remove = el("button", { type: "button", "aria-label": I18N.t("removeFromCompare", { name: area.name }) }, "×");
  remove.addEventListener("click", () => {
    const next = new Set(selected);
    next.delete(area.slug);
    setSelected(next);
    (document.querySelector("#selection button") ?? document.getElementById("search")).focus();
  });
  chip.append(remove);
  return chip;
}

function renderSelection(list) {
  const isEmpty = selected.size === 0;
  const shown = shownSlugs(list);
  document.getElementById("selection")
    .replaceChildren(...[...selected].map((s) => selectionChip(bySlug.get(s), shown.has(s))));
  document.getElementById("selection-clear").hidden = isEmpty;
  document.getElementById("compare-help").classList.toggle("visually-hidden", selected.size >= 2);
  document.getElementById("compare-bar").classList.toggle("is-open", !isEmpty);
  padForCompareBar();
}

function padForCompareBar() {
  const bar = document.getElementById("compare-bar");
  document.body.style.paddingBottom = bar.classList.contains("is-open") ? `${bar.offsetHeight}px` : "";
}

new ResizeObserver(padForCompareBar).observe(document.getElementById("compare-bar"));

const hasActiveFilter = () =>
  state.q.trim() !== "" || state.countries.length > 0 || state.min > 0 || state.maxPrice > 0 || state.fav;

function renderCompareButton() {
  const targets = compareTargets();
  const button = document.getElementById("compare");
  button.textContent = I18N.t("compareSelected", { n: targets.length });
  button.disabled = targets.length < 2 || targets.length > MAX_COMPARE;
}

function renderControls() {
  const slider = document.getElementById("min");
  slider.value = state.min;
  document.getElementById("min-label").textContent = I18N.t("minKm", { n: I18N.num(state.min) });
  const priceSlider = document.getElementById("max-price");
  priceSlider.value = state.maxPrice || priceSlider.max;
  document.getElementById("max-price-label").textContent = state.maxPrice
    ? I18N.t("maxPrice", { n: `€ ${I18N.num(state.maxPrice)}` })
    : I18N.t("anyPrice");
  document.getElementById("fav").checked = state.fav;
  const search = document.getElementById("search");
  if (search.value !== state.q) search.value = state.q;
  const chosen = state.countries;
  document.getElementById("country-summary").textContent = chosen.length === 0 ? I18N.t("allCountries")
    : chosen.length <= 2 ? chosen.map(I18N.country).join(", ") : I18N.t("nCountries", { n: chosen.length });
  document.querySelectorAll("#country-list input").forEach((box) => { box.checked = chosen.includes(box.value); });
  document.getElementById("reset-filters").hidden = !hasActiveFilter();
}

function render() {
  const list = visible();
  selected = new Set([...selected].filter((s) => bySlug.has(s)));
  renderControls();
  renderHead();
  renderRows(list);
  renderSelection(list);
  renderCompareButton();
  document.getElementById("count").textContent =
    I18N.t("count", { n: I18N.num(list.length), m: I18N.num(areas.length) });
}

function renderCountryOptions() {
  const countries = [...new Set(areas.flatMap((a) => a.countries))].sort((a, b) => a.localeCompare(b));
  document.getElementById("country-list").replaceChildren(...countries.map((c, i) => {
    const label = el("label", { for: `country-${i}` });
    const box = el("input", { type: "checkbox", id: `country-${i}`, value: c });
    box.addEventListener("change", () => setState({
      countries: box.checked ? [...state.countries, c] : state.countries.filter((x) => x !== c),
    }));
    label.append(box, I18N.country(c), el("small", {}, areas.filter((a) => a.countries.includes(c)).length));
    return label;
  }));
  return countries;
}

function wireControls(maxHigh, minPrice, maxPrice) {
  const slider = document.getElementById("min");
  slider.max = maxHigh;
  slider.step = maxHigh > 100 ? 5 : 1;
  slider.addEventListener("input", () => {
    setState({ min: Number(slider.value) }, false);
    scheduleRender();
  });
  const priceSlider = document.getElementById("max-price");
  priceSlider.min = minPrice;
  priceSlider.max = maxPrice;
  priceSlider.addEventListener("input", () => {
    const value = Number(priceSlider.value);
    setState({ maxPrice: value >= maxPrice ? 0 : value }, false);
    scheduleRender();
  });
  document.getElementById("search").addEventListener("input", (e) => setState({ q: e.target.value }));
  document.getElementById("fav").addEventListener("change", (e) => setState({ fav: e.target.checked }));
  document.getElementById("country-clear").addEventListener("click", () => setState({ countries: [] }));
  document.getElementById("reset-filters").addEventListener("click", () => {
    setState({ q: "", countries: [], min: 0, maxPrice: 0, fav: false });
    document.getElementById("search").focus();
  });
  document.getElementById("selection-clear").addEventListener("click", () => {
    setSelected(new Set());
    document.getElementById("search").focus();
  });
  document.getElementById("compare").addEventListener("click", () => {
    location.href = `compare.html?a=${compareTargets().map(encodeURIComponent).join(",")}`;
  });
  document.addEventListener("click", (e) => {
    const picker = document.getElementById("country-picker");
    if (picker.open && !picker.contains(e.target)) picker.open = false;
  });
}

function isValidArea(a) {
  return a && typeof a.name === "string" && SLUG_RE.test(a.slug) && Array.isArray(a.countries) &&
    Array.isArray(a.regions) && a.figures && typeof a.figures === "object";
}

document.getElementById("count-line").append(infoButton("methodInfo", "method"));
initPage(() => { renderCountryOptions(); render(); });
addEventListener("pageshow", (e) => { if (e.persisted) render(); });
addEventListener("storage", render);
fetchJSON("data/areas.json")
  .then((data) => {
    if (!Array.isArray(data)) throw new Error("areas.json is not a list");
    const valid = data.filter(isValidArea);
    bySlug = new Map(valid.map((a) => [a.slug, a]));
    areas = valid.filter((a) => !a.parent);
    const countries = renderCountryOptions();
    const maxHigh = Math.ceil(Math.max(0, ...areas.map((a) => fig(a, "all", 1))));
    const prices = areas.map(Price.value).filter((price) => price !== null);
    const maxPrice = Math.ceil(Math.max(0, ...prices));
    const minPrice = Math.floor(Math.min(maxPrice, ...prices));
    wireControls(maxHigh, minPrice, maxPrice);
    setState({
      countries: state.countries.filter((c) => countries.includes(c)),
      min: Math.min(state.min, maxHigh),
      maxPrice: state.maxPrice < maxPrice ? state.maxPrice : 0,
    });
  })
  .catch((e) => {
    console.error(e);
    showError(document.getElementById("table-box"), I18N.t("loadError"));
  });
