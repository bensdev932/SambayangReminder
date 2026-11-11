/**
 * Prayer Calendar — pure in-process domain module.
 *
 * Owns prayer-time astronomy (Muslim World League + Shafi), Hijri conversion
 * (Intl islamic-umalqura with an offline Kuwaiti tabular fallback for Hermes),
 * the Islamic event countdown, the upcoming-prayer countdown, the 7-day rolling
 * alarm queue, and foreground arrival detection.
 *
 * Invariant: this module never imports `react-native`, `expo-*`, or any UI
 * library, so it runs unchanged on Hermes and under Node `tsx --test`.
 * UI concerns (icons, gradient colours) are mapped from the symbolic tokens
 * returned here by the screen that renders them.
 */
import { CalculationMethod, Coordinates, Madhab, PrayerTimes } from 'adhan';

export type PrayerName = 'Fajr' | 'Dhuhr' | 'Asr' | 'Maghrib' | 'Isha';

export const PRAYER_ORDER: readonly PrayerName[] = ['Fajr', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];

export interface GeoCoordinates {
  readonly latitude: number;
  readonly longitude: number;
}

export interface PrayerSlot {
  readonly id: PrayerName;
  readonly name: PrayerName;
  readonly time: Date;
  readonly formattedTime: string;
}

export interface DailyPrayerWindow {
  readonly calendarDateKey: string;
  readonly prayersList: readonly PrayerSlot[];
  readonly tomorrowPrayerMap: Readonly<Record<PrayerName, Date>>;
}

export interface UpcomingPrayer {
  readonly upcomingName: PrayerName;
  readonly targetTime: Date;
  readonly totalSeconds: number;
  readonly countdownString: string;
}

export interface ScheduledPrayerAlarm {
  readonly prayerName: PrayerName;
  readonly timestampMs: number;
  readonly isFajr: boolean;
}

export interface HijriDate {
  readonly year: number;
  readonly month: number;
  readonly day: number;
  readonly monthName: string;
}

/** Symbolic event token; the rendering screen maps it to an icon. */
export type IslamicEventToken =
  | 'ramadan_countdown'
  | 'eid_fitr_countdown'
  | 'eid_fitr_celebration'
  | 'eid_adha_countdown';

export interface IslamicEventInfo {
  readonly eventToken: IslamicEventToken;
  readonly targetTitle: string;
  readonly targetHijriLabel: string;
  readonly greeting: string | null;
  readonly targetDate: Date;
  readonly targetDateFormatted: string;
  readonly days: number;
  readonly hours: number;
  readonly minutes: number;
  readonly isAnticipatingRamadan: boolean;
  readonly daysUntilShaban: number;
  readonly preparationProgressPercent: number;
  readonly duaArabic: string;
  readonly duaTranslation: string;
}

const DAY_MS = 86_400_000;

/** Foreground arrival window: a prayer counts as "arrived" for this many seconds. */
export const ARRIVAL_WINDOW_SECONDS = 120;

const HIJRI_MONTH_NAMES = [
  'Muharram',
  'Safar',
  "Rabi' al-Awwal",
  "Rabi' al-Thani",
  'Jumada al-Ula',
  'Jumada al-Akhirah',
  'Rajab',
  "Sha'ban",
  'Ramadan',
  'Shawwal',
  "Dhu al-Qi'dah",
  'Dhu al-Hijjah',
];

// ---------------------------------------------------------------------------
// Date & time formatting
// ---------------------------------------------------------------------------

/** Stable local calendar key ("YYYY-MM-DD") that only changes at midnight. */
export function toCalendarDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(
    date.getDate()
  ).padStart(2, '0')}`;
}

function noonOf(calendarDateKey: string, dayOffset = 0): Date {
  const [year, month, day] = calendarDateKey.split('-').map(Number);
  // Noon anchoring keeps daily calculations stable across DST boundaries.
  return new Date(year, month - 1, day + dayOffset, 12, 0, 0);
}

export function formatGregorianDate(date: Date): string {
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const months = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]}`;
}

