const KOLKATA = 'Asia/Kolkata';

/** Calendar date `YYYY-MM-DD` in India. */
export function calendarDateInKolkata(at: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: KOLKATA,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(at);
}

/**
 * Persist `YYYY-MM-DD HH:mm-HH:mm` so lists can use the delivery day,
 * not the moment the customer placed the order.
 */
export function normalizeOrderTimeSlot(raw: string | undefined | null, now = new Date()): string {
  const trimmed = (raw ?? '').trim();
  const dated = trimmed.match(/^(\d{4}-\d{2}-\d{2})\s+(\d{1,2}:\d{2})\s*-\s*(\d{1,2}:\d{2})$/);
  if (dated) {
    return `${dated[1]} ${padHm(dated[2])}-${padHm(dated[3])}`;
  }
  const slotOnly = trimmed.replace(/\s/g, '').match(/^(\d{1,2}:\d{2})-(\d{1,2}:\d{2})$/);
  if (slotOnly) {
    return `${calendarDateInKolkata(now)} ${padHm(slotOnly[1])}-${padHm(slotOnly[2])}`;
  }
  return `${calendarDateInKolkata(now)} 10:00-11:00`;
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
