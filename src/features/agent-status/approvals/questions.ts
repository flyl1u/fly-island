import type { AgentQuestionAnswers } from "./api";

/** One question of Claude Code's AskUserQuestion, as the card shows it. */
export type AgentQuestion = {
  question: string;
  /** A short label above it ("Drink"); may be empty. */
  header: string;
  multiSelect: boolean;
  options: { label: string; description: string }[];
};

/** What the user has picked or typed for one question so far. */
export type QuestionPick = { labels: string[]; text: string };

export const EMPTY_PICK: QuestionPick = { labels: [], text: "" };

function text(value: unknown): string {
  return typeof value === "string" ? value : "";
}

/** The questions in an AskUserQuestion's input; ones without question text are left out. */
export function parseQuestions(toolInput: unknown): AgentQuestion[] {
  const input = toolInput && typeof toolInput === "object" ? (toolInput as Record<string, unknown>) : {};
  if (!Array.isArray(input.questions)) return [];
  return input.questions.flatMap((value): AgentQuestion[] => {
    const item = value && typeof value === "object" ? (value as Record<string, unknown>) : {};
    const question = text(item.question).trim();
    if (!question) return [];
    const options = (Array.isArray(item.options) ? item.options : []).flatMap((option) => {
      const entry = option && typeof option === "object" ? (option as Record<string, unknown>) : {};
      const label = text(entry.label).trim();
      return label ? [{ label, description: text(entry.description) }] : [];
    });
    return [{ question, header: text(item.header), multiSelect: item.multiSelect === true, options }];
  });
}

/** Picking an option: a single-select question keeps only it, a multi-select one toggles it. */
export function togglePick(pick: QuestionPick, question: AgentQuestion, label: string): QuestionPick {
  if (!question.multiSelect) return { labels: [label], text: "" };
  const labels = pick.labels.includes(label) ? pick.labels.filter((item) => item !== label) : [...pick.labels, label];
  // Keep the options' order, whatever order they were ticked in.
  return { ...pick, labels: question.options.map((option) => option.label).filter((item) => labels.includes(item)) };
}

/** The answer to one question: typed text wins over picked options, which are joined with ", ". */
export function answerOf(pick: QuestionPick | undefined): string {
  if (!pick) return "";
  return pick.text.trim() || pick.labels.join(", ");
}

/** Answers by question text, once every question has one; null while some are still open. */
export function answersFor(questions: AgentQuestion[], picks: QuestionPick[]): AgentQuestionAnswers | null {
  if (questions.length === 0) return null;
  const answers: AgentQuestionAnswers = {};
  for (const [index, question] of questions.entries()) {
    const answer = answerOf(picks[index]);
    if (!answer) return null;
    answers[question.question] = answer;
  }
  return answers;
}

/**
 * Whether choosing an option sends the answers at once: only for a single single-select
 * question. Otherwise the user ticks, may type, and presses Submit.
 */
export function answersOnPick(questions: AgentQuestion[]): boolean {
  return questions.length === 1 && !questions[0].multiSelect;
}
