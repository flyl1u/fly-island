type ContextMenuElement = {
  readonly tagName: string;
  readonly isContentEditable?: boolean;
  readonly parentElement: ContextMenuElement | null;
};

/** Editable controls and their descendants keep the native copy/paste menu. */
export function shouldPreventContextMenu(target: ContextMenuElement | null): boolean {
  for (let element = target; element; element = element.parentElement) {
    if (element.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(element.tagName.toUpperCase())) {
      return false;
    }
  }
  return true;
}
