const MAP_TILES = "https://{s}.tile.opentopomap.org/{z}/{x}/{y}.png";
const MAP_ATTRIBUTION = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors, SRTM | '
  + 'style © <a href="https://opentopomap.org">OpenTopoMap</a> (CC BY-SA) | pistes & lifts: OpenSkiMap (ODbL)';
// The basemap is always light, so lines use the light palette in both themes.
const MAP_COLOURS = { novice: "#2e9a4f", easy: "#2169c4", intermediate: "#d1342b", advanced: "#1b1b1b" };
const LIFT_COLOUR = "#7a3fb0";
const START_ZOOM = 13;
const HIGHLIGHT_STYLE = { color: "#ffd84d", weight: 12, opacity: 0.9, lineCap: "round", interactive: false };

let pisteMap = null;

async function loadMapLines(slug) {
  try {
    const data = await fetchJSON(`data/maps/${slug}.json`);
    if (!Array.isArray(data?.pistes) || !Array.isArray(data?.unnamed)) throw new Error("unexpected map data");
    const isSegment = (s) => s && typeof s.difficulty === "string" && Number.isFinite(s.end_m) && Array.isArray(s.line);
    const toSegments = (segments) => (Array.isArray(segments) ? segments.filter(isSegment) : [])
      .map((s) => ({ ...s, line: s.line.map(([lng, lat]) => [lat, lng]) }));
    const isLift = (l) => l && Number.isFinite(l.bottom_m) && Number.isFinite(l.top_m) && Array.isArray(l.line);
    const lifts = (Array.isArray(data.lifts) ? data.lifts.filter(isLift) : [])
      .map((l) => ({ ...l, line: l.line.map(([lng, lat]) => [lat, lng]) }));
    return { slug, pistes: data.pistes.map(toSegments), unnamed: data.unnamed.map(toSegments), lifts };
  } catch (e) {
    console.warn("Piste map unavailable:", e);
    return null;
  }
}

const isLowSegment = (s) => s.end_m < HIGH_END_M;
const lineStyle = (s) => (isLowSegment(s)
  ? { color: MAP_COLOURS[s.difficulty], weight: 2.5, opacity: 0.75, dashArray: "6 4" }
  : { color: MAP_COLOURS[s.difficulty], weight: 4, opacity: 0.95 });

function mapPieces({ named, unnamed }, lines) {
  return [...named.map((p, i) => [p, lines.pistes[i]]), ...unnamed.map((u, i) => [u, lines.unnamed[i]])]
    .filter(([, segments]) => segments?.length);
}

function mapPopup(p, s) {
  const colour = (key) => I18N.t(key) + (key === p.difficulty && p.hardest ? ` · ${containsText(p.hardest)}` : "");
  const box = el("div", { class: "map-popup" });
  box.append(el("b", {}, p.label),
    el("div", {}, `${colour(p.difficulty)} · ${I18N.m(p.start_m)} → ${I18N.m(p.end_m)} · ${I18N.m(p.length_m)}`));
  if (p.segments > 1) {
    box.append(el("div", { class: "note" },
      I18N.t("mapSection", { colour: I18N.t(s.difficulty).toLowerCase(), from: I18N.m(s.start_m), to: I18N.m(s.end_m) })));
  }
  box.append(link(osmUrl(p.id, p.lat, p.lng, 15), I18N.t("openOnMap")));
  return box;
}

const isLowLift = (l) => l.bottom_m < HIGH_END_M;
const liftStyle = (l) => ({ color: LIFT_COLOUR, weight: 2.5, opacity: 0.9, ...(isLowLift(l) ? { dashArray: "2 5" } : {}) });

function liftType(type) {
  const key = `lift:${type}`;
  const text = I18N.t(key);
  return text === key ? String(type).replace(/_/g, " ") : text;
}

function liftPopup(l) {
  const box = el("div", { class: "map-popup" });
  box.append(el("b", {}, l.name || I18N.t("liftUnnamed")),
    el("div", {}, [l.type && liftType(l.type), `${I18N.m(l.bottom_m)} → ${I18N.m(l.top_m)}`].filter(Boolean).join(" · ")));
  return box;
}

function drawLifts(layer, lifts, showLow) {
  lifts.filter((l) => showLow || !isLowLift(l))
    .forEach((l) => L.polyline(l.line, liftStyle(l)).bindPopup(() => liftPopup(l)).addTo(layer));
}

function ensureMap(slug, pieces) {
  if (pisteMap?.slug === slug) return pisteMap;
  pisteMap?.map.remove();
  const box = el("div", { class: "map-box" });
  const map = L.map(box, { scrollWheelZoom: false });
  L.tileLayer(MAP_TILES, { maxZoom: 17, opacity: 0.55, attribution: MAP_ATTRIBUTION }).addTo(map);
  L.control.scale({ imperial: false }).addTo(map);
  const bounds = L.latLngBounds(pieces.flatMap(([, segments]) => segments.flatMap((s) => s.line)));
  const highlight = L.layerGroup().addTo(map);
  pisteMap = { slug, box, map, bounds, isFitted: false, highlight, layer: L.layerGroup().addTo(map), section: el("section") };
  return pisteMap;
}

function highlightPiste(highlight, segments) {
  highlight.clearLayers();
  segments.forEach((s) => L.polyline(s.line, HIGHLIGHT_STYLE).addTo(highlight));
}

function drawPistes({ layer, highlight }, pieces, showLow) {
  layer.clearLayers();
  highlight.clearLayers();
  pieces.flatMap(([p, segments]) => segments.map((s) => [p, s, segments]))
    .filter(([, s]) => active.has(s.difficulty) && (showLow || !isLowSegment(s)))
    .sort(([, a], [, b]) => Number(!isLowSegment(a)) - Number(!isLowSegment(b)))
    .forEach(([p, s, segments]) => {
      const line = L.polyline(s.line, lineStyle(s)).bindPopup(() => mapPopup(p, s)).addTo(layer);
      line.on("mouseover", () => line.setStyle({ weight: isLowSegment(s) ? 4 : 7 }));
      line.on("mouseout", () => line.setStyle(lineStyle(s)));
      line.on("popupopen", () => highlightPiste(highlight, segments));
      line.on("popupclose", () => highlight.clearLayers());
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
    item(`border-top: 2px dashed ${MAP_COLOURS.easy}`, "mapLegendLow"),
    item(`border-top: 3px solid ${LIFT_COLOUR}`, "mapLegendLift"));
  return legend;
}

function renderMapSection(all, lines, controls) {
  const pieces = mapPieces(all, lines);
  if (!pieces.length || typeof L === "undefined") return [];
  const m = ensureMap(lines.slug, pieces);
  drawPistes(m, pieces, controls.showLow);
  drawLifts(m.layer, lines.lifts, controls.showLow);
  m.section.replaceChildren(headingWithInfo("mapTitle", "mapInfo", "mapNote"), controls.node, m.box, mapLegend());
  return [m.section];
}

function settleMap() {
  if (!pisteMap?.box.isConnected) return;
  pisteMap.map.invalidateSize();
  if (pisteMap.isFitted) return;
  pisteMap.map.setView(pisteMap.bounds.getCenter(), START_ZOOM);
  pisteMap.isFitted = true;
}
