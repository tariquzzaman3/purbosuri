import type { NotifKind, NotifPrefs } from '../settings';
import type { Memory, Person } from './types';
import type { Proposal } from './mutations';

/** What happened. The text for each is chosen by `code`. */
export type NotifCode =
  | 'memory'
  | 'person'
  | 'approved'
  | 'rejected'
  | 'comment'
  | 'reaction'
  | 'remind'
  | 'adminProposals'
  | 'adminJoin'
  | 'adminMemories'
  | 'adminReports';

export interface Notif {
  /** Stable: the same event always has the same id, so "seen" can be remembered. */
  id: string;
  kind: NotifKind;
  code: NotifCode;
  at: Date;
  /** A person's name, or a title, or a count, depending on the code. */
  name?: string;
  n?: number;
  /** Where tapping it goes. */
  to: string;
}

export interface NotifInput {
  uid: string;
  isAdmin: boolean;
  now: Date;
  prefs: NotifPrefs;
  people: Person[];
  /** Published stories. */
  memories: Memory[];
  /** My own suggestions, whatever their status. */
  myProposals: Proposal[];
  /** Comments on my stories, with the story they belong to. */
  comments: Array<{ id: string; memoryId: string; authorUid: string; authorName?: string; at?: Date }>;
  /** Number of reactions on each of my stories. */
  reactionCounts: Record<string, number>;
  /** Waiting for an admin's decision. */
  waiting: { proposals: number; join: number; memories: number; reports: number };
  /** The last time the person opened the app before this visit. */
  previousVisit?: Date;
  /** Shown name of a person, or of a proposal's target. */
  nameOf: (p: Person) => string;
}

const DAY = 24 * 60 * 60 * 1000;
/** News older than this is not announced. */
export const NEWS_DAYS = 14;
/** Away for this long counts as "a long time". */
export const LONG_ABSENCE_DAYS = 14;

/** Everything worth telling the person, newest first, leaving out the kinds they switched off. */
export function buildNotifications(i: NotifInput): Notif[] {
  const out: Notif[] = [];
  const fresh = (d?: Date) => !!d && i.now.getTime() - d.getTime() <= NEWS_DAYS * DAY;
  const on = (k: NotifKind) => i.prefs[k];

  if (on('memory')) {
    for (const m of i.memories) {
      if (m.authorUid === i.uid || !fresh(m.createdAt) || !m.createdAt) continue;
      out.push({
        id: `memory:${m.id}`,
        kind: 'memory',
        code: 'memory',
        at: m.createdAt,
        name: m.authorName,
        to: '/home/memories',
      });
    }
  }

  if (on('person')) {
    for (const p of i.people) {
      if (p.createdBy === i.uid || !fresh(p.createdAt) || !p.createdAt) continue;
      out.push({ id: `person:${p.id}`, kind: 'person', code: 'person', at: p.createdAt, name: i.nameOf(p), to: `/home/person/${p.id}` });
    }
  }

  if (on('approved')) {
    for (const p of i.myProposals) {
      if ((p.status !== 'approved' && p.status !== 'rejected') || !p.createdAt || !fresh(p.createdAt)) continue;
      out.push({
        id: `${p.status}:${p.id}`,
        kind: 'approved',
        code: p.status === 'approved' ? 'approved' : 'rejected',
        at: p.createdAt,
        name: p.targetName,
        to: '/home/approvals',
      });
    }
  }

  if (on('social')) {
    for (const c of i.comments) {
      if (c.authorUid === i.uid || !c.at || !fresh(c.at)) continue;
      out.push({ id: `comment:${c.memoryId}:${c.id}`, kind: 'social', code: 'comment', at: c.at, name: c.authorName, to: '/home/memories' });
    }
    for (const [memoryId, n] of Object.entries(i.reactionCounts)) {
      if (n > 0) {
        out.push({ id: `reaction:${memoryId}:${n}`, kind: 'social', code: 'reaction', at: i.now, n, to: '/home/memories' });
      }
    }
  }

  if (on('remind') && i.previousVisit && i.now.getTime() - i.previousVisit.getTime() >= LONG_ABSENCE_DAYS * DAY) {
    const days = Math.floor((i.now.getTime() - i.previousVisit.getTime()) / DAY);
    out.push({ id: `remind:${i.previousVisit.getTime()}`, kind: 'remind', code: 'remind', at: i.now, n: days, to: '/home/memories' });
  }

  if (on('admin') && i.isAdmin) {
    const w = i.waiting;
    const add = (code: NotifCode, n: number, to: string) => {
      if (n > 0) out.push({ id: `${code}:${n}`, kind: 'admin', code, at: i.now, n, to });
    };
    add('adminProposals', w.proposals, '/home/approvals');
    add('adminJoin', w.join, '/home/requests');
    add('adminMemories', w.memories, '/home/memories');
    add('adminReports', w.reports, '/home/report');
  }

  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}
