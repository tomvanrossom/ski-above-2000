const Price = (() => {
  function value(area) {
    const price = Number(area.skipass_price_eur);
    return Number.isFinite(price) && price > 0 ? price : null;
  }

  const perKm = (price, km) => (Number.isFinite(price) && price > 0 && km > 0 ? price / km : null);
  const perTotalKm = (area) => perKm(value(area), area.figures?.all?.[0]);
  const perHighKm = (area) => perKm(value(area), area.figures?.all?.[1]);

  return { value, perKm, perTotalKm, perHighKm };
})();

if (typeof module === "object") module.exports = Price;
