import { describe, expect, it } from 'vitest';
import {
  isDeceased,
  memoryEvents,
  occurrenceIn,
  resolveWindows,
  startOfWeek,
  windowHit,
  type MemoryWindows,
} from './calendar';
import { memoriesBn, memoriesEn } from '../i18n-memories';
import type { Memory, MemoryKind, MemoryWindow, Person, Relationship } from './types';

const person = (id: string, extra: Partial<Person> = {}): Person => ({ id, createdBy: 'u', ...extra });
const marriage = (id: string, a: string, b: string, extra: Partial<Relationship> = {}): Relationship => ({
  id,
  personA: a,
  personB: b,
  type: 'spouse',
  createdBy: 'u',
  ...extra,
});
const story = (id: string, extra: Partial<Memory> = {}): Memory => ({
  id,
  body: 'x',
  authorUid: 'u',
  status: 'published',
  ...extra,
});
const all = (w: MemoryWindow): MemoryWindows => resolveWindows(Object.fromEntries(
  (['birthday', 'deathAnniversary', 'marriageAnniversary', 'postDate'] as MemoryKind[]).map((k) => [k, w]),
));

// Saturday 21 November 2026. The week runs Saturday 21 to Friday 27.
const today = new Date(2026, 10, 21);

describe('windows', () => {
  it('defaults every kind to the exact day and ignores values it does not know', () => {
    expect(resolveWindows()).toEqual(all('day'));
    expect(resolveWindows({ birthday: 'month', postDate: 'year' as MemoryWindow }).postDate).toBe('day');
    expect(resolveWindows({ birthday: 'month' }).birthday).toBe('month');
  });

  it('puts 29 February on the 28th in other years', () => {
    expect(occurrenceIn(2027, 2, 29)).toEqual(new Date(2027, 1, 28));
    expect(occurrenceIn(2028, 2, 29)).toEqual(new Date(2028, 1, 29));
  });

  it('starts the week on Saturday', () => {
    expect(startOfWeek(new Date(2026, 10, 27))).toEqual(new Date(2026, 10, 21)); // Friday
    expect(startOfWeek(new Date(2026, 10, 21))).toEqual(new Date(2026, 10, 21)); // Saturday
    expect(startOfWeek(new Date(2026, 10, 20))).toEqual(new Date(2026, 10, 14)); // previous Friday
  });

  it('matches by day, week or month', () => {
    expect(windowHit({ month: 11, day: 21 }, today, 'day')).toEqual(today);
    expect(windowHit({ month: 11, day: 25 }, today, 'day')).toBeNull();
    expect(windowHit({ month: 11, day: 25 }, today, 'week')).toEqual(new Date(2026, 10, 25));
    expect(windowHit({ month: 11, day: 20 }, today, 'week')).toBeNull(); // last week
    expect(windowHit({ month: 11, day: 28 }, today, 'week')).toBeNull(); // next week
    expect(windowHit({ month: 11, day: 3 }, today, 'month')).toEqual(new Date(2026, 10, 3));
    expect(windowHit({ month: 12, day: 3 }, today, 'month')).toBeNull();
  });

  it('keeps a week that crosses New Year together', () => {
    const friday = new Date(2027, 0, 1); // the week began on Saturday 26 December
    expect(windowHit({ month: 12, day: 28 }, friday, 'week')).toEqual(new Date(2026, 11, 28));
    expect(windowHit({ month: 12, day: 20 }, friday, 'week')).toBeNull();
    const dec30 = new Date(2026, 11, 30);
    expect(windowHit({ month: 1, day: 1 }, dec30, 'week')).toEqual(new Date(2027, 0, 1));
  });

  it('only shows a month-only date in the month window, never as an exact day', () => {
    expect(windowHit({ month: 11 }, today, 'day')).toBeNull();
    expect(windowHit({ month: 11 }, today, 'week')).toBeNull();
    expect(windowHit({ month: 11 }, today, 'month')).not.toBeNull();
    expect(windowHit({ month: 10 }, today, 'month')).toBeNull();
  });

  it('never shows a year-only or empty date', () => {
    expect(windowHit({}, today, 'month')).toBeNull();
    expect(windowHit(undefined, today, 'month')).toBeNull();
  });
});

