import assert from "node:assert/strict";
import { test } from "node:test";
import { orderMarketCards } from "../../src/features/plugins/marketOrder.ts";

const cards = ["a", "b", "c", "d", "e"].map((id) => ({ id }));
const order = (installed, active = [], shown = []) =>
  orderMarketCards(cards, (id) => installed.includes(id), new Set(active), shown).map((card) => card.id).join("");

test("installed cards come first and both groups keep catalog order", () => {
  assert.equal(order(["d", "b"]), "bdace");
  assert.equal(order(["e"]), "eabcd");
});

test("all installed or none installed is the catalog order", () => {
  assert.equal(order(["a", "b", "c", "d", "e"]), "abcde");
  assert.equal(order([]), "abcde");
});

test("a card with a running job stays where it was shown while the others reorder", () => {
  const shown = ["b", "d", "a", "c", "e"];
  // "d" is being removed and "c" installed: both keep their places although their state changed.
  assert.equal(order(["b", "c"], ["d", "c"], shown), "bdace");
  // Another card finishing its install does not push the running one aside.
  assert.equal(order(["b", "d", "e"], ["d"], shown), "bdeac");
  // Once its job ends it takes its own place.
  assert.equal(order(["b", "e"], [], shown), "beacd");
});

test("a job already running when the page opens sorts by what is installed", () => {
  assert.equal(order(["c"], ["a"]), "cabde");
  assert.equal(orderMarketCards(cards, () => false, new Set(["a"]), ["gone"]).length, cards.length);
});
