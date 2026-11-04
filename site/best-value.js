const BestValue = (() => {
  const round = (value, digits) => Math.round(value * 10 ** digits) / 10 ** digits;

  function bestIndexes(values, digits = 0) {
    const rounded = values.map((v) => (Number.isFinite(v) ? round(v, digits) : null));
    const present = rounded.filter((v) => v !== null);
    if (present.length < 2) return [];
    const max = Math.max(...present);
    if (max <= 0 || present.every((v) => v === max)) return [];
    return rounded.flatMap((v, i) => (v === max ? [i] : []));
  }

  return { bestIndexes };
})();

if (typeof module === "object") module.exports = BestValue;
