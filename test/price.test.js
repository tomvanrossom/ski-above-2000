const test = require("node:test");
const assert = require("node:assert/strict");
const Price = require("../site/price.js");

test("price per km divides price by km", () => {
  assert.equal(Price.perKm(300, 120), 2.5);
});

test("price per km is null for a missing price or zero km", () => {
  assert.equal(Price.perKm(null, 120), null);
  assert.equal(Price.perKm(300, 0), null);
  assert.equal(Price.perKm(300, undefined), null);
});

test("area price is null unless a positive number", () => {
  assert.equal(Price.value({ skipass_price_eur: 350 }), 350);
  for (const missing of [null, undefined, "", 0, -5, "abc"]) {
    assert.equal(Price.value({ skipass_price_eur: missing }), null);
  }
});

test("area price per total and per high km use figures.all", () => {
  const area = { skipass_price_eur: 300, figures: { all: [150, 60] } };
  assert.equal(Price.perTotalKm(area), 2);
  assert.equal(Price.perHighKm(area), 5);
  assert.equal(Price.perHighKm({ ...area, figures: { all: [150, 0] } }), null);
  assert.equal(Price.perHighKm({ skipass_price_eur: null, figures: { all: [150, 60] } }), null);
  assert.equal(Price.perHighKm({ skipass_price_eur: 300, figures: {} }), null);
});
