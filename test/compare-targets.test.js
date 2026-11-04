const test = require("node:test");
const assert = require("node:assert/strict");
const CompareTargets = require("../site/compare-targets.js");

const known = ["a", "b", "c", "d", "e"];

test("areas hidden by the current filters are not compared", () => {
  const result = CompareTargets.targets({ selected: ["a", "b", "c"], visible: ["b", "c"], favourites: [], known });
  assert.deepEqual(result, ["b", "c"]);
});

test("a selection hidden entirely by filters does not fall back to it", () => {
  const result = CompareTargets.targets({ selected: ["a"], visible: ["b"], favourites: ["d", "e"], known });
  assert.deepEqual(result, ["d", "e"]);
});

test("explicit visible selection wins over favourites", () => {
  const result = CompareTargets.targets({ selected: ["a", "b"], visible: known, favourites: ["d", "e"], known });
  assert.deepEqual(result, ["a", "b"]);
});

test("without a selection the first four known favourites are used", () => {
  const result = CompareTargets.targets({ selected: [], visible: known, favourites: ["x", "a", "b", "c", "d", "e"], known });
  assert.deepEqual(result, ["a", "b", "c", "d"]);
});
