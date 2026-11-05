const test = require("node:test");
const assert = require("node:assert/strict");
const { bestIndexes, lowestIndexes } = require("../site/best-value.js");

test("single maximum is the only best", () => {
  assert.deepEqual(bestIndexes([3, 9, 4]), [1]);
});

test("every tied maximum is best", () => {
  assert.deepEqual(bestIndexes([9, 2, 9, 1]), [0, 2]);
});

test("all equal values have no best", () => {
  assert.deepEqual(bestIndexes([5, 5, 5]), []);
});

test("zero or missing best values have no best", () => {
  assert.deepEqual(bestIndexes([0, 0, null]), []);
  assert.deepEqual(bestIndexes([null, undefined, NaN]), []);
  assert.deepEqual(bestIndexes([null, 4, 2]), [1]);
  assert.deepEqual(bestIndexes([7]), []);
});

test("values that round to the same display are a tie", () => {
  assert.deepEqual(bestIndexes([12.34, 12.31, 11.9], 1), [0, 1]);
  assert.deepEqual(bestIndexes([0.501, 0.499, 0.3], 2), [0, 1]);
  assert.deepEqual(bestIndexes([0.501, 0.499], 2), []);
});

test("lowest positive values are marked, ignoring missing values", () => {
  assert.deepEqual(lowestIndexes([null, 409, 355, 355]), [2, 3]);
  assert.deepEqual(lowestIndexes([355, 355]), []);
  assert.deepEqual(lowestIndexes([null, 355]), []);
});
