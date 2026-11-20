import type { FlexDate, Memory, MemoryKind, MemoryWindow, Person, Relationship } from './types';

/** Every kind of date Memories can show. A divorce or separation date is deliberately not one of them. */
export const MEMORY_KINDS: MemoryKind[] = ['birthday', 'deathAnniversary', 'marriageAnniversary', 'postDate'];
export const MEMORY_WINDOWS: MemoryWindow[] = ['day', 'week', 'month'];

export type MemoryWindows = Record<MemoryKind, MemoryWindow>;

/** The window for each kind: what the admin saved, else the exact day. Unknown values fall back to the day. */
export function resolveWindows(saved?: Partial<Record<MemoryKind, MemoryWindow>>): MemoryWindows {
  const out = {} as MemoryWindows;
  for (const kind of MEMORY_KINDS) {
    const value = saved?.[kind];
    out[kind] = value && MEMORY_WINDOWS.includes(value) ? value : 'day';
  }
  return out;
}

/** What to ask the reader to pray for. Always a dua; a deceased person is never "remembered". */
export type DuaKind = 'living' | 'deceased' | 'couple' | 'coupleOneDeceased';

export interface CalendarEvent {
  /** Stable id, e.g. "birthday:p1". */
  key: string;
  kind: MemoryKind;
  /** The day this falls on (the first of the month when only the month is known). */
  date: Date;
  /** False when only the month is known; such a date is never turned into an exact day. */
  dayKnown: boolean;
  /** The date was recorded as approximate, or has no day. Shown with a label. */
  approx: boolean;
  /** Falls exactly today, whatever the window. Reminders go out on these only. */
  isToday: boolean;
  /** Years since the original date, when the year is known. */
  years?: number;
  personId?: string;
  /** The other spouse, for a marriage anniversary. */
  partnerId?: string;
  memoryId?: string;
  dua?: DuaKind;
}

export interface MemoryOptions {
  /** Show the marriage anniversary of a couple whose marriage ended by divorce or separation. Default off. */
  includeEndedMarriages?: boolean;
}

/** Saturday, the first day of the week in Bangladesh. */
export const WEEK_STARTS_ON = 6;

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const sameDay = (a: Date, b: Date) => startOfDay(a).getTime() === startOfDay(b).getTime();

export function startOfWeek(d: Date, weekStartsOn = WEEK_STARTS_ON): Date {
  const s = startOfDay(d);
  return new Date(s.getFullYear(), s.getMonth(), s.getDate() - ((s.getDay() - weekStartsOn + 7) % 7));
}

/** A month/day in a given year. 29 February falls on 28 in years that have no 29th. */
export function occurrenceIn(year: number, month: number, day: number): Date {
  const leap = new Date(year, 1, 29).getMonth() === 1;
  return new Date(year, month - 1, month === 2 && day === 29 && !leap ? 28 : day);
}

/**
 * The date to show when a month/day is inside the window around `today`, else null.
 * With only a month known, only the "month" window can match, and never an exact day.
 * A year-only or empty date never matches.
 */
export function windowHit(
  d: Pick<FlexDate, 'month' | 'day'> | undefined,
  today: Date,
  window: MemoryWindow,
): Date | null {
  if (!d?.month) return null;
  const year = today.getFullYear();
  if (!d.day) {
    return window === 'month' && d.month === today.getMonth() + 1 ? new Date(year, d.month - 1, 1) : null;
  }
  // The year before and after matter for a week that crosses New Year.
  for (const y of [year, year - 1, year + 1]) {
    const occ = occurrenceIn(y, d.month, d.day);
    const hit =
      window === 'day'
        ? sameDay(occ, today)
        : window === 'week'
          ? startOfWeek(occ).getTime() === startOfWeek(today).getTime()
          : occ.getFullYear() === year && occ.getMonth() === today.getMonth();
    if (hit) return occ;
  }
  return null;
}

const hasAnyDate = (d?: FlexDate) => d !== undefined && (d.year !== undefined || d.month !== undefined || d.day !== undefined);

/** Known to have died: marked so, or has a death date and is not marked as living. */
export const isDeceased = (p: Person): boolean => p.living === false || (p.living !== true && hasAnyDate(p.death));

/**
 * What Memories shows right now. Every date on every person, marriage and published story is
 * considered, and an item appears only when today falls in its window:
 *
 * - birthdays (of the living and of the departed), death anniversaries, marriage anniversaries
 *   and the dates of published stories;
 * - the end of a marriage (`endDate`, `endKind`) is never read, so a divorce or separation date
 *   cannot appear here. The marriage anniversary of a couple who divorced or separated is also left
 *   out unless `includeEndedMarriages` is set;
 * - nothing in the window gives an empty list, and the page shows nothing at all for it.
 */
export function memoryEvents(
  people: Person[],
  rels: Relationship[],
  memories: Memory[],
  today: Date,
  windows: MemoryWindows,
  options: MemoryOptions = {},
): CalendarEvent[] {
  const byId = new Map(people.map((p) => [p.id, p]));
  const out: CalendarEvent[] = [];

  const add = (
    d: FlexDate | undefined,
    kind: MemoryKind,
    key: string,
    extra: Pick<CalendarEvent, 'personId' | 'partnerId' | 'memoryId' | 'dua'>,
  ) => {
    const date = windowHit(d, today, windows[kind]);
    if (!d || !date) return;
    const dayKnown = d.day !== undefined;
    out.push({
      key,
      kind,
      date,
      dayKnown,
      approx: d.approx === true || !dayKnown,
      isToday: dayKnown && sameDay(date, today),
      years: d.year !== undefined ? date.getFullYear() - d.year : undefined,
      ...extra,
    });
  };

  for (const p of people) {
    const gone = isDeceased(p);
    add(p.birth, 'birthday', `birthday:${p.id}`, { personId: p.id, dua: gone ? 'deceased' : 'living' });
    add(p.death, 'deathAnniversary', `deathAnniversary:${p.id}`, { personId: p.id, dua: 'deceased' });
  }

  for (const r of rels) {
    if (r.type !== 'spouse') continue;
    if (!options.includeEndedMarriages && (r.endKind === 'divorce' || r.endKind === 'separation')) continue;
    const a = byId.get(r.personA);
    const b = byId.get(r.personB);
    if (!a || !b) continue;
    const gone = [a, b].filter(isDeceased).length;
    add(r.startDate, 'marriageAnniversary', `marriageAnniversary:${r.id}`, {
      personId: a.id,
      partnerId: b.id,
      dua: gone === 1 ? 'coupleOneDeceased' : 'couple',
    });
  }

  for (const m of memories) {
    if (m.status === 'published') add(m.date, 'postDate', `postDate:${m.id}`, { memoryId: m.id });
  }

  return out.sort(
    (x, y) =>
      x.date.getTime() - y.date.getTime() ||
      MEMORY_KINDS.indexOf(x.kind) - MEMORY_KINDS.indexOf(y.kind) ||
      x.key.localeCompare(y.key),
  );
}
