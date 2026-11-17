import { describe, expect, it } from 'vitest';
import { lifeEvents, nextOccurrence, upcomingEvents } from './calendar';
import type { Memory, Person, Relationship } from './types';

const person = (id: string, extra: Partial<Person>): Person => ({ id, createdBy: 'u', ...extra });

describe('calendar', () => {
  const today = new Date(2026, 9, 27); // 27 Oct 2026

  it('finds the next time a day comes round, today included', () => {
    expect(nextOccurrence(10, 27, today)).toEqual(new Date(2026, 9, 27));
    expect(nextOccurrence(10, 26, today)).toEqual(new Date(2027, 9, 26));
    expect(nextOccurrence(11, 3, today)).toEqual(new Date(2026, 10, 3));
  });

  it('puts 29 February on the 28th in other years', () => {
    expect(nextOccurrence(2, 29, new Date(2027, 0, 1))).toEqual(new Date(2027, 1, 28));
    expect(nextOccurrence(2, 29, new Date(2027, 2, 1))).toEqual(new Date(2028, 1, 29));
  });

  it('lists birthdays of the living and remembrance days of the dead, with years', () => {
    const people = [
      person('a', { birth: { year: 1990, month: 11, day: 3 } }),
      person('b', { living: false, birth: { year: 1920, month: 11, day: 5 }, death: { year: 1990, month: 11, day: 10 } }),
      person('c', { birth: { year: 1980, month: 3, day: 1 } }),
      person('d', { birth: { year: 1985, month: 11 } }),
    ];
    const events = upcomingEvents(people, [], today, 30);
    expect(events.map((e) => [e.kind, e.personId, e.years])).toEqual([
      ['birthday', 'a', 36],
      ['remembrance', 'b', 36],
    ]);
  });

  it('shows days of published memories only', () => {
    const base = { body: 'x', authorUid: 'u', date: { year: 2000, month: 10, day: 30 } };
    const memories: Memory[] = [
      { id: 'm1', status: 'published', ...base },
      { id: 'm2', status: 'pending', ...base },
    ];
    expect(upcomingEvents([], memories, today, 10).map((e) => e.memoryId)).toEqual(['m1']);
  });

  it('lists wedding anniversaries of marriages still going, and life events newest first', () => {
    const people = [
      person('a', { birth: { year: 1960 } }),
      person('b', { birth: { year: 1962 } }),
      person('c', { living: false, death: { year: 2001, month: 2, day: 3 } }),
    ];
    const rel = (id: string, x: string, y: string, extra: Partial<Relationship> = {}): Relationship => ({
      id, type: 'spouse', personA: x, personB: y, createdBy: 'u', ...extra,
    });
    const rels = [
      rel('r1', 'a', 'b', { startDate: { year: 1985, month: 11, day: 8 } }),
      rel('r2', 'a', 'c', { startDate: { year: 1980, month: 11, day: 9 } }),
      rel('r3', 'b', 'a', { startDate: { year: 1970, month: 11, day: 10 }, endKind: 'divorce' }),
    ];
    const ann = upcomingEvents(people, [], today, 30, rels).filter((e) => e.kind === 'anniversary');
    expect(ann.map((e) => [e.personId, e.otherId, e.years])).toEqual([['a', 'b', 41]]);
    expect(lifeEvents(people, rels).map((e) => e.id)).toEqual([
      'death:c', 'marriage:r1', 'marriage:r2', 'marriage:r3', 'birth:b', 'birth:a',
    ]);
  });
});
