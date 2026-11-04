/**
 * The `when` clause of a plugin command's keybinding (focusd-plugin.json), e.g.
 * `island.expanded && island.page == todo` or `!todos.hasActive`.
 *
 * Grammar: `||` binds looser than `&&`, `!` negates, parentheses group. A bare name is
 * true when its context value is `true`; `name == value` / `name != value` compare the
 * value as text (quotes are optional). Unknown names are false; a clause that does not
 * parse is never true. An empty clause is always true.
 */

export type WhenContext = Readonly<Record<string, string | boolean>>;

type Token = { kind: "op"; value: string } | { kind: "word"; value: string };

const OPERATORS = ["&&", "||", "==", "!=", "!", "(", ")"];

function tokenize(text: string): Token[] | null {
  const tokens: Token[] = [];
  let index = 0;
  while (index < text.length) {
    const char = text[index];
    if (char === " ") {
      index += 1;
      continue;
    }
    const operator = OPERATORS.find((candidate) => text.startsWith(candidate, index));
    if (operator) {
      tokens.push({ kind: "op", value: operator });
      index += operator.length;
      continue;
    }
    if (char === "'" || char === '"') {
      const end = text.indexOf(char, index + 1);
      if (end < 0) return null;
      tokens.push({ kind: "word", value: text.slice(index + 1, end) });
      index = end + 1;
      continue;
    }
    const word = /^[A-Za-z0-9._-]+/.exec(text.slice(index));
    if (!word) return null;
    tokens.push({ kind: "word", value: word[0] });
    index += word[0].length;
  }
  return tokens;
}

export function evaluateWhen(clause: string | null | undefined, context: WhenContext): boolean {
  if (!clause?.trim()) return true;
  const tokens = tokenize(clause);
  if (!tokens) return false;
  let position = 0;
  const isOperator = (value: string) => {
    const token = tokens[position];
    return token?.kind === "op" && token.value === value;
  };

  // Each returns null when the clause does not parse.
  const either = (): boolean | null => {
    let left = both();
    while (left !== null && isOperator("||")) {
      position += 1;
      const right = both();
      left = right === null ? null : left || right;
    }
    return left;
  };
  const both = (): boolean | null => {
    let left = single();
    while (left !== null && isOperator("&&")) {
      position += 1;
      const right = single();
      left = right === null ? null : left && right;
    }
    return left;
  };
  const single = (): boolean | null => {
    if (isOperator("!")) {
      position += 1;
      const value = single();
      return value === null ? null : !value;
    }
    if (isOperator("(")) {
      position += 1;
      const value = either();
      if (!isOperator(")")) return null;
      position += 1;
      return value;
    }
    const name = tokens[position];
    if (name?.kind !== "word") return null;
    position += 1;
    const value = context[name.value];
    if (isOperator("==") || isOperator("!=")) {
      const negate = isOperator("!=");
      position += 1;
      const expected = tokens[position];
      if (expected?.kind !== "word") return null;
      position += 1;
      const equal = value !== undefined && String(value) === expected.value;
      return negate ? !equal : equal;
    }
    return value === true;
  };

  const result = either();
  return result !== null && position === tokens.length ? result : false;
}