describe('what Memories shows', () => {
  it('shows nothing when no date is in the window', () => {
    const people = [person('a', { birth: { year: 1990, month: 3, day: 1 } })];
    expect(memoryEvents(people, [], [], today, all('day'))).toEqual([]);
    expect(memoryEvents([], [], [], today, all('month'))).toEqual([]);
  });

  it('shows birthdays of the living and the departed, with a dua', () => {
    const people = [
      person('a', { birth: { year: 1990, month: 11, day: 21 } }),
      person('b', { living: false, birth: { year: 1920, month: 11, day: 21 }, death: { year: 1990, month: 5, day: 1 } }),
    ];
    const events = memoryEvents(people, [], [], today, all('day'));
    expect(events.map((e) => [e.kind, e.personId, e.years, e.dua, e.isToday])).toEqual([
      ['birthday', 'a', 36, 'living', true],
      ['birthday', 'b', 106, 'deceased', true],
    ]);
  });

  it('shows a death anniversary with a dua, also when only a death date is recorded', () => {
    const p = person('d', { death: { year: 2000, month: 11, day: 21 } });
    expect(isDeceased(p)).toBe(true);
    expect(isDeceased(person('x', { living: true, death: { year: 2000 } }))).toBe(false);
    const events = memoryEvents([p], [], [], today, all('day'));
    expect(events.map((e) => [e.kind, e.dua])).toEqual([['deathAnniversary', 'deceased']]);
  });

  it('shows the story dates of published stories only', () => {
    const date = { year: 2000, month: 11, day: 21 };
    const events = memoryEvents([], [], [story('m1', { date }), story('m2', { date, status: 'pending' })], today, all('day'));
    expect(events.map((e) => [e.kind, e.memoryId, e.dua])).toEqual([['postDate', 'm1', undefined]]);
  });

  it('week and month windows keep an item visible, but only the exact day counts as today', () => {
    const people = [person('a', { birth: { year: 1990, month: 11, day: 25 } })];
    const week = memoryEvents(people, [], [], today, all('week'));
    expect(week).toHaveLength(1);
    expect(week[0].isToday).toBe(false);
    expect(memoryEvents(people, [], [], today, all('month'))).toHaveLength(1);
    expect(memoryEvents(people, [], [], today, all('day'))).toHaveLength(0);
  });

  it('sets the window for each kind separately', () => {
    const people = [person('a', { birth: { year: 1990, month: 11, day: 3 } })];
    const stories = [story('m1', { date: { year: 2000, month: 11, day: 3 } })];
    const windows = resolveWindows({ birthday: 'month' });
    expect(memoryEvents(people, [], stories, today, windows).map((e) => e.kind)).toEqual(['birthday']);
  });

  it('labels a month-only date as approximate and not as a day', () => {
    const people = [person('a', { birth: { year: 1985, month: 11 } })];
    const [e] = memoryEvents(people, [], [], today, all('month'));
    expect([e.dayKnown, e.approx, e.isToday]).toEqual([false, true, false]);
  });

  it('marks a recorded approximate date as approximate', () => {
    const people = [person('a', { birth: { year: 1985, month: 11, day: 21, approx: true } })];
    const [e] = memoryEvents(people, [], [], today, all('day'));
    expect([e.dayKnown, e.approx]).toEqual([true, true]);
  });
});

describe('marriages', () => {
  const married = { year: 2000, month: 11, day: 21 };
  const couple = [person('a'), person('b')];

  it('shows each marriage on its own day, naming the right couple', () => {
    const people = [person('a'), person('b'), person('c')];
    const rels = [
      marriage('r1', 'a', 'b', { startDate: married }),
      marriage('r2', 'a', 'c', { startDate: { year: 2010, month: 11, day: 21 } }),
    ];
    const events = memoryEvents(people, rels, [], today, all('day'));
    expect(events.map((e) => [e.key, e.personId, e.partnerId, e.years])).toEqual([
      ['marriageAnniversary:r1', 'a', 'b', 26],
      ['marriageAnniversary:r2', 'a', 'c', 16],
    ]);
  });

  it('never shows a separation or divorce date, whatever it is and whatever the window', () => {
    const ended = { year: 2005, month: 11, day: 21 };
    for (const endKind of ['divorce', 'separation', 'death'] as const) {
      const rels = [marriage('r', 'a', 'b', { startDate: { year: 2000, month: 3, day: 1 }, endDate: ended, endKind })];
      for (const w of ['day', 'week', 'month'] as const) {
        expect(memoryEvents(couple, rels, [], today, all(w), { includeEndedMarriages: true })).toEqual([]);
      }
    }
  });

  it('leaves out the anniversary of a divorced or separated couple unless asked', () => {
    const base = { startDate: married, endDate: { year: 2005, month: 1, day: 1 } };
    for (const endKind of ['divorce', 'separation'] as const) {
      const rels = [marriage('r', 'a', 'b', { ...base, endKind })];
      expect(memoryEvents(couple, rels, [], today, all('day'))).toEqual([]);
      expect(memoryEvents(couple, rels, [], today, all('day'), { includeEndedMarriages: true })).toHaveLength(1);
    }
  });

  it('keeps the anniversary when a spouse has died, with a dua for the departed', () => {
    const people = [person('a'), person('b', { living: false })];
    const rels = [marriage('r', 'a', 'b', { startDate: married, endKind: 'death', endDate: { year: 2010 } })];
    const events = memoryEvents(people, rels, [], today, all('day'));
    expect(events.map((e) => e.dua)).toEqual(['coupleOneDeceased']);
  });

  it('asks for a dua for both when both are living or both have died', () => {
    const rels = [marriage('r', 'a', 'b', { startDate: married })];
    expect(memoryEvents(couple, rels, [], today, all('day'))[0].dua).toBe('couple');
    const gone = [person('a', { living: false }), person('b', { living: false })];
    expect(memoryEvents(gone, rels, [], today, all('day'))[0].dua).toBe('couple');
  });

  it('skips a marriage whose people are not loaded, and links that are not marriages', () => {
    const rels = [
      marriage('r1', 'a', 'missing', { startDate: married }),
      { ...marriage('r2', 'a', 'b', { startDate: married }), type: 'sibling' as const },
    ];
    expect(memoryEvents(couple, rels, [], today, all('day'))).toEqual([]);
  });
});

describe('dua wording', () => {
  // A departed person gets a dua request only, never a call to remember them.
  const banned = /remember|remembr|recall|in memory|স্মরণ|মনে|ভুলবেন/i;
  const sets = { bn: memoriesBn, en: memoriesEn };

  for (const [lang, text] of Object.entries(sets)) {
    it(`has no remembrance wording in the ${lang} dua and anniversary texts`, () => {
      const keys = Object.keys(text).filter((k) => k.startsWith('dua') || k === 'calDeathAnniversary');
      expect(keys.length).toBeGreaterThanOrEqual(4);
      for (const k of keys) expect(String(text[k as keyof typeof text])).not.toMatch(banned);
    });
  }
});
