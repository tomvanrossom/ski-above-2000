const isLow = (p) => p.end_m < HIGH_END_M;
const CHART = { barW: 10, gap: 4, left: 52, right: 16, top: 16, bottom: 28, height: 360, step: 250, minWidth: 600 };

function barStyle(p) {
  const color = `var(${colourOf(p.difficulty).color})`;
  return isLow(p) ? { fill: "var(--low)", stroke: color, "stroke-width": 2 } : { fill: color };
}

function showTip(e, p) {
  const tip = document.getElementById("tip");
  tip.textContent = I18N.t("tooltip", { name: p.label, len: I18N.num(p.length_m), top: I18N.num(p.start_m), bot: I18N.num(p.end_m) });
  tip.hidden = false;
  tip.style.left = Math.min(e.clientX + 12, innerWidth - 270) + "px";
  tip.style.top = e.clientY + 14 + "px";
}

function hideTip() { document.getElementById("tip").hidden = true; }

function renderChart(svg, items, allItems, onPick) {
  const { barW, gap, left, right, top, bottom, height: h, step } = CHART;
  const data = [...items].sort((a, b) => b.start_m - a.start_m);
  const width = Math.max(left + right + data.length * (barW + gap), CHART.minWidth);
  const lo = Math.floor(Math.min(HIGH_END_M, ...allItems.map((p) => p.end_m)) / step) * step;
  const hi = Math.ceil(Math.max(HIGH_END_M, ...allItems.map((p) => p.start_m)) / step) * step;
  const y = (m) => top + (hi - m) / (hi - lo) * (h - top - bottom);
  svg.setAttribute("viewBox", `0 0 ${width} ${h}`);
  svg.setAttribute("width", width);
  svg.setAttribute("height", h);
  const nodes = [];
  for (let m = lo; m <= hi; m += step) {
    nodes.push(el("svg:line", { class: "grid", x1: left, x2: width - right, y1: y(m), y2: y(m) }));
    nodes.push(el("svg:text", { x: left - 8, y: y(m) + 4, "text-anchor": "end" }, I18N.m(m)));
  }
  data.forEach((p, i) => {
    const bar = el("svg:rect", {
      class: "bar", x: left + i * (barW + gap) + gap / 2, y: y(p.start_m), width: barW,
      height: Math.max(y(p.end_m) - y(p.start_m), 2), rx: 2, ...barStyle(p), tabindex: 0,
      "aria-label": I18N.t("barAria", { name: p.label, top: I18N.num(p.start_m), bot: I18N.num(p.end_m) }),
    });
    bar.addEventListener("mousemove", (e) => showTip(e, p));
    bar.addEventListener("mouseleave", hideTip);
    bar.addEventListener("click", () => onPick(p));
    bar.addEventListener("keydown", (e) => { if (e.key === "Enter") onPick(p); });
    nodes.push(bar);
  });
  nodes.push(el("svg:line", { class: "threshold", x1: left, x2: width - right, y1: y(HIGH_END_M), y2: y(HIGH_END_M) }));
  nodes.push(el("svg:text", { x: width - right, y: y(HIGH_END_M) - 5, "text-anchor": "end" }, I18N.t("chartThreshold")));
  nodes.push(el("svg:text", { x: left, y: h - 8 }, I18N.t("chartCount", { n: I18N.num(data.length) })));
  svg.replaceChildren(...nodes);
}
