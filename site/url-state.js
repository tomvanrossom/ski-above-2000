const UrlState = (() => {
  const GROUPS = ["all", "novice", "easy", "intermediate", "advanced"];
  const SORT_KEYS = ["name", "country", "price", "price-high", ...GROUPS.flatMap((g) => [`${g}-total`, `${g}-high`])];
  const DEFAULTS = Object.freeze({ countries: [], q: "", min: 0, maxPrice: 0, fav: false, sort: "all-high", dir: -1 });

  function parse(search) {
    const p = new URLSearchParams(search);
    const min = Number(p.get("min"));
    const maxPrice = Number(p.get("maxPrice"));
    const sort = p.get("sort");
    const dir = p.get("dir");
    return {
      countries: [...new Set((p.get("c") ?? "").split(",").map((c) => c.trim()).filter(Boolean))],
      q: (p.get("q") ?? "").slice(0, 100),
      min: Number.isFinite(min) && min > 0 ? min : DEFAULTS.min,
      maxPrice: Number.isFinite(maxPrice) && maxPrice > 0 ? maxPrice : DEFAULTS.maxPrice,
      fav: p.get("fav") === "1",
      sort: SORT_KEYS.includes(sort) ? sort : DEFAULTS.sort,
      dir: dir === "asc" ? 1 : dir === "desc" ? -1 : DEFAULTS.dir,
    };
  }

  function serialize(state) {
    const p = new URLSearchParams();
    if (state.countries.length) p.set("c", state.countries.join(","));
    if (state.q.trim()) p.set("q", state.q.trim());
    if (state.min > 0) p.set("min", String(state.min));
    if (state.maxPrice > 0) p.set("maxPrice", String(state.maxPrice));
    if (state.fav) p.set("fav", "1");
    if (state.sort !== DEFAULTS.sort) p.set("sort", state.sort);
    if (state.dir !== DEFAULTS.dir) p.set("dir", state.dir > 0 ? "asc" : "desc");
    const query = p.toString();
    return query ? `?${query}` : "";
  }

  return { parse, serialize, DEFAULTS, SORT_KEYS };
})();

if (typeof module === "object") module.exports = UrlState;
