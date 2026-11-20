/**
 * 插件自己的文案。
 *
 * 插件只在中文界面启用（英文界面的月历保持原样），所以这里不准备英文对照：
 * 这些字在任何英文界面上都不会出现。
 */
export const TEXT = {
  /** 节日名，键与 holidays.ts 里的 `name` 对应。两字，正好放进一格。 */
  holidayNames: {
    newYear: "元旦",
    springFestival: "春节",
    qingming: "清明",
    labour: "劳动",
    dragonBoat: "端午",
    midAutumn: "中秋",
    nationalDay: "国庆",
  } as Record<string, string>,

  /** 不放假的纪念日，键与 memorials.ts 里的值对应。一律两字，窄面板的格子里才放得下。 */
  memorialNames: {
    policeDay: "警察",
    leiFengDay: "雷锋",
    womensDay: "妇女",
    arborDay: "植树",
    consumerDay: "消费",
    earthDay: "地球",
    youthDay: "青年",
    disasterDay: "防灾",
    childrensDay: "儿童",
    environmentDay: "环境",
    partyDay: "建党",
    armyDay: "建军",
    victoryDay: "抗战",
    teachersDay: "教师",
    constitutionDay: "宪法",
    memorialDay: "公祭",
  } as Record<string, string>,

  /** 右上角角标：休息日、调休上班、今天。 */
  off: "休",
  work: "班",
  today: "今",
} as const;
