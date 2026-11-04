const CompareTargets = (() => {
  const MAX = 4;

  const visibleSelection = (selected, visible) => selected.filter((s) => visible.includes(s));

  function targets({ selected, visible, favourites, known }) {
    const shown = visibleSelection(selected, visible);
    if (shown.length > 0) return shown;
    return favourites.filter((s) => known.includes(s)).slice(0, MAX);
  }

  return { targets, visibleSelection, MAX };
})();

if (typeof module === "object") module.exports = CompareTargets;
