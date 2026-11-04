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

function unnamedHint(share) {
  if (!(share >= UNNAMED_HINT_SHARE)) return null;
  return el("span", { class: "hint", title: I18N.t("unnamedHintTitle") }, I18N.t("unnamedHint", { p: I18N.pct(share) }));
}

let builtOn = null;

function renderFooter() {
  const footer = document.querySelector("footer");
  const credit = el("p");
  credit.append("Data from ", link("https://openskidata.org", "OpenSkiData / OpenSkiMap.org"), ", © ",
    link("https://www.openstreetmap.org/copyright", "OpenStreetMap contributors"),
    " (ODbL), Skimap.org, Who's On First, © Mapterhorn.");
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
