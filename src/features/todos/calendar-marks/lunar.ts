/**
 * The lunar day printed under a calendar number.
 *
 * The table covers 1900–2100, one entry per year: the low four bits are the leap month
 * (0 when the year has none), bit 16 is the leap month's length, and bits 15–4 are the
 * twelve months, set for 30 days and clear for 29. A day outside that range returns null
 * and the cell shows nothing on its second line.
 */
const LUNAR_INFO: readonly number[] = [
  19416, 19168, 42352, 21717, 53856, 55632, 91476, 22176, 39632, 21970,
  19168, 42422, 42192, 53840, 119381, 46400, 54944, 44450, 38320, 84343,
  18800, 42160, 46261, 27216, 27968, 109396, 11104, 38256, 21234, 18800,
  25958, 54432, 59984, 28309, 23248, 11104, 100067, 37600, 116951, 51536,
  54432, 120998, 46416, 22176, 107956, 9680, 37584, 53938, 43344, 46423,
  27808, 46416, 86869, 19872, 42416, 83315, 21168, 43432, 59728, 27296,
  44710, 43856, 19296, 43748, 42352, 21088, 62051, 55632, 23383, 22176,
  38608, 19925, 19152, 42192, 54484, 53840, 54616, 46400, 46752, 103846,
  38320, 18864, 43380, 42160, 45690, 27216, 27968, 44870, 43872, 38256,
  19189, 18800, 25776, 29859, 59984, 27480, 23232, 43872, 38613, 37600,
  51552, 55636, 54432, 55888, 30034, 22176, 43959, 9680, 37584, 51893,
  43344, 46240, 47780, 44368, 21977, 19360, 42416, 86390, 21168, 43312,
  31060, 27296, 44368, 23378, 19296, 42726, 42208, 53856, 60005, 54576,
  23200, 30371, 38608, 19195, 19152, 42192, 118966, 53840, 54560, 56645,
  46496, 22224, 21938, 18864, 42359, 42160, 43600, 111189, 27936, 44448,
  84835, 37744, 18936, 18800, 25776, 92326, 59984, 27424, 108228, 43744,
  37600, 53987, 51552, 54615, 54432, 55888, 23893, 22176, 42704, 21972,
  21200, 43448, 43344, 46240, 46758, 44368, 21920, 43940, 42416, 21168,
  45683, 26928, 29495, 27296, 44368, 84821, 19296, 42352, 21732, 53600,
  59752, 54560, 55968, 92838, 22224, 19168, 43476, 42192, 53584, 62034,
  54560,
];

/** 初一 … 三十, indexed by the lunar day. */
const DAY_NAMES = [
  "",
  "初一", "初二", "初三", "初四", "初五", "初六", "初七", "初八", "初九", "初十",
  "十一", "十二", "十三", "十四", "十五", "十六", "十七", "十八", "十九", "二十",
  "廿一", "廿二", "廿三", "廿四", "廿五", "廿六", "廿七", "廿八", "廿九", "三十",
];

/** 1900-01-31 was the first day of the first lunar month of 1900. */
const EPOCH = Date.UTC(1900, 0, 31);
const LAST = Date.UTC(2100, 11, 31);
const DAY_MS = 86_400_000;

function leapMonth(year: number) {
  return LUNAR_INFO[year - 1900] & 0xf;
}

function leapDays(year: number) {
  if (leapMonth(year) === 0) return 0;
  return LUNAR_INFO[year - 1900] & 0x10000 ? 30 : 29;
}

function monthDays(year: number, month: number) {
  return LUNAR_INFO[year - 1900] & (0x10000 >> month) ? 30 : 29;
}

function yearDays(year: number) {
  const info = LUNAR_INFO[year - 1900];
  let days = 348;
  for (let bit = 0x8000; bit > 0x8; bit >>= 1) {
    if (info & bit) days += 1;
  }
  return days + leapDays(year);
}

// Cache numeric days so changing the island's language never reuses old labels.
const cache = new Map<string, number | null>();

export function lunarDay(date: string, format = (_day: number, name: string) => name): string | null {
  const day = lunarDayNumber(date);
  return day === null ? null : format(day, DAY_NAMES[day]);
}

/** The lunar day for a YYYY-MM-DD date, or null when it falls outside 1900–2100. */
function lunarDayNumber(date: string): number | null {
  const cached = cache.get(date);
  if (cached !== undefined) return cached;

  const [year, month, day] = date.split("-").map(Number);
  const utc = Date.UTC(year, month - 1, day);
  let offset = Math.round((utc - EPOCH) / DAY_MS);
  let result: number | null = null;

  if (offset >= 0 && utc <= LAST) {
    let lunarYear = 1900;
    while (lunarYear <= 2100) {
      const days = yearDays(lunarYear);
      if (offset < days) break;
      offset -= days;
      lunarYear += 1;
    }
    const leap = leapMonth(lunarYear);
    for (let m = 1; m <= 12; m += 1) {
      const length = monthDays(lunarYear, m);
      if (offset < length) {
        result = offset + 1;
        break;
      }
      offset -= length;
      // The leap month follows the month it repeats, and its days are named the same way.
      if (m === leap) {
        const extra = leapDays(lunarYear);
        if (offset < extra) {
          result = offset + 1;
          break;
        }
        offset -= extra;
      }
    }
  }

  if (cache.size >= 512) cache.clear();
  cache.set(date, result);
  return result;
}
