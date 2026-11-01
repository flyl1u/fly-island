import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { runInNewContext } from "node:vm";
import ts from "typescript";

const source = ts.transpileModule(
  readFileSync(new URL("../src/useIslandAutomation.ts", import.meta.url), "utf8"),
  { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } },
).outputText;

// A deterministic hook clock lets these checks cover long idle periods and cleanup without sleeping.
function mount(name, initialArgs) {
  let args = initialArgs;
  let now = 0;
  let sequence = 0;
  let cursor = 0;
  let dirty = false;
  let value;
  const slots = [];
  const timers = new Map();
  let pending = [];
  const browserWindow = new EventTarget();
  const removeEventListener = browserWindow.removeEventListener.bind(browserWindow);
  // Node's EventTarget needs an options object to remove capture listeners reliably.
  browserWindow.removeEventListener = (type, listener, capture) =>
    removeEventListener(type, listener, { capture: capture === true });
  browserWindow.setTimeout = (callback, delay) => {
    const id = ++sequence;
    timers.set(id, { at: now + delay, callback });
    return id;
  };
  browserWindow.clearTimeout = id => timers.delete(id);
  const document = { hidden: false };
  const exports = {};
  const react = {
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = initial;
      return [slots[index], next => {
        const updated = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(updated, slots[index])) { slots[index] = updated; dirty = true; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      const previous = slots[index];
      if (!previous || deps.some((dep, i) => !Object.is(dep, previous.deps[i]))) {
        pending.push(() => {
          previous?.cleanup?.();
          slots[index] = { deps, cleanup: effect() };
        });
      }
    },
  };
  runInNewContext(source, { exports, require: () => react, window: browserWindow, document });
  function render(nextArgs = args) {
    args = nextArgs;
    do {
      dirty = false;
      cursor = 0;
      pending = [];
      value = exports[name](...args);
      pending.forEach(commit => commit());
    } while (dirty);
    return value;
  }
  render();
  return {
    render,
    document,
    get value() { return value; },
    get timerCount() { return timers.size; },
    fire(type) { browserWindow.dispatchEvent(new Event(type)); },
    tick(ms) {
      const end = now + ms;
      for (;;) {
        const next = [...timers].filter(([, timer]) => timer.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!next) break;
        now = next[1].at;
        timers.delete(next[0]);
        next[1].callback();
        render();
      }
      now = end;
    },
    unmount() { slots.forEach(slot => slot?.cleanup?.()); },
  };
}

test("task rotation is opt-in, wraps pending tasks, and restores the selected task when disabled", () => {
  const ids = ["a", "b", "c"];
  const app = mount("useTodoRotation", [ids, "b", false, 5, false]);
  assert.equal(app.value, "b");
  assert.equal(app.timerCount, 0);
  app.render([ids, "b", true, 5, false]);
  app.tick(4_999);
  assert.equal(app.value, "b");
  app.tick(1);
  assert.equal(app.value, "c");
  app.tick(5_000);
  assert.equal(app.value, "a");
  app.render([ids, "b", false, 5, false]);
  assert.equal(app.value, "b");
  assert.equal(app.timerCount, 0);
});

test("rotation pauses while hidden by panels or previews and handles selection, removal and empty lists", () => {
  const ids = ["a", "b", "c"];
  const app = mount("useTodoRotation", [ids, null, true, 2, false]);
  assert.equal(app.value, "a");
  app.tick(2_000);
  assert.equal(app.value, "b");
  app.render([ids, null, true, 2, true]);
  app.tick(20_000);
  assert.equal(app.value, "b");
  app.render([ids, null, true, 3, false]);
  app.tick(2_999);
  assert.equal(app.value, "b");
  app.tick(1);
  assert.equal(app.value, "c");
  app.render([ids, "a", true, 3, false]);
  assert.equal(app.value, "a");
  app.render([["c"], "a", true, 3, false]);
  assert.equal(app.value, "c");
  assert.equal(app.timerCount, 0);
  app.render([[], null, true, 3, false]);
  assert.equal(app.value, null);
  app.unmount();
});

test("idle tucking is opt-in and activity, page changes and duration edits restart the countdown", () => {
  let tucks = 0;
  const tuck = () => { tucks++; };
  const app = mount("useIdleTuck", [false, 3, false, "collapsed:todo", tuck]);
  app.tick(30_000);
  assert.equal(tucks, 0);
  app.render([true, 3, false, "collapsed:todo", tuck]);
  for (const event of ["pointermove", "keydown", "wheel", "input"]) {
    app.tick(2_000);
    app.fire(event);
    assert.equal(tucks, 0);
  }
  app.render([true, 2, false, "expanded:layout", tuck]);
  app.tick(1_999);
  assert.equal(tucks, 0);
  app.tick(1);
  assert.equal(tucks, 1);
  app.render([true, 2, true, "collapsed:layout", tuck]);
  app.tick(10_000);
  assert.equal(tucks, 1);
  assert.equal(app.timerCount, 0);
});

test("idle tucking waits for drag and IME completion and cleans up when disabled or unmounted", () => {
  let tucks = 0;
  const tuck = () => { tucks++; };
  const app = mount("useIdleTuck", [true, 2, false, "expanded:todo", tuck]);
  app.fire("pointerdown");
  app.tick(20_000);
  assert.equal(tucks, 0);
  app.fire("pointerup");
  app.tick(1_000);
  app.fire("compositionstart");
  app.tick(20_000);
  assert.equal(tucks, 0);
  app.fire("compositionend");
  app.tick(1_999);
  assert.equal(tucks, 0);
  app.tick(1);
  assert.equal(tucks, 1);
  app.render([false, 2, false, "expanded:todo", tuck]);
  app.fire("pointermove");
  assert.equal(app.timerCount, 0);
  app.render([true, 2, false, "expanded:todo", tuck]);
  app.document.hidden = true;
  app.fire("visibilitychange");
  app.tick(20_000);
  assert.equal(tucks, 1);
  app.document.hidden = false;
  app.fire("visibilitychange");
  app.unmount();
  app.fire("pointermove");
  app.tick(20_000);
  assert.equal(tucks, 1);
  assert.equal(app.timerCount, 0);
});
