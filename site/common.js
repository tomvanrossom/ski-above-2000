const HIGH_END_M = 2000;
const COLOURS = [
  { key: "novice", color: "--green" },
  { key: "easy", color: "--blue" },
  { key: "intermediate", color: "--red" },
  { key: "advanced", color: "--black" },
];
const SLUG_RE = /^[a-z0-9-]+$/;
const SUMMARY_URL_KEY = "ski-above-2000:summary-url";
const UNNAMED_HINT_SHARE = 0.3;
const svgNS = "http://www.w3.org/2000/svg";
const CHILD_LISTS = ["villages", "municipalities"];
const childSlugs = (area) => CHILD_LISTS.flatMap((k) => (Array.isArray(area[k]) ? area[k] : []));
const childKind = (area) => (Array.isArray(area.municipalities) ? "Municipalities" : "Villages");
const euroPerKm = (n) => `€ ${I18N.num(n, 2)}`;

function el(tag, attrs = {}, text) {
  const node = tag.startsWith("svg:") ? document.createElementNS(svgNS, tag.slice(4)) : document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => node.setAttribute(k, v));
  if (text !== undefined) node.textContent = text;
  return node;
}

function link(href, text, attrs = {}) {
  const external = /^https?:/.test(href) ? { target: "_blank", rel: "noopener" } : {};
  return el("a", { href, ...external, ...attrs }, text);
}

function roseSrc(area) {
  const hasRose = typeof area.id === "string" && area.id !== "" && area.kind !== "municipality";
  return hasRose ? `https://openskistats.org/ski-areas/roses-openskimap/${encodeURIComponent(area.id)}.svg` : null;
}

function roseCredit(tag = "p") {
  const links = { ost: link("https://openskistats.org", "OpenSkiStats"), cc: link("https://creativecommons.org/licenses/by/4.0/", "CC BY 4.0") };
  const credit = el(tag, { class: "note" });
  credit.append(...I18N.t("roseCredit").split(/\{(\w+)\}/).map((part, i) => (i % 2 ? links[part] : part)));
  return credit;
}

async function fetchJSON(url) {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`);
  return response.json();
}

function osmUrl(id, lat, lng, zoom) {
  const base = `https://openskimap.org/?obj=${encodeURIComponent(id)}`;
  return Number.isFinite(lat) && Number.isFinite(lng) ? `${base}#${zoom}/${lat}/${lng}` : base;
}

function swatch(colour) {
  return el("span", { class: "dot", style: `--c: var(${colour.color}); background: var(--c)`, "aria-hidden": "true" });
}

const colourOf = (key) => COLOURS.find((c) => c.key === key);

function showError(container, message) {
  container.replaceChildren(el("p", { class: "error", role: "alert" }, message));
}

function rememberSummaryUrl() {
  try {
    sessionStorage.setItem(SUMMARY_URL_KEY, "index.html" + location.search);
  } catch (e) {
    console.warn("Summary URL not remembered:", e);
  }
}

