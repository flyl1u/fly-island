import type { SettingsFileShelfText } from "./fileShelf";
import type { SettingsModulesText } from "./modules";
import type { SettingsMessageSourcesText } from "./messageSources";
import type { SettingsResetAppearanceText } from "./resetAppearance";
import type { SettingsCategoriesText } from "./categories";
import type { SettingsPluginsText } from "./plugins";
import type { SettingsBehaviorText } from "./behavior";
import type { SettingsTranslationText } from "./translation";
import type { SettingsPositionText } from "./position";
import type { SettingsExpandText } from "./expand";
import type { SettingsLyricsText } from "./lyrics";
import type { SettingsMusicSourcesText } from "./musicSources";
import type { SettingsShortcutsText } from "./shortcuts";
import type { SettingsProjectText } from "./project";
import type { SettingsLanguageText } from "./language";
import type { SettingsAppearanceText } from "./appearance";
import type { SettingsLayoutText } from "./layout";
import type { SettingsTodoText } from "./todo";
import type { SettingsAgentText } from "./agent";
import type { SettingsClipboardText } from "./clipboard";
import type { SettingsColorsText } from "./colors";
import type { SettingsSaveText } from "./save";
import type { SettingsSoundsText } from "./sounds";
import * as fileShelf from "./fileShelf.ts";
import * as modules from "./modules.ts";
import * as messageSources from "./messageSources.ts";
import * as resetAppearance from "./resetAppearance.ts";
import * as categories from "./categories.ts";
import * as plugins from "./plugins.ts";
import * as behavior from "./behavior.ts";
import * as translation from "./translation.ts";
import * as position from "./position.ts";
import * as expand from "./expand.ts";
import * as lyrics from "./lyrics.ts";
import * as musicSources from "./musicSources.ts";
import * as shortcuts from "./shortcuts.ts";
import * as project from "./project.ts";
import * as language from "./language.ts";
import * as appearance from "./appearance.ts";
import * as layout from "./layout.ts";
import * as todo from "./todo.ts";
import * as agent from "./agent.ts";
import * as clipboard from "./clipboard.ts";
import * as colors from "./colors.ts";
import * as save from "./save.ts";
import * as sounds from "./sounds.ts";

export type SettingsText = {
  fileShelf: SettingsFileShelfText;
  messageSources: SettingsMessageSourcesText;

  modules: SettingsModulesText;
  title: string;
  resetAppearance: SettingsResetAppearanceText;

  categories: SettingsCategoriesText;
  plugins: SettingsPluginsText;

  behavior: SettingsBehaviorText;

  translation: SettingsTranslationText;

  position: SettingsPositionText;

  expand: SettingsExpandText;

  lyrics: SettingsLyricsText;

  musicSources: SettingsMusicSourcesText;

  shortcuts: SettingsShortcutsText;


  project: SettingsProjectText;

  language: SettingsLanguageText;

  appearance: SettingsAppearanceText;

  layout: SettingsLayoutText;

  todo: SettingsTodoText;

  agent: SettingsAgentText;

  clipboard: SettingsClipboardText;

  colors: SettingsColorsText;


  save: SettingsSaveText;
  sounds: SettingsSoundsText;
};

export const zhCN: SettingsText = {
  fileShelf: fileShelf.zhCN,
  messageSources: messageSources.zhCN,

  modules: modules.zhCN,
  title: "设置",
  resetAppearance: resetAppearance.zhCN,

  categories: categories.zhCN,
  plugins: plugins.zhCN,

  behavior: behavior.zhCN,

  translation: translation.zhCN,

  position: position.zhCN,

  expand: expand.zhCN,

  lyrics: lyrics.zhCN,
  musicSources: musicSources.zhCN,

  shortcuts: shortcuts.zhCN,


  project: project.zhCN,

  language: language.zhCN,

  appearance: appearance.zhCN,

  layout: layout.zhCN,

  todo: todo.zhCN,

  agent: agent.zhCN,

  clipboard: clipboard.zhCN,

  colors: colors.zhCN,


  save: save.zhCN,
  sounds: sounds.zhCN,
};

export const en: SettingsText = {
  fileShelf: fileShelf.en,
  messageSources: messageSources.en,

  modules: modules.en,
  title: "Settings",
  resetAppearance: resetAppearance.en,

  categories: categories.en,
  plugins: plugins.en,

  behavior: behavior.en,

  translation: translation.en,

  position: position.en,

  expand: expand.en,

  lyrics: lyrics.en,
  musicSources: musicSources.en,

  shortcuts: shortcuts.en,


  project: project.en,

  language: language.en,

  appearance: appearance.en,

  layout: layout.en,

  todo: todo.en,

  agent: agent.en,

  clipboard: clipboard.en,

  colors: colors.en,


  save: save.en,
  sounds: sounds.en,
};
