import { act } from "react";
import { folderPickerMock } from "./settingsMocks";

export async function checkSavePath(
  check: (value: unknown, message: string) => void,
  type: (input: HTMLInputElement, value: string) => Promise<void>,
) {
  const panel = document.querySelector<HTMLElement>(".save-path-panel")!;
  const input = panel.querySelector<HTMLInputElement>("input")!;
  const browse = panel.querySelector<HTMLButtonElement>(".save-path-field__browse")!;
  const stored = () => localStorage.getItem("focusd-island-save-directory");
  const selected = "C:\\资料\\Task Notes";
  const typed = "D:\\手动输入\\My Todos";
  const original = stored();

  await type(input, typed);
  check(!panel.querySelector(".save-path-saved"), "save path: editing clears the previous saved confirmation");
  let finish: (value: string | null) => void = () => {};
  folderPickerMock.select = () => new Promise(resolve => { finish = resolve; });
  const calls = folderPickerMock.calls.length;
  await act(async () => { browse.click(); browse.click(); });
  check(browse.disabled && input.disabled && folderPickerMock.calls.length === calls + 1,
    "save path: a pending picker prevents duplicate dialogs and input edits");
  const lastCall = folderPickerMock.calls[folderPickerMock.calls.length - 1];
  check(lastCall?.directory === typed && lastCall?.title === "选择文件夹…",
    "save path: the picker receives the current draft and translated title");
  await act(async () => { finish(selected); });
  check(input.value === selected && stored() === original && !browse.disabled,
    "save path: choosing a Unicode path with spaces updates only the draft");
  await act(async () => { panel.querySelector<HTMLButtonElement>(".settings-link-button")!.click(); });
  check(stored() === selected && panel.querySelector(".save-path-saved"), "save path: Save persists the selected directory");

  folderPickerMock.select = async () => null;
  await act(async () => { browse.click(); });
  check(input.value === selected && stored() === selected && panel.querySelector(".save-path-saved"),
    "save path: cancelling preserves the draft, stored directory and saved state");
  folderPickerMock.select = async () => { throw "Folder picker unavailable"; };
  await act(async () => { browse.click(); });
  check(panel.querySelector("[role=alert]")?.textContent === "Folder picker unavailable" && !browse.disabled && input.value === selected,
    "save path: errors are visible and leave the path editable");

  folderPickerMock.select = async () => selected;
  await act(async () => { browse.click(); });
  check(!panel.querySelector("[role=alert]"), "save path: reopening clears the previous picker error");
  await type(input, typed);
  await act(async () => { input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })); });
  check(stored() === typed, "save path: manually typed paths still save with Enter");
  check(panel.scrollWidth <= panel.clientWidth && browse.getBoundingClientRect().right <= input.getBoundingClientRect().right,
    "save path: the browse button fits inside the path field without overflow");
}
