/** All timestamps are UTC milliseconds. Calendar days are computed in Asia/Jerusalem (DST-aware). */
export const TIME_ZONE = 'Asia/Jerusalem';
export const HOUR = 3_600_000;
export const DAY = 24 * HOUR;

const dayFormat = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

/** Local calendar day in Asia/Jerusalem as YYYY-MM-DD. */
export function localDay(ts: number): string {
  const parts = dayFormat.formatToParts(new Date(ts));
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? '';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function hoursBetween(a: number, b: number): number {
  return Math.abs(b - a) / HOUR;
}

export interface Clock {
  now(): number;
}

export const systemClock: Clock = { now: () => Date.now() };

const heDate = new Intl.DateTimeFormat('he-IL', { timeZone: TIME_ZONE, day: 'numeric', month: 'numeric' });
const heDateTime = new Intl.DateTimeFormat('he-IL', {
  timeZone: TIME_ZONE,
  day: 'numeric',
  month: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

export function formatDay(ts: number): string {
  return heDate.format(new Date(ts));
}

export function formatDateTime(ts: number): string {
  return heDateTime.format(new Date(ts));
}

/** "אחרי 26 שעות" / "אחרי 3 ימים" — the measured interval, in Hebrew. */
export function formatInterval(hours: number): string {
  if (hours < 48) return `אחרי ${Math.round(hours)} שעות`;
  return `אחרי ${Math.round(hours / 24)} ימים`;
}

/** Relative due text: "היום", "מחר", "בעוד 3 ימים". */
export function formatDue(dueAt: number, now: number): string {
  const today = localDay(now);
  const dueDay = localDay(dueAt);
  if (dueAt <= now || dueDay === today) return 'היום';
  const days = Math.round((Date.parse(dueDay) - Date.parse(today)) / DAY);
  if (days === 1) return 'מחר';
  return `בעוד ${days} ימים`;
}
