import assert from "node:assert/strict";
import test from "node:test";
import { answerOf, answersFor, answersOnPick, EMPTY_PICK, parseQuestions, togglePick } from "../../src/features/agent-status/approvals/questions.ts";

const input = {
  questions: [
    { question: "你更喜欢哪种饮品？", header: "饮品", multiSelect: false, options: [{ label: "咖啡", description: "提神" }, { label: "茶" }] },
    { question: "要加什么？", header: "", multiSelect: true, options: [{ label: "糖" }, { label: "奶" }, { label: "冰" }] },
  ],
};

test("questions are read from the tool input, skipping broken ones", () => {
  const questions = parseQuestions({ questions: [...input.questions, { header: "no text" }, null, { question: "  " }] });
  assert.equal(questions.length, 2);
  assert.deepEqual(questions[0].options, [{ label: "咖啡", description: "提神" }, { label: "茶", description: "" }]);
  assert.equal(questions[1].multiSelect, true);
  assert.deepEqual(parseQuestions(null), []);
  assert.deepEqual(parseQuestions({ questions: "x" }), []);
});

test("single-select keeps one option, multi-select toggles in the options' order", () => {
  const [single, multi] = parseQuestions(input);
  assert.deepEqual(togglePick(togglePick(EMPTY_PICK, single, "咖啡"), single, "茶").labels, ["茶"]);
  let pick = togglePick(EMPTY_PICK, multi, "冰");
  pick = togglePick(pick, multi, "糖");
  assert.deepEqual(pick.labels, ["糖", "冰"]);
  assert.deepEqual(togglePick(pick, multi, "冰").labels, ["糖"]);
});

test("typed text wins over picked options; options join with a comma", () => {
  assert.equal(answerOf({ labels: ["糖", "奶"], text: "" }), "糖, 奶");
  assert.equal(answerOf({ labels: ["糖"], text: "  都不要  " }), "都不要");
  assert.equal(answerOf(undefined), "");
});

test("answers are keyed by question text once every question has one", () => {
  const questions = parseQuestions(input);
  assert.equal(answersFor(questions, [{ labels: ["咖啡"], text: "" }]), null);
  assert.deepEqual(answersFor(questions, [{ labels: ["咖啡"], text: "" }, { labels: [], text: "少糖" }]), {
    "你更喜欢哪种饮品？": "咖啡",
    "要加什么？": "少糖",
  });
  assert.equal(answersFor([], []), null);
});

test("only a lone single-select question answers on the first pick", () => {
  const [single, multi] = parseQuestions(input);
  assert.equal(answersOnPick([single]), true);
  assert.equal(answersOnPick([multi]), false);
  assert.equal(answersOnPick([single, multi]), false);
});