export function formatPrayerTime(date: Date): string {
  let hours = date.getHours();
  const minutes = date.getMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  hours = hours ? hours : 12;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')} ${ampm}`;
}

// ---------------------------------------------------------------------------
// Hijri calendar
// ---------------------------------------------------------------------------

/**
 * Kuwaiti tabular Hijri conversion. 100% offline and deterministic; used when
 * Hermes lacks `islamic-umalqura` ICU data.
 */
export function getTabularHijriDate(d: Date): HijriDate {
  const year = d.getFullYear();
  const month = d.getMonth() + 1;
  const day = d.getDate();

  const jd =
    Math.floor((1461 * (year + 4800 + Math.floor((month - 14) / 12))) / 4) +
    Math.floor((367 * (month - 2 - 12 * Math.floor((month - 14) / 12))) / 12) -
    Math.floor((3 * Math.floor((year + 4900 + Math.floor((month - 14) / 12)) / 100)) / 4) +
    day -
    32075;

  const l = jd - 1948440 + 10632;
  const n = Math.floor((l - 1) / 10631);
  const l1 = l - 10631 * n + 354;
  const j =
    Math.floor((10985 - l1) / 5316) * Math.floor((50 * l1) / 17719) +
    Math.floor(l1 / 5670) * Math.floor((43 * l1) / 15238);
  const l2 =
    l1 -
    Math.floor((30 - j) / 15) * Math.floor((17719 * j) / 50) -
    Math.floor(j / 16) * Math.floor((15238 * j) / 43) +
    29;
  const m = Math.max(1, Math.min(12, Math.floor((24 * l2) / 709)));
  const dH = Math.max(1, Math.min(30, l2 - Math.floor((709 * m) / 24)));
  const yH = 30 * n + j - 30;

  return { year: yH, month: m, day: dH, monthName: HIJRI_MONTH_NAMES[m - 1] };
}

/** Hijri date via Intl `islamic-umalqura`, falling back to the tabular algorithm. */
export function getHijriDate(d: Date): HijriDate {
  try {
    const formatter = new Intl.DateTimeFormat('en-u-ca-islamic-umalqura', {
      year: 'numeric',
      month: 'numeric',
      day: 'numeric',
    });
    const parts = formatter.formatToParts(d);
    const m = parseInt(parts.find((p) => p.type === 'month')?.value || '', 10);
    const day = parseInt(parts.find((p) => p.type === 'day')?.value || '', 10);
    const y = parseInt(parts.find((p) => p.type === 'year')?.value || '', 10);
    if (!isNaN(m) && !isNaN(day) && !isNaN(y) && m >= 1 && m <= 12) {
      return { year: y, month: m, day, monthName: HIJRI_MONTH_NAMES[m - 1] };
    }
  } catch {
    // Graceful fallback to tabular calculation
  }
  return getTabularHijriDate(d);
}

export function formatHijriDate(date: Date): string {
  const h = getHijriDate(date);
  return `${h.day} ${h.monthName} ${h.year} AH`;
}

// ---------------------------------------------------------------------------
// Islamic event countdown (Ramadan -> Eid al-Fitr -> Eid al-Adha)
// ---------------------------------------------------------------------------

