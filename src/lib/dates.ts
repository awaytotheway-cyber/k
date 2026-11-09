/**
 * Date helpers.
 *
 * Reading the clock lives here rather than inline in components: it keeps
 * component bodies pure, and it means `now` can be injected in tests.
 */

const MS_PER_DAY = 86_400_000;

/**
 * Whole days from `now` until `date`, floored at zero.
 *
 * Used for "N days left in trial", so a part-day counts as a day — someone with
 * 18 hours remaining has a day left, not zero.
 */
export function daysUntil(date: Date | null | undefined, now: Date = new Date()): number | null {
  if (!date) return null;
  return Math.max(0, Math.ceil((date.getTime() - now.getTime()) / MS_PER_DAY));
}

/** UTC midnight on the day `date` falls in. */
export function startOfUtcDay(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

/** `count` whole days before `from`, at UTC midnight. */
export function utcDaysAgo(count: number, from: Date = new Date()): Date {
  const d = startOfUtcDay(from);
  d.setUTCDate(d.getUTCDate() - count);
  return d;
}
