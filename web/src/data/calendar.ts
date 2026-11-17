import type { FlexDate, Memory, Person, Relationship } from './types';

export interface CalendarEvent {
  /** The day it next falls on. */
  date: Date;
  kind: 'birthday' | 'remembrance' | 'anniversary' | 'memory';
  personId?: string;
  /** The other partner, for an anniversary. */
  otherId?: string;
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
export function upcomingEvents(
  people: Person[],
  memories: Memory[],
  from: Date,
  days: number,
  rels: Relationship[] = [],
): CalendarEvent[] {
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
  // Wedding anniversaries of marriages that are still going.
  const alive = new Set(people.filter((p) => p.living !== false).map((p) => p.id));
  for (const r of rels) {
    if (r.type !== 'spouse' || r.endKind || !alive.has(r.personA) || !alive.has(r.personB)) continue;
    add(r.startDate, { kind: 'anniversary', personId: r.personA, otherId: r.personB });
  }
  for (const m of memories) {
    if (m.status === 'published') add(m.date, { kind: 'memory', memoryId: m.id });
  }
  return out.sort((a, b) => a.date.getTime() - b.date.getTime());
}

export interface LifeEvent {
  id: string;
  kind: 'birth' | 'death' | 'marriage';
  date: FlexDate;
  personId: string;
  /** The partner, for a marriage. */
  otherId?: string;
}

const dateKey = (d: FlexDate): number => (d.year ?? 0) * 10000 + (d.month ?? 0) * 100 + (d.day ?? 0);

/**
 * Births, deaths and marriages that have a date written down, newest first. Anyone adding or
 * changing such a date adds to this list, so the family's dates show up beside their stories.
 */
export function lifeEvents(people: Person[], rels: Relationship[]): LifeEvent[] {
  const out: LifeEvent[] = [];
  const known = new Set(people.map((p) => p.id));
  for (const p of people) {
    if (p.birth?.year) out.push({ id: `birth:${p.id}`, kind: 'birth', date: p.birth, personId: p.id });
    if (p.death?.year) out.push({ id: `death:${p.id}`, kind: 'death', date: p.death, personId: p.id });
  }
  for (const r of rels) {
    if (r.type === 'spouse' && r.startDate?.year && known.has(r.personA) && known.has(r.personB)) {
      out.push({ id: `marriage:${r.id}`, kind: 'marriage', date: r.startDate, personId: r.personA, otherId: r.personB });
    }
  }
  return out.sort((a, b) => dateKey(b.date) - dateKey(a.date));
}
