# 节假日与日历标记 / Holidays and calendar marks

月历数字下方的第二行，按 **节日名 › 节气 › 纪念日 › 农历** 取第一个能显示的内容；休息日另外有红底、红字和右上角的「休」角标。这里说明数据存在哪、哪些每年要更新、怎么更新。

## 哪些要每年维护

| 数据 | 文件 | 是否要逐年更新 |
|---|---|---|
| 法定节假日、调休上班日 | `src/features/todos/calendar-marks/holidays.ts` | **要**，每年 11 月 |
| 二十四节气 | `src/features/todos/solarTerms.ts` | 不用，公式覆盖 1900–2100 |
| 农历日 | `src/features/todos/lunar.ts` | 不用，数据表覆盖 1900–2100 |
| 纪念日 | `src/features/todos/memorials.ts` | 不用，都是固定公历日期 |

只有 `holidays.ts` 需要动。国务院办公厅每年 11 月发布**次年**的《关于××年部分节假日安排的通知》，照通知抄进去即可。

## 怎么加一年

打开 `src/features/todos/calendar-marks/holidays.ts`，在 `PLANS` 里按年份加一块。以通知原文为例：

> 一、元旦：1 月 1 日（周四）至 3 日（周六）放假调休，共 3 天。1 月 4 日（周日）上班。

对应写成：

```ts
2028: {
  breaks: [
    { name: "newYear", from: "2028-01-01", to: "2028-01-03" },
    // 其余六个节日依次写在同一数组里
  ],
  workdays: ["2028-01-04"],
},
```

三步：

1. 在 `PLANS` 对象末尾加一个 `年份: { breaks, workdays }`；
2. 把通知里每个「放假」段落写成一条 `breaks`，每个「××日上班」写进 `workdays`；
3. 跑 `node scripts/check-holidays.mjs` 确认覆盖到需要的年份，再跑 `pnpm test` 确认格式没抄错。

## 字段说明

| 字段 | 类型 | 说明 |
|---|---|---|
| `breaks[].name` | string | 必须是 `notebook.holidayNames` 里的键：`newYear` `springFestival` `qingming` `labour` `dragonBoat` `midAutumn` `nationalDay` |
| `breaks[].from` | `YYYY-MM-DD` | 假期第一天。**只有这一天**在格子里显示节日名 |
| `breaks[].to` | `YYYY-MM-DD`，可省略 | 假期最后一天；只放一天时省略，其余日子自动显示「休」 |
| `workdays[]` | `YYYY-MM-DD` | 调休上班的周末，显示「班」，不标红 |

新增节日名（比如将来出现新的法定假日）时，除了改 `holidays.ts`，还要在两处补文案：

- `src/i18n/sections/notebook.ts` 的 `zhCN.holidayNames` 和 `en.holidayNames`；
- 测试 `every holiday key has a name in both languages` 会检查中英文是否都有，缺了会失败。

## 两个容易抄错的地方

**国庆和中秋重合时按一个假期写。** 2025 年就是这种情况，通知写「国庆节、中秋节：10 月 1 日至 8 日」，数据里只写一条 `nationalDay`，不要再拆出 `midAutumn`，否则同一天会被标两次。

**春节从除夕开始。** 通知里的春节区间已经包含除夕（如 2026 年 2 月 15 日是腊月二十八，2027 年 2 月 5 日是除夕），照抄即可，不需要按「正月初一」自己算。节气与农历都由代码算，也不要手工填。

## 测试守住了什么

`tests/unit/todo-holidays.test.mjs` 会在每次改动后检查：

- 每个年份都齐了六个必备节日（元旦、春节、清明、劳动、端午、国庆）；
- 假期是连续的一段，中间不会断；
- 同一年里节日名不重复、两个假期不在同一天开始；
- `breaks` 和 `workdays` 的日期都在自己那一年内，且调休日不落在假期区间里；
- 新增的节日名中英文文案都存在。

任何一条不符合，`pnpm test` 会直接失败并指出是哪一年。

## 范围之外

数据没覆盖的年份，月历照常显示数字和农历，只是没有节假日标记——不会报错，也不会串到相邻年份。这是刻意的：宁可少标，也不标错。

`scripts/check-holidays.mjs` 会告诉你还差哪一年。它**不参与 `pnpm check`**，因为结果取决于当天日期：如果让它在每年 11 月后失败，所有贡献者的提交前检查都会被一个与本次改动无关的原因卡住。它只提示、不报错，需要自己记得跑。也可以手动指定年月来验证边界：

```bash
node scripts/check-holidays.mjs 2027 12   # 模拟 2027 年 12 月：会要求 2028 年数据
```

## English

The second line under a date shows the first of: holiday name, solar term, observance, lunar day. Red wash, red number and the 休 badge mark days off.

Only `src/features/todos/calendar-marks/holidays.ts` needs a yearly edit. The State Council publishes the next year's arrangement each November; add one `YYYY: { breaks, workdays }` block to `PLANS`, copy each 放假 range into `breaks` and each 上班 day into `workdays`, then run `node scripts/check-holidays.mjs` and `pnpm test`. Solar terms, lunar dates and the fixed-date observances are computed or listed elsewhere and never need updating.

`breaks[].name` must be a key in `notebook.holidayNames`; a new key also needs `zhCN` and `en` entries. National Day and Mid-Autumn that fall together are a single `nationalDay` range, and the Spring Festival range already starts on New Year's Eve as published.
