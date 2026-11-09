import assert from "node:assert/strict";
import test from "node:test";
import { cardLeft } from "../../src/components/hoverCardPlacement.ts";

// A 200px card under something centred at x = 300, in a 600px window.
const covers = (left, pointer) => left < pointer + 22 && left + 200 > pointer - 8;

test("the card stays centred when the cursor is clear of it or there is no pointer", () => {
  assert.equal(cardLeft(300, 200, 600, null), 200);
  assert.equal(cardLeft(300, 200, 600, 120), 200);
  assert.equal(cardLeft(300, 200, 600, 420), 200);
});

test("a card the cursor would cover moves to the left of the pointer", () => {
  const left = cardLeft(300, 200, 600, 330);
  assert.equal(left, 122);
  assert.equal(covers(left, 330), false);
});

test("without room on the left it goes to the right of the pointer, inside the window", () => {
  const left = cardLeft(150, 200, 600, 100);
  assert.equal(left, 122);
  assert.equal(covers(left, 100), false);
  // No room either side: it stays inside the window.
  assert.equal(cardLeft(150, 200, 230, 100), 22);
});
