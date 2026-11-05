const test = require("node:test");
const assert = require("node:assert/strict");
const Paging = require("../site/paging.js");

const rows = Array.from({ length: 23 }, (_, i) => i);

test("slice returns the rows and range of the requested page", () => {
  assert.deepEqual(Paging.slice(rows, 2, 10), { rows: [10, 11, 12, 13, 14, 15, 16, 17, 18, 19], page: 2, pages: 3, total: 23, from: 11, to: 20 });
});

test("last page holds the remainder", () => {
  const last = Paging.slice(rows, 3, 10);
  assert.deepEqual(last.rows, [20, 21, 22]);
  assert.equal(last.from, 21);
  assert.equal(last.to, 23);
});

test("page is clamped to the available pages", () => {
  assert.equal(Paging.slice(rows, 9, 10).page, 3);
  assert.equal(Paging.slice(rows, 0, 10).page, 1);
});

test("empty list is one empty page", () => {
  assert.deepEqual(Paging.slice([], 1, 10), { rows: [], page: 1, pages: 1, total: 0, from: 0, to: 0 });
});

test("pageOf maps a zero-based index to its page", () => {
  assert.equal(Paging.pageOf(0, 10), 1);
  assert.equal(Paging.pageOf(9, 10), 1);
  assert.equal(Paging.pageOf(10, 10), 2);
});