export function getIslamicEventInfo(now: Date): IslamicEventInfo {
  const { month, day } = getHijriDate(now);

  let eventToken: IslamicEventToken = 'ramadan_countdown';
  let targetTitle = 'Countdown to Ramadan';
  let targetHijriLabel = '1 Ramadan';
  let targetMonth = 9;
  let targetDay = 1;
  let greeting: string | null = null;

  if (month === 9) {
    // During Ramadan -> Eid al-Fitr (1 Shawwal)
    eventToken = 'eid_fitr_countdown';
    greeting = 'Ramadan Mubarak! 🌙';
    targetTitle = 'Countdown to Eid al-Fitr';
    targetHijriLabel = '1 Shawwal';
    targetMonth = 10;
    targetDay = 1;
  } else if (month === 10 && day <= 3) {
    // During Eid al-Fitr -> Eid al-Adha (10 Dhu al-Hijjah)
    eventToken = 'eid_fitr_celebration';
    greeting = 'Eid Mubarak! 🎉';
    targetTitle = 'Countdown to Eid al-Adha';
    targetHijriLabel = '10 Dhu al-Hijjah';
    targetMonth = 12;
    targetDay = 10;
  } else if (month > 9 && (month < 12 || (month === 12 && day < 10))) {
    // Between Eid al-Fitr and Eid al-Adha
    eventToken = 'eid_adha_countdown';
    targetTitle = 'Countdown to Eid al-Adha';
    targetHijriLabel = '10 Dhu al-Hijjah';
    targetMonth = 12;
    targetDay = 10;
  } else if (month === 12 && day >= 10 && day <= 13) {
    // During Eid al-Adha -> next Ramadan
    greeting = 'Eid al-Adha Mubarak! 🐑';
  }
  // Otherwise (before Ramadan, or after Eid al-Adha): countdown to next Ramadan.

  // Scan forward up to 400 days to find the exact target Gregorian date
  const startDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  let targetDate = new Date(startDay.getTime() + DAY_MS * 30);
  for (let i = 1; i <= 400; i++) {
    const candidate = new Date(startDay.getTime() + i * DAY_MS);
    const h = getHijriDate(candidate);
    if (h.month === targetMonth && h.day === targetDay) {
      targetDate = candidate;
      break;
    }
  }

  const diffMs = Math.max(0, targetDate.getTime() - now.getTime());
  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / 3_600_000);
  const minutes = Math.floor((diffMs % 3_600_000) / 60_000);

  const targetDateFormatted = targetDate.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const isAnticipatingRamadan = month < 9;
  let daysUntilShaban = 0;
  if (isAnticipatingRamadan && month < 8) {
    for (let i = 1; i <= 300; i++) {
      const candidate = new Date(startDay.getTime() + i * DAY_MS);
      const h = getHijriDate(candidate);
      if (h.month === 8 && h.day === 1) {
        daysUntilShaban = Math.max(0, Math.floor((candidate.getTime() - now.getTime()) / DAY_MS));
        break;
      }
    }
  }

  // Progress toward Ramadan based on Hijri year progress (months 1-8 toward month 9)
  const totalDaysIntoYear = (month - 1) * 30 + day;
  const preparationProgressPercent = Math.min(
    100,
    Math.max(8, Math.round((totalDaysIntoYear / (8 * 30)) * 100))
  );

  return {
    eventToken,
    targetTitle,
    targetHijriLabel,
    greeting,
    targetDate,
    targetDateFormatted,
    days,
    hours,
    minutes,
    isAnticipatingRamadan,
    daysUntilShaban,
    preparationProgressPercent,
    duaArabic: 'اللَّهُمَّ بَلِّغْنَا رَمَضَان',
    duaTranslation: 'O Allah, allow us to reach Ramadan.',
  };
}

// ---------------------------------------------------------------------------
// Prayer times
// ---------------------------------------------------------------------------

function computePrayerTimes(coords: GeoCoordinates, date: Date): Record<PrayerName, Date> {
  const params = CalculationMethod.MuslimWorldLeague();
  params.madhab = Madhab.Shafi;
  const times = new PrayerTimes(new Coordinates(coords.latitude, coords.longitude), date, params);
  return {
    Fajr: times.fajr,
    Dhuhr: times.dhuhr,
    Asr: times.asr,
    Maghrib: times.maghrib,
    Isha: times.isha,
  };
}

