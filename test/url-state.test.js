const test = require("node:test");
const assert = require("node:assert/strict");
const UrlState = require("../site/url-state.js");

test("defaults serialize to an empty query and parse back", () => {
  assert.equal(UrlState.serialize(UrlState.DEFAULTS), "");
  assert.deepEqual(UrlState.parse(""), { ...UrlState.DEFAULTS });
});

test("full state round-trips through the query string", () => {
  const state = { countries: ["France", "Italy"], q: "val d'isère", min: 30, fav: true, sort: "intermediate-total", dir: 1 };
  const query = UrlState.serialize(state);
  assert.equal(query, "?c=France%2CItaly&q=val+d%27is%C3%A8re&min=30&fav=1&sort=intermediate-total&dir=asc");
  assert.deepEqual(UrlState.parse(query), state);
});

test("invalid values fall back to defaults", () => {
  assert.deepEqual(UrlState.parse("?min=-4&sort=bogus&dir=up&fav=yes&c=,,"), { ...UrlState.DEFAULTS });
  assert.equal(UrlState.parse("?min=abc").min, 0);
});
