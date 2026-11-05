import type { SettingsFileShelfText } from "./fileShelf";
import type { SettingsModulesText } from "./modules";
import type { SettingsMessageSourcesText } from "./messageSources";
import type { SettingsResetAppearanceText } from "./resetAppearance";
import type { SettingsCategoriesText } from "./categories";
import type { SettingsBehaviorText } from "./behavior";
import type { SettingsTranslationText } from "./translation";
import type { SettingsPositionText } from "./position";
import type { SettingsExpandText } from "./expand";
import type { SettingsGameModeText } from "./gameMode";
import type { SettingsShortcutsText } from "./shortcuts";
import type { SettingsPageShortcutsText } from "./pageShortcuts";
import type { SettingsProjectText } from "./project";
import type { SettingsLanguageText } from "./language";
import type { SettingsAppearanceText } from "./appearance";
import type { SettingsLayoutText } from "./layout";
import type { SettingsTodoText } from "./todo";
import type { SettingsAgentText } from "./agent";
import type { SettingsClipboardText } from "./clipboard";
import type { SettingsColorsText } from "./colors";
import type { SettingsPresetsText } from "./presets";
import type { SettingsSaveText } from "./save";
import type { SettingsPluginsText } from "./plugins";
import * as fileShelf from "./fileShelf.ts";
import * as modules from "./modules.ts";
import * as messageSources from "./messageSources.ts";
import * as resetAppearance from "./resetAppearance.ts";
import * as categories from "./categories.ts";
import * as behavior from "./behavior.ts";
import * as translation from "./translation.ts";
import * as position from "./position.ts";
import * as expand from "./expand.ts";
import * as gameMode from "./gameMode.ts";
import * as shortcuts from "./shortcuts.ts";
import * as pageShortcuts from "./pageShortcuts.ts";
import * as project from "./project.ts";
import * as language from "./language.ts";
import * as appearance from "./appearance.ts";
import * as layout from "./layout.ts";
import * as todo from "./todo.ts";
import * as agent from "./agent.ts";
import * as clipboard from "./clipboard.ts";
import * as colors from "./colors.ts";
import * as presets from "./presets.ts";
import * as save from "./save.ts";
import * as plugins from "./plugins.ts";

export type SettingsText = {
  fileShelf: SettingsFileShelfText;
  messageSources: SettingsMessageSourcesText;

  modules: SettingsModulesText;
  title: string;
  resetAppearance: SettingsResetAppearanceText;

  categories: SettingsCategoriesText;

  behavior: SettingsBehaviorText;

  translation: SettingsTranslationText;

  position: SettingsPositionText;

  expand: SettingsExpandText;

  gameMode: SettingsGameModeText;

  shortcuts: SettingsShortcutsText;

  pageShortcuts: SettingsPageShortcutsText;

  project: SettingsProjectText;

  language: SettingsLanguageText;

  appearance: SettingsAppearanceText;

  layout: SettingsLayoutText;

  todo: SettingsTodoText;

  agent: SettingsAgentText;

  clipboard: SettingsClipboardText;

  colors: SettingsColorsText;

  presets: SettingsPresetsText;

  save: SettingsSaveText;
  plugins: SettingsPluginsText;
};

export const zhCN: SettingsText = {
  fileShelf: fileShelf.zhCN,
  messageSources: messageSources.zhCN,

  modules: modules.zhCN,
  title: "设置",
  resetAppearance: resetAppearance.zhCN,

  categories: categories.zhCN,

  behavior: behavior.zhCN,

  translation: translation.zhCN,

  position: position.zhCN,

  expand: expand.zhCN,

  gameMode: gameMode.zhCN,

  shortcuts: shortcuts.zhCN,

  pageShortcuts: pageShortcuts.zhCN,

  project: project.zhCN,

  language: language.zhCN,

  appearance: appearance.zhCN,

  layout: layout.zhCN,

  todo: todo.zhCN,

  agent: agent.zhCN,

  clipboard: clipboard.zhCN,

  colors: colors.zhCN,

  presets: presets.zhCN,

  save: save.zhCN,
  plugins: plugins.zhCN,
};

export const en: SettingsText = {
  fileShelf: fileShelf.en,
  messageSources: messageSources.en,

  modules: modules.en,
  title: "Settings",
  resetAppearance: resetAppearance.en,

  categories: categories.en,

  behavior: behavior.en,

  translation: translation.en,

  position: position.en,

  expand: expand.en,

  gameMode: gameMode.en,

  shortcuts: shortcuts.en,

  pageShortcuts: pageShortcuts.en,

  project: project.en,

  language: language.en,

  appearance: appearance.en,

  layout: layout.en,

  todo: todo.en,

  agent: agent.en,

  clipboard: clipboard.en,

  colors: colors.en,

  presets: presets.en,

  save: save.en,
  plugins: plugins.en,
};
