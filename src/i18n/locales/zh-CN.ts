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
import * as settings from "../sections/settings/index.ts";

const zhCN: Translations = {
  localeLabel: "简体中文",
  localeTag: "zh-CN",

  common: common.zhCN,
  messages: messages.zhCN,
  qq: qq.zhCN,
  wechat: wechat.zhCN,
  mail: mail.zhCN,
  translator: translator.zhCN,

  island: island.zhCN,

  agent: agent.zhCN,

  // These panels shipped in English in the original Chinese-first build.
  // zh-CN keeps that exact wording so existing users see no change; the en
  // locale is identical here. Translate later if a fully-Chinese UI is wanted.
  notebook: notebook.zhCN,

  archive: archive.zhCN,

  music: music.zhCN,

  todo: todo.zhCN,

  clipboard: clipboard.zhCN,

  fileShelf: fileShelf.zhCN,

  settings: settings.zhCN,
};

export default zhCN;
