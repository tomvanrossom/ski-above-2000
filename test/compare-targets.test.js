const test = require("node:test");
const assert = require("node:assert/strict");
const CompareTargets = require("../site/compare-targets.js");

const known = ["a", "b", "c", "d", "e"];

test("a selection hidden by the current filters is kept and compared", () => {
  const result = CompareTargets.targets({ selected: ["a", "b"], favourites: ["d", "e"], known });
  assert.deepEqual(result, ["a", "b"]);
});

test("the selection is capped at the maximum", () => {
  const result = CompareTargets.targets({ selected: ["a", "b", "c", "d", "e"], favourites: [], known });
  assert.deepEqual(result, ["a", "b", "c", "d"]);
});

test("without a selection the first four known favourites are used", () => {
  const result = CompareTargets.targets({ selected: [], favourites: ["x", "a", "b", "c", "d", "e"], known });
  assert.deepEqual(result, ["a", "b", "c", "d"]);
});
