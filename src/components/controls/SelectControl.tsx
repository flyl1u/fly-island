import { useEffect, useId, useState, type KeyboardEvent } from "react";
import { Check, ChevronDown } from "lucide-react";
import "./SelectControl.css";

export type SelectOption<T extends string> = { value: T; label: string };

/**
 * Dark dropdown in place of a native <select>, whose option list WebView2 draws in the
 * light system style. Keyboard: arrows/Home/End move, Enter or Space picks, Esc closes.
 */
export function SelectControl<T extends string>({
  value,
  options,
  ariaLabel,
  disabled = false,
  onChange,
}: {
  value: T;
  options: readonly SelectOption<T>[];
  ariaLabel: string;
  disabled?: boolean;
  onChange: (value: T) => void;
}) {
  const listId = useId();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(0);
  const selectedIndex = options.findIndex((option) => option.value === value);
  const optionId = (index: number) => `${listId}-${index}`;

  useEffect(() => {
    if (isOpen) document.getElementById(optionId(activeIndex))?.scrollIntoView({ block: "nearest" });
    // optionId only depends on listId, which never changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeIndex, isOpen]);

  const open = () => {
    setActiveIndex(Math.max(selectedIndex, 0));
    setIsOpen(true);
  };
  const choose = (index: number) => {
    setIsOpen(false);
    const option = options[index];
    if (option && option.value !== value) onChange(option.value);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: Math.min(activeIndex + 1, last),
      ArrowUp: Math.max(activeIndex - 1, 0),
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      if (isOpen) setActiveIndex(moves[event.key]);
      else open();
    } else if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      if (isOpen) choose(activeIndex);
      else open();
    } else if (event.key === "Escape" && isOpen) {
      event.preventDefault();
      event.stopPropagation();
      setIsOpen(false);
    }
  };

  return (
    <div className={`select-control${isOpen ? " select-control--open" : ""}`}>
      <button
        type="button"
        className="select-control__trigger"
        role="combobox"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        aria-controls={listId}
        aria-activedescendant={isOpen ? optionId(activeIndex) : undefined}
        disabled={disabled}
        onClick={() => (isOpen ? setIsOpen(false) : open())}
        onKeyDown={handleKeyDown}
        onBlur={() => setIsOpen(false)}
      >
        <span>{options[selectedIndex]?.label ?? ""}</span>
        <ChevronDown className="select-control__chevron" size={15} strokeWidth={2.2} aria-hidden="true" />
      </button>
      {isOpen && (
        <ul id={listId} className="select-control__menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option, index) => (
            <li
              key={option.value}
              id={optionId(index)}
              className={`select-control__option${index === activeIndex ? " select-control__option--active" : ""}`}
              role="option"
              aria-selected={option.value === value}
              data-value={option.value}
              onPointerEnter={() => setActiveIndex(index)}
              // Keeps focus on the trigger, so its blur does not close the menu first.
              onPointerDown={(event) => event.preventDefault()}
              onClick={() => choose(index)}
            >
              <span>{option.label}</span>
              {option.value === value && <Check size={14} strokeWidth={2.4} aria-hidden="true" />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
