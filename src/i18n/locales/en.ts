import type { Translations } from "../types";
import * as common from "../sections/common.ts";
import * as messages from "../sections/messages.ts";
import * as qq from "../sections/qq.ts";
import * as wechat from "../sections/wechat.ts";
import * as mail from "../sections/mail.ts";
import * as translator from "../sections/translator.ts";
import * as island from "../sections/island.ts";
import * as agent from "../sections/agent.ts";
import * as notebook from "../sections/notebook.ts";
import * as archive from "../sections/archive.ts";
import * as music from "../sections/music.ts";
import * as todo from "../sections/todo.ts";
import * as clipboard from "../sections/clipboard.ts";
import * as fileShelf from "../sections/fileShelf.ts";
import * as pluginViews from "../sections/pluginViews.ts";
import * as settings from "../sections/settings/index.ts";

const en: Translations = {
  localeLabel: "English",
  localeTag: "en",

  common: common.en,
  messages: messages.en,
  qq: qq.en,
  wechat: wechat.en,
  mail: mail.en,
  translator: translator.en,

  island: island.en,

  agent: agent.en,

  notebook: notebook.en,

  archive: archive.en,

  music: music.en,

  todo: todo.en,

  clipboard: clipboard.en,

  fileShelf: fileShelf.en,

  pluginViews: pluginViews.en,
  settings: settings.en,
};

export default en;
