type ContextMenuElement = {
  readonly tagName: string;
  readonly isContentEditable?: boolean;
  readonly parentElement: ContextMenuElement | null;
};

/**
 * Editable controls and their descendants keep the native copy/paste menu, and so does a text
 * selection (mail and message text can be selected to copy, #83).
 */
export function shouldPreventContextMenu(target: ContextMenuElement | null, hasSelection = false): boolean {
  if (hasSelection) return false;
  for (let element = target; element; element = element.parentElement) {
    if (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName.toUpperCase())) {
      return false;
    }
  }
  return true;
}
