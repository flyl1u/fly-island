import { useLayoutEffect, useRef } from "react";

/**
 * Editing a todo's title in place. A textarea that grows with its text, so a title that
 * wraps keeps all of its lines while it is edited (a one-line input showed only one).
 * Titles stay one paragraph: Enter saves, Shift+Enter adds nothing, pasted line breaks
 * become spaces. Escape cancels; leaving the field saves.
 */
export function TodoTitleEditor({ value, label, onChange, onCommit, onCancel }: {
  value: string;
  label: string;
  onChange: (value: string) => void;
  onCommit: () => void;
  onCancel: () => void;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);

  // Before paint, so the field never shows at one line first.
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.style.height = "auto";
    field.style.height = `${field.scrollHeight + field.offsetHeight - field.clientHeight}px`;
  }, [value]);

  // Caret at the end, as the input it replaces put it.
  useLayoutEffect(() => {
    const field = ref.current;
    if (!field) return;
    field.focus();
    field.setSelectionRange(field.value.length, field.value.length);
  }, []);

  return (
    <textarea
      ref={ref}
      className="todo-title-input"
      value={value}
      rows={1}
      aria-label={label}
      onChange={(event) => onChange(event.currentTarget.value.replace(/\s*\r?\n\s*/g, " "))}
      onBlur={onCommit}
      onKeyDown={(event) => {
        // Enter that picks a word from Chinese input belongs to the input method.
        if (event.nativeEvent.isComposing) return;
        if (event.key === "Enter") {
          event.preventDefault();
          if (!event.shiftKey) onCommit();
        }
        if (event.key === "Escape") onCancel();
      }}
    />
  );
}
