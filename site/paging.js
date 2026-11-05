const Paging = (() => {
  function slice(rows, page, size) {
    const total = rows.length;
    const pages = Math.max(1, Math.ceil(total / size));
    const current = Math.min(Math.max(1, page), pages);
    const start = (current - 1) * size;
    const to = Math.min(start + size, total);
    return { rows: rows.slice(start, to), page: current, pages, total, from: total ? start + 1 : 0, to };
  }

  const pageOf = (index, size) => Math.floor(index / size) + 1;

  return { slice, pageOf };
})();

if (typeof module === "object") module.exports = Paging;
