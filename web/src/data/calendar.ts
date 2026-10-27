import type { Memory, Person } from './types';

export interface CalendarEvent {
  /** The day it next falls on. */
  date: Date;
  kind: 'birthday' | 'remembrance' | 'memory';
  personId?: string;
  memoryId?: string;
  /** Years since the original date, when the year is known. */
  years?: number;
}

/** The next time a month/day comes round, from `from` (today counts). 29 February falls on 28 in other years. */
export function nextOccurrence(month: number, day: number, from: Date): Date {
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  for (let year = start.getFullYear(); year <= start.getFullYear() + 8; year++) {
    const leap = new Date(year, 1, 29).getMonth() === 1;
    const d = month === 2 && day === 29 && !leap ? 28 : day;
    const candidate = new Date(year, month - 1, d);
    if (candidate.getMonth() === month - 1 && candidate >= start) return candidate;
  }
  return start;
}

/**
 * What falls in the next `days` days: birthdays of people not known to have died, remembrance
 * days (death dates) and the days of published memories. Only dates with a month and a day count.
 */
export function upcomingEvents(people: Person[], memories: Memory[], from: Date, days: number): CalendarEvent[] {
  const end = new Date(from.getFullYear(), from.getMonth(), from.getDate() + days);
  const out: CalendarEvent[] = [];

  const add = (
    d: { year?: number; month?: number; day?: number } | undefined,
    base: Omit<CalendarEvent, 'date' | 'years'>,
  ) => {
    if (!d?.month || !d.day) return;
    const date = nextOccurrence(d.month, d.day, from);
    if (date > end) return;
    out.push({ ...base, date, years: d.year !== undefined ? date.getFullYear() - d.year : undefined });
  };

  for (const p of people) {
    if (p.living !== false) add(p.birth, { kind: 'birthday', personId: p.id });
    if (p.living === false) add(p.death, { kind: 'remembrance', personId: p.id });
  }
  for (const m of memories) {
    if (m.status === 'published') add(m.date, { kind: 'memory', memoryId: m.id });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}
