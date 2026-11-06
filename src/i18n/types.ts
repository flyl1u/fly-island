import type { CommonText } from "./sections/common";
import type { MessagesText } from "./sections/messages";
import type { QqText } from "./sections/qq";
import type { WechatText } from "./sections/wechat";
import type { MailText } from "./sections/mail";
import type { TranslatorText } from "./sections/translator";
import type { IslandText } from "./sections/island";
import type { AgentText } from "./sections/agent";
import type { ClaudeUsageText } from "./sections/claudeUsage";
import type { NotebookText } from "./sections/notebook";
import type { ArchiveText } from "./sections/archive";
import type { MusicText } from "./sections/music";
import type { TodoText } from "./sections/todo";
import type { ClipboardText } from "./sections/clipboard";
import type { FileShelfText } from "./sections/fileShelf";
import type { PluginViewsText } from "./sections/pluginViews";
import type { SettingsText } from "./sections/settings/index";

export type LocaleCode = "zh-CN" | "en";

export type Translations = {
  /** Native language name shown in the locale picker. */
  localeLabel: string;
  /** BCP-47 tag handed to Intl for dates and numbers. */
  localeTag: string;

  common: CommonText;
  messages: MessagesText;
  qq: QqText;
  wechat: WechatText;
  mail: MailText;
  translator: TranslatorText;

  island: IslandText;

  agent: AgentText;
  claudeUsage: ClaudeUsageText;

  notebook: NotebookText;

  archive: ArchiveText;

  music: MusicText;

  todo: TodoText;

  clipboard: ClipboardText;

  fileShelf: FileShelfText;

  /** Pages and status texts plugins put on the island (drawn from templates). */
  pluginViews: PluginViewsText;
  settings: SettingsText;
};