function summaryHref() {
  try {
    const saved = sessionStorage.getItem(SUMMARY_URL_KEY);
    if (saved && /^index\.html(\?[^#]*)?$/.test(saved)) return saved;
  } catch (e) {
    console.warn("Summary URL unavailable:", e);
  }
  return "index.html";
}

function unnamedHint(share, textKey = "unnamedHintTitle") {
  if (!(share >= UNNAMED_HINT_SHARE)) return null;
  const hint = el("span", { class: "hint" }, I18N.t("unnamedHint", { p: I18N.pct(share) }));
  hint.append(infoButton("unnamedInfo", textKey, { p: I18N.pct(share) }));
  return hint;
}

const INFO_GAP_PX = 6;
const INFO_MARGIN_PX = 16;
let infoSeq = 0;

function placeInfo(wrap) {
  const pop = wrap.querySelector(".info-pop");
  const r = wrap.querySelector("button").getBoundingClientRect();
  const maxLeft = document.documentElement.clientWidth - INFO_MARGIN_PX - pop.offsetWidth;
  pop.style.top = `${r.bottom + INFO_GAP_PX}px`;
  pop.style.left = `${Math.max(INFO_MARGIN_PX, Math.min(r.left, maxLeft))}px`;
}

function setInfo(wrap, isOpen, isPinned = false) {
  if (isOpen) document.querySelectorAll(".info").forEach((w) => { if (w !== wrap) setInfo(w, false); });
  wrap.querySelector("button").setAttribute("aria-expanded", isOpen);
  wrap.querySelector(".info-pop").hidden = !isOpen;
  wrap.classList.toggle("pinned", isPinned);
  if (isOpen) placeInfo(wrap);
}

function infoButton(labelKey, textKey, vars) {
  const id = `info-${++infoSeq}`;
  const wrap = el("span", { class: "info" });
  const button = el("button", {
    type: "button", class: "info-btn", "aria-label": I18N.t(labelKey), "data-i18n-aria": labelKey,
    "aria-expanded": false, "aria-controls": id, "aria-describedby": id,
  }, "i");
  const pop = el("span", { id, class: "info-pop", role: "tooltip", ...(vars ? {} : { "data-i18n": textKey }) }, I18N.t(textKey, vars));
  pop.hidden = true;
  wrap.append(button, pop);
  const isPinned = () => wrap.classList.contains("pinned");
  const closeUnlessPinned = () => { if (!isPinned()) setInfo(wrap, false); };
  wrap.addEventListener("mouseenter", () => setInfo(wrap, true, isPinned()));
  wrap.addEventListener("mouseleave", () => { if (document.activeElement !== button) closeUnlessPinned(); });
  button.addEventListener("focus", () => setInfo(wrap, true, isPinned()));
  button.addEventListener("blur", () => { if (!wrap.matches(":hover")) closeUnlessPinned(); });
  button.addEventListener("click", () => setInfo(wrap, !isPinned(), !isPinned()));
  return wrap;
}

const openInfos = () => [...document.querySelectorAll(".info-btn[aria-expanded='true']")].map((b) => b.closest(".info"));
document.addEventListener("keydown", (e) => { if (e.key === "Escape") openInfos().forEach((w) => setInfo(w, false)); });
document.addEventListener("click", (e) => openInfos().forEach((w) => { if (!w.contains(e.target)) setInfo(w, false); }));
addEventListener("scroll", () => openInfos().forEach(placeInfo), { capture: true, passive: true });
addEventListener("resize", () => openInfos().forEach(placeInfo));

function headingWithInfo(titleKey, labelKey, textKey) {
  const row = el("div", { class: "heading-row" });
  row.append(el("h2", {}, I18N.t(titleKey)), infoButton(labelKey, textKey));
  return row;
}

let builtOn = null;

function renderFooter() {
  const footer = document.querySelector("footer");
  const credit = el("p");
  credit.append("Data from ", link("https://openskidata.org", "OpenSkiData / OpenSkiMap.org"), ", © ",
    link("https://www.openstreetmap.org/copyright", "OpenStreetMap contributors"),
    " (ODbL), Skimap.org, Who's On First, © Mapterhorn, slope roses from ", link("https://openskistats.org", "openskistats.org"), ".");
  const [before, after] = I18N.t("dataLicence").split("{odbl}");
  const licence = el("p");
  licence.append(before, link("https://opendatacommons.org/licenses/odbl/1-0/", "ODbL 1.0"), after, " ",
    link("data/areas.json", I18N.t("download")), " (data/areas.json, data/areas/<slug>.json).");
  const boundary = el("p");
  boundary.append(link("https://doi.org/10.48784/VK93-8P54", I18N.t("boundaryCredit")));
  footer.replaceChildren(credit, licence, boundary,
    ...(builtOn ? [el("p", {}, I18N.t("builtOn", { date: I18N.date(builtOn) }))] : []));
}

function initPage(render) {
  I18N.mountSwitch();
  I18N.apply();
  renderFooter();
  I18N.onChange(() => { renderFooter(); render(); });
  fetchJSON("data/meta.json")
    .then((meta) => {
      builtOn = typeof meta.built === "string" && /^\d{4}-\d{2}-\d{2}$/.test(meta.built) ? meta.built : null;
      renderFooter();
    })
    .catch((e) => console.warn("Build metadata unavailable:", e));
}
