export type CalendarMarksText = {
  holidayNames: Record<string, string>;
  memorialNames: Record<string, string>;
  solarTermNames: readonly string[];
  lunar: (day: number, name: string) => string;
  off: string;
  work: string;
  today: string;
  offLabel: string;
  workLabel: string;
  separator: string;
};

export const zhCN: CalendarMarksText = {
  /** 节日名，键与 holidays.ts 里的 `name` 对应。两字，正好放进一格。 */
  holidayNames: {
    newYear: "元旦",
    springFestival: "春节",
    qingming: "清明",
    labour: "劳动",
    dragonBoat: "端午",
    midAutumn: "中秋",
    nationalDay: "国庆",
  },

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
  },

  /** 右上角角标：休息日、调休上班、今天。 */
  solarTermNames: [
    "小寒", "大寒", "立春", "雨水", "惊蛰", "春分", "清明", "谷雨",
    "立夏", "小满", "芒种", "夏至", "小暑", "大暑", "立秋", "处暑",
    "白露", "秋分", "寒露", "霜降", "立冬", "小雪", "大雪", "冬至",
  ],
  lunar: (_, name) => name,
  off: "休",
  work: "班",
  today: "今",
  offLabel: "休息日",
  workLabel: "调休上班",
  separator: "，",
};

export const en: CalendarMarksText = {
  holidayNames: {
    newYear: "New Year", springFestival: "Spring Festival", qingming: "Qingming",
    labour: "Labour Day", dragonBoat: "Dragon Boat Festival", midAutumn: "Mid-Autumn Festival",
    nationalDay: "National Day",
  },
  memorialNames: {
    policeDay: "Police Day", leiFengDay: "Lei Feng Day", womensDay: "Women's Day",
    arborDay: "Arbor Day", consumerDay: "Consumer Rights Day", earthDay: "Earth Day",
    youthDay: "Youth Day", disasterDay: "Disaster Prevention Day", childrensDay: "Children’s Day",
    environmentDay: "Environment Day", partyDay: "CPC Founding Day", armyDay: "Army Day",
    victoryDay: "Victory Day", teachersDay: "Teachers’ Day", constitutionDay: "Constitution Day",
    memorialDay: "National Memorial Day",
  },
  solarTermNames: [
    "Minor Cold", "Major Cold", "Start of Spring", "Rain Water", "Awakening of Insects", "Spring Equinox",
    "Pure Brightness", "Grain Rain", "Start of Summer", "Grain Buds", "Grain in Ear", "Summer Solstice",
    "Minor Heat", "Major Heat", "Start of Autumn", "End of Heat", "White Dew", "Autumn Equinox",
    "Cold Dew", "Frost Descent", "Start of Winter", "Minor Snow", "Major Snow", "Winter Solstice",
  ],
  lunar: (day) => `Lunar ${day}`,
  off: "R",
  work: "W",
  today: "T",
  offLabel: "Rest day",
  workLabel: "Make-up workday",
  separator: ", ",
};
