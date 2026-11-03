const KOLKATA = 'Asia/Kolkata';
const IST_OFFSET = '+05:30';

/** Required delivery windows in India time. */
export const BOOKABLE_WINDOWS = [
  ['10:00', '11:00'],
  ['11:00', '12:00'],
  ['13:00', '14:00'],
  ['15:00', '16:00'],
  ['16:00', '17:00'],
  ['17:00', '18:00'],
  ['18:00', '19:00'],
  ['19:00', '20:00'],
  ['20:00', '21:00'],
] as const;

/** Calendar date `YYYY-MM-DD` in India. */
export function calendarDateInKolkata(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

export function addCalendarDays(ymd: string, days: number): string {
  const utcNoon = Date.parse(`${ymd}T12:00:00.000Z`);
  const next = new Date(utcNoon + days * 24 * 60 * 60 * 1000);
  const y = next.getUTCFullYear();
  const m = String(next.getUTCMonth() + 1).padStart(2, '0');
  const d = String(next.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function slotStartMs(ymd: string, hm: string): number {
  return Date.parse(`${ymd}T${padHm(hm)}:00${IST_OFFSET}`);
}

/** Next window whose start is still in the future in Asia/Kolkata. */
export function nextBookableTimeSlot(now = new Date()): string {
  const today = calendarDateInKolkata(now);
  const nowMs = now.getTime();
  for (const [start, end] of BOOKABLE_WINDOWS) {
    if (slotStartMs(today, start) > nowMs) {
      return `${today} ${start}-${end}`;
    }
  }
  const tomorrow = addCalendarDays(today, 1);
  const [start, end] = BOOKABLE_WINDOWS[0];
  return `${tomorrow} ${start}-${end}`;
}

/**
 * Persist `YYYY-MM-DD HH:mm-HH:mm` so lists can use the delivery day,
 * not the moment the customer placed the order.
 *
 * Slot-only values are today in India. If that window has already started
 * (e.g. 10:00–11:00 booked after 11pm), roll forward to the next bookable slot.
 */
export function normalizeOrderTimeSlot(raw: string | undefined | null, now = new Date()): string {
  const trimmed = (raw ?? '').trim();
  const dated = trimmed.match(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/,
  );
  if (dated) {
    const date = dated[1];
    const start = padHm(dated[2]);
    const end = padHm(dated[3]);
    if (slotStartMs(date, start) > now.getTime()) {
      return `${date} ${start}-${end}`;
    }
    return nextBookableTimeSlot(now);
  }
  const slotOnly = trimmed.replace(/\s/g, '').match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (slotOnly) {
    const today = calendarDateInKolkata(now);
    const start = padHm(slotOnly[1]);
    const end = padHm(slotOnly[2]);
    if (slotStartMs(today, start) > now.getTime()) {
      return `${today} ${start}-${end}`;
    }
    return nextBookableTimeSlot(now);
  }
  return nextBookableTimeSlot(now);
}

export function scheduledDateFromTimeSlot(
  timeSlot: string | null | undefined,
  createdAt: Date,
): string {
  const match = (timeSlot ?? '').trim().match(/^(\d{4}-\d{2}-\d{2})\b/);
  if (match) return match[1];
  return calendarDateInKolkata(createdAt);
}

export function isUpcomingScheduledDate(scheduledDate: string, now = new Date()): boolean {
  return scheduledDate > calendarDateInKolkata(now);
}

function padHm(hm: string): string {
  const [h, m] = hm.split(':');
  return `${String(Number(h)).padStart(2, '0')}:${m}`;
}