/** Today's five Fard prayers plus tomorrow's times for next-occurrence rollover. */
export function computeDailyPrayerWindow(
  coords: GeoCoordinates,
  calendarDateKey: string
): DailyPrayerWindow {
  const today = computePrayerTimes(coords, noonOf(calendarDateKey));
  const tomorrow = computePrayerTimes(coords, noonOf(calendarDateKey, 1));

  return {
    calendarDateKey,
    prayersList: PRAYER_ORDER.map((id) => ({
      id,
      name: id,
      time: today[id],
      formattedTime: formatPrayerTime(today[id]),
    })),
    tomorrowPrayerMap: tomorrow,
  };
}

/** Upcoming prayer + live countdown. After Isha, rolls over to tomorrow's Fajr. */
export function computeUpcomingPrayer(window: DailyPrayerWindow, nowMs: number): UpcomingPrayer {
  const next = window.prayersList.find((p) => nowMs < p.time.getTime());
  const targetTime = next ? next.time : window.tomorrowPrayerMap.Fajr;
  const upcomingName: PrayerName = next ? next.id : 'Fajr';

  const totalSeconds = Math.floor(Math.max(0, targetTime.getTime() - nowMs) / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const countdownString = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(
    2,
    '0'
  )}:${String(seconds).padStart(2, '0')} remaining time`;

  return { upcomingName, targetTime, totalSeconds, countdownString };
}

/** Next strictly-future occurrence of a prayer: today if still ahead, else tomorrow. */
export function nextPrayerOccurrence(
  window: DailyPrayerWindow,
  prayer: PrayerName,
  nowMs: number
): Date | null {
  const today = window.prayersList.find((p) => p.id === prayer)?.time;
  if (today && today.getTime() > nowMs) return today;
  const tomorrow = window.tomorrowPrayerMap[prayer];
  return tomorrow.getTime() > nowMs ? tomorrow : null;
}

/**
 * Rolling multi-day alarm queue for the native AlarmManager engine.
 * Output is strictly future, ascending by timestamp, and `isFajr` is always
 * `prayerName === 'Fajr'` — matching the AdhanAlarmModule queue contract.
 */
export function buildRollingPrayerAlarms(
  coords: GeoCoordinates,
  calendarDateKey: string,
  nowMs: number,
  daysCount = 7
): ScheduledPrayerAlarm[] {
  const alarms: ScheduledPrayerAlarm[] = [];
  for (let offset = 0; offset < daysCount; offset++) {
    const times = computePrayerTimes(coords, noonOf(calendarDateKey, offset));
    for (const prayerName of PRAYER_ORDER) {
      const timestampMs = times[prayerName].getTime();
      if (timestampMs > nowMs) {
        alarms.push({ prayerName, timestampMs, isFajr: prayerName === 'Fajr' });
      }
    }
  }
  return alarms.sort((a, b) => a.timestampMs - b.timestampMs);
}

/**
 * Foreground arrival detection. Returns the prayer whose time arrived within the
 * last {@link ARRIVAL_WINDOW_SECONDS}, deduplicated by `${dateKey}-${prayer}`.
 * If the clock winds back more than 10s before a played prayer, its key resets.
 */
export function evaluatePrayerArrival(
  window: DailyPrayerWindow,
  nowMs: number,
  lastPlayedKey: string | null
): { arrivedPrayer: PrayerName | null; nextPlayedKey: string | null } {
  let key = lastPlayedKey;
  for (const prayer of window.prayersList) {
    const elapsedSeconds = (nowMs - prayer.time.getTime()) / 1000;
    const prayerKey = `${window.calendarDateKey}-${prayer.id}`;

    if (elapsedSeconds < -10 && key === prayerKey) {
      key = null;
    }
    if (elapsedSeconds >= 0 && elapsedSeconds <= ARRIVAL_WINDOW_SECONDS && key !== prayerKey) {
      return { arrivedPrayer: prayer.id, nextPlayedKey: prayerKey };
    }
  }
  return { arrivedPrayer: null, nextPlayedKey: key };
}

