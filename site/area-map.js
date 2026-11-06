const MAP_TILES = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
const MAP_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | '
  + 'style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC BY-SA) | pistes: OpenSkiMap (ODbL)';
// The basemap is always light, so lines use the light palette in both themes.
const MAP_COLOURS = { novice: "#2e9a4f", easy: "#2169c4", intermediate: "#d1342b", advanced: "#1b1b1b" };
const MAP_LOW = "#3f4a55";

let pisteMap = null;

async function loadMapLines(slug) {
  try {
    const data = await fetchJSON(`data/maps/${slug}.json`);
    if (!Array.isArray(data?.pistes) || !Array.isArray(data?.unnamed)) throw new Error("unexpected map data");
    const toLatLngs = (lines) => (Array.isArray(lines) ? lines.map((line) => line.map(([lng, lat]) => [lat, lng])) : []);
    return { slug, pistes: data.pistes.map(toLatLngs), unnamed: data.unnamed.map(toLatLngs) };
  } catch (e) {
    console.warn("Piste map unavailable:", e);
    return null;
  }
}

const lineStyle = (p) => (isLow(p)
  ? { color: MAP_LOW, weight: 2.5, opacity: 0.9, dashArray: "6 4" }
  : { color: MAP_COLOURS[p.difficulty], weight: 4, opacity: 0.95 });

function mapPieces({ named, unnamed }, lines) {
  return [...named.map((p, i) => [p, lines.pistes[i]]), ...unnamed.map((u, i) => [u, lines.unnamed[i]])]
    .filter(([, l]) => l?.length);
}

function mapPopup(p) {
  const box = el("div", { class: "map-popup" });
  box.append(el("b", {}, p.label),
    el("div", {}, `${I18N.t(p.difficulty)} · ${I18N.m(p.start_m)} → ${I18N.m(p.end_m)} · ${I18N.m(p.length_m)}`),
    link(osmUrl(p.id, p.lat, p.lng, 15), I18N.t("openOnMap")));
  return box;
}

function ensureMap(slug, pieces) {
  if (pisteMap?.slug === slug) return pisteMap;
  pisteMap?.map.remove();
  const box = el("div", { class: "map-box" });
  const map = L.map(box, { scrollWheelZoom: false });
  L.tileLayer(MAP_TILES, { maxZoom: 17, opacity: 0.55, attribution: MAP_ATTRIBUTION }).addTo(map);
  const bounds = L.latLngBounds(pieces.flatMap(([, lines]) => lines.flat()));
  pisteMap = { slug, box, map, bounds, isFitted: false, layer: L.layerGroup().addTo(map), section: el("section") };
  return pisteMap;
}

function drawPistes(layer, pieces, showLow) {
  layer.clearLayers();
  pieces.filter(([p]) => active.has(p.difficulty) && (showLow || !isLow(p)))
    .sort(([a], [b]) => Number(!isLow(a)) - Number(!isLow(b)))
    .forEach(([p, lines]) => {
      const line = L.polyline(lines, lineStyle(p)).bindPopup(() => mapPopup(p)).addTo(layer);
      line.on("mouseover", () => line.setStyle({ weight: isLow(p) ? 4 : 7 }));
      line.on("mouseout", () => line.setStyle(lineStyle(p)));
    });
}

function mapLegend() {
  const legend = el("div", { class: "map-legend" });
  const item = (style, key) => {
    const span = el("span");
    span.append(el("i", { style, "aria-hidden": "true" }), I18N.t(key));
    return span;
  };
  legend.append(item(`border-top: 4px solid ${MAP_COLOURS.easy}`, "mapLegendHigh"),
    item(`border-top: 2px dashed ${MAP_LOW}`, "mapLegendLow"));
  return legend;
}

function renderMapSection(all, lines, controls) {
  const pieces = mapPieces(all, lines);
  if (!pieces.length || typeof L === "undefined") return [];
  const m = ensureMap(lines.slug, pieces);
  drawPistes(m.layer, pieces, controls.showLow);
  m.section.replaceChildren(headingWithInfo("mapTitle", "mapInfo", "mapNote"), controls.node, m.box, mapLegend());
  return [m.section];
}

function settleMap() {
  if (!pisteMap?.box.isConnected) return;
  pisteMap.map.invalidateSize();
  if (pisteMap.isFitted) return;
  pisteMap.map.fitBounds(pisteMap.bounds, { padding: [16, 16] });
  pisteMap.isFitted = true;
}
