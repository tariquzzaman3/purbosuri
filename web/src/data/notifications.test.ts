import { describe, expect, it } from 'vitest';
import { buildNotifications, type NotifInput } from './notifications';
import type { Memory, Person } from './types';

const now = new Date(2026, 10, 17);
const daysAgo = (n: number) => new Date(now.getTime() - n * 86400000);
const on = { memory: true, person: true, approved: true, social: true, remind: true, admin: true };

const base = (extra: Partial<NotifInput> = {}): NotifInput => ({
  uid: 'me',
  isAdmin: false,
  now,
  prefs: on,
  people: [],
  memories: [],
  myProposals: [],
  comments: [],
  reactionCounts: {},
  waiting: { proposals: 0, join: 0, memories: 0, reports: 0 },
  nameOf: (p) => p.id,
  ...extra,
});

const memory = (id: string, authorUid: string, createdAt: Date): Memory => ({ id, body: 'x', authorUid, status: 'published', createdAt });
const person = (id: string, createdBy: string, createdAt: Date): Person => ({ id, createdBy, createdAt });

describe('notifications', () => {
  it('tells about other people\'s new stories and additions, not my own or old ones', () => {
    const list = buildNotifications(
      base({
        memories: [memory('m1', 'other', daysAgo(1)), memory('m2', 'me', daysAgo(1)), memory('m3', 'other', daysAgo(30))],
        people: [person('p1', 'other', daysAgo(2)), person('p2', 'me', daysAgo(2))],
      }),
    );
    expect(list.map((n) => n.id)).toEqual(['memory:m1', 'person:p1']);
  });

  it('leaves out the kinds that are switched off', () => {
    const list = buildNotifications(
      base({ prefs: { ...on, memory: false }, memories: [memory('m1', 'other', daysAgo(1))], people: [person('p1', 'other', daysAgo(1))] }),
    );
    expect(list.map((n) => n.kind)).toEqual(['person']);
  });

  it('counts comments by others and reactions on my stories', () => {
    const list = buildNotifications(
      base({
        comments: [
          { id: 'c1', memoryId: 'm', authorUid: 'other', authorName: 'Rina', at: daysAgo(1) },
          { id: 'c2', memoryId: 'm', authorUid: 'me', at: daysAgo(1) },
        ],
        reactionCounts: { m: 3 },
      }),
    );
    expect(list.map((n) => n.code).sort()).toEqual(['comment', 'reaction']);
  });

  it('welcomes back after a long absence only', () => {
    expect(buildNotifications(base({ previousVisit: daysAgo(3) }))).toEqual([]);
    const away = buildNotifications(base({ previousVisit: daysAgo(40) }));
    expect(away.map((n) => [n.code, n.n])).toEqual([['remind', 40]]);
  });

  it('shows waiting work to admins only', () => {
    const waiting = { proposals: 2, join: 0, memories: 1, reports: 0 };
    expect(buildNotifications(base({ waiting }))).toEqual([]);
    const admin = buildNotifications(base({ isAdmin: true, waiting }));
    expect(admin.map((n) => n.code).sort()).toEqual(['adminMemories', 'adminProposals']);
  });
});
