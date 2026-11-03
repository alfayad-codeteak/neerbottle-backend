import {
  calendarDateInKolkata,
  nextBookableTimeSlot,
  normalizeOrderTimeSlot,
} from './order-schedule';

describe('order-schedule India slots', () => {
  /** 30 Oct 2026 23:10 IST */
  const afterElevenPm = new Date('2026-10-30T17:40:00.000Z');
  /** 30 Oct 2026 09:30 IST */
  const morning = new Date('2026-10-30T04:00:00.000Z');
  /** 30 Oct 2026 10:10 IST */
  const duringFirstSlot = new Date('2026-10-30T04:40:00.000Z');

  it('uses the Kolkata calendar date after 11pm', () => {
    expect(calendarDateInKolkata(afterElevenPm)).toBe('2026-10-30');
  });

  it('rolls to next-day 10:00-11:00 after the last evening slot', () => {
    expect(nextBookableTimeSlot(afterElevenPm)).toBe('2026-10-31 10:00-11:00');
  });

  it('does not keep today 10:00-11:00 when that window has passed', () => {
    expect(normalizeOrderTimeSlot('2026-10-30 10:00-11:00', afterElevenPm)).toBe(
      '2026-10-31 10:00-11:00',
    );
    expect(normalizeOrderTimeSlot('10:00-11:00', afterElevenPm)).toBe(
      '2026-10-31 10:00-11:00',
    );
    expect(normalizeOrderTimeSlot(undefined, afterElevenPm)).toBe(
      '2026-10-31 10:00-11:00',
    );
  });

  it('keeps an explicit future-dated slot', () => {
    expect(normalizeOrderTimeSlot('2026-10-31 15:00-16:00', afterElevenPm)).toBe(
      '2026-10-31 15:00-16:00',
    );
  });

  it('picks today 10:00-11:00 before that window starts', () => {
    expect(nextBookableTimeSlot(morning)).toBe('2026-10-30 10:00-11:00');
  });

  it('skips a slot that already started', () => {
    expect(nextBookableTimeSlot(duringFirstSlot)).toBe('2026-10-30 11:00-12:00');
  });
});
