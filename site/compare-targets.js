const CompareTargets = (() => {
  const MAX = 4;

  function targets({ selected, favourites, known }) {
    if (selected.length > 0) return selected.slice(0, MAX);
    return favourites.filter((s) => known.includes(s)).slice(0, MAX);
  }

  return { targets, MAX };
})();

if (typeof module === "object") module.exports = CompareTargets;
