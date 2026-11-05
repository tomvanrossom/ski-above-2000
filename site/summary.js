const GROUPS = [{ key: "all" }, ...COLOURS];
const MAX_COMPARE = CompareTargets.MAX;

let areas = [];
let state = UrlState.parse(location.search);
let selected = new Set();
let pendingRender = false;

const fig = (area, group, index) => area.figures[group]?.[index] ?? 0;
const priceValue = (area) => {
  const price = Number(area.skipass_price_eur);
  return Number.isFinite(price) && price > 0 ? price : null;
};
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
    (state.maxPrice === 0 || (priceValue(a) !== null && priceValue(a) <= state.maxPrice)) &&
    (!state.fav || Favourites.has(a.slug)));
}

function compare(a, b) {
  const collator = I18N.collator();
  if (state.sort === "name") return collator.compare(a.name, b.name) * state.dir;
  if (state.sort === "country") return collator.compare(a.countries.join(), b.countries.join()) * state.dir;
  if (state.sort === "price") {
    const aPrice = priceValue(a);
    const bPrice = priceValue(b);
    if (aPrice === null && bPrice !== null) return 1;
    if (aPrice !== null && bPrice === null) return -1;
    if (aPrice !== null && bPrice !== null && aPrice !== bPrice) return (aPrice - bPrice) * state.dir;
    return collator.compare(a.name, b.name);
  }
  return (sortValue(a, state.sort) - sortValue(b, state.sort)) * state.dir || collator.compare(a.name, b.name);
}

function setState(changes, renderNow = true) {
  state = { ...state, ...changes };
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
  const priceGroup = el("th", { class: "group start", scope: "colgroup" });
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
  const compareTh = el("th", { class: "c-cmp", scope: "col" }, I18N.t("colCompare"));
  const areaTh = el("th", { class: "c-name" });
  areaTh.append(sortButton("name", I18N.t("colArea"), false));
  const countryTh = el("th", { class: "left" });
  countryTh.append(sortButton("country", I18N.t("colCountry"), false));
  const priceTh = el("th", { class: "start" });
  priceTh.append(sortButton("price", I18N.t("colPrice")));
  sub.append(favTh, compareTh, areaTh, countryTh, priceTh);
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

function priceCell(area) {
  const price = priceValue(area);
  const td = el("td", { class: "price-cell" });
  if (price === null) {
    td.textContent = "–";
    return td;
  }
  td.append(el("div", {}, `€ ${I18N.num(price)}`));
  const totalKm = fig(area, "all", 0);
  if (totalKm > 0) td.append(el("div", { class: "price-per-km" }, `€ ${I18N.num(price / totalKm, 2)}/km`));
  return td;
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
    selected = next;
    render();
  });
  td.append(box);
  return td;
}

function favCell(a) {
  const td = el("td", { class: "c-fav" });
  td.append(Favourites.button(a.slug, () => { if (state.fav) render(); else renderCompareButton(); }));
  return td;
}

function areaCell(a) {
  const td = el("td", { class: "c-name" });
  const meta = el("div", { class: "area-meta" });
  if (a.regions.length) meta.append(el("span", {}, a.regions.join(" · ")));
  meta.append(link(osmUrl(a.id, a.lat, a.lng, 13), I18N.t("openSkiMap")));
  td.append(el("a", { href: `area.html#${a.slug}`, class: "name" }, a.name), meta);
  const hint = unnamedHint(a.unnamed_share);
  if (hint) td.append(hint);
  return td;
}

function renderRows(list) {
  const maxTotal = Math.max(...list.map((a) => fig(a, "all", 0)), 1);
  const rows = [...list].sort(compare).map((a) => {
    const tr = el("tr");
    tr.append(favCell(a), compareCell(a), areaCell(a), el("td", { class: "country" }, a.countries.map(I18N.country).join(" · ")), priceCell(a));
    GROUPS.forEach((g) => {
      const total = kmCell(fig(a, g.key, 0), "start");
      if (g.key === "all") total.append(shareBar(fig(a, "all", 0), fig(a, "all", 1), maxTotal));
      tr.append(total, kmCell(fig(a, g.key, 1)));
    });
    return tr;
  });
  document.getElementById("rows").replaceChildren(...rows);
}

function compareTargets() {
  return CompareTargets.targets({
    selected: [...selected],
    visible: visible().map((a) => a.slug),
    favourites: Favourites.list(),
    known: areas.map((a) => a.slug),
  });
}

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
}

function render() {
  const list = visible();
  selected = new Set(CompareTargets.visibleSelection([...selected], list.map((a) => a.slug)));
  renderControls();
  renderHead();
  renderRows(list);
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

initPage(() => { renderCountryOptions(); render(); });
addEventListener("pageshow", (e) => { if (e.persisted) render(); });
addEventListener("storage", render);
fetchJSON("data/areas.json")
  .then((data) => {
    if (!Array.isArray(data)) throw new Error("areas.json is not a list");
    areas = data.filter(isValidArea);
    const countries = renderCountryOptions();
    const maxHigh = Math.ceil(Math.max(0, ...areas.map((a) => fig(a, "all", 1))));
    const prices = areas.map(priceValue).filter((price) => price !== null);
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
