import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { useI18n } from '../i18n';
import { useSettings } from '../settings';
import { buildNotifications, type NotifInput, type Notif } from '../data/notifications';
import { personName } from '../data/format';
import { useTree } from './TreeContext';
import { useMemories } from './useMemories';
import { useReports } from './ReportsPage';

interface NotifValue {
  items: Notif[];
  unread: number;
  isUnread: (id: string) => boolean;
  markAllSeen: () => void;
}

const Ctx = createContext<NotifValue | null>(null);
const MAX_SEEN = 400;
const MY_STORIES = 20;

const readJson = <T,>(key: string, fallback: T): T => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
};
const writeJson = (key: string, value: unknown) => {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Not remembered: everything just shows as new again.
  }
};

/** Comments and reactions other people left on my own stories. */
function useActivityOnMine(treeId: string | undefined, mine: Array<{ id: string }>) {
  const [comments, setComments] = useState<NotifInput['comments']>([]);
  const [reactionCounts, setReactionCounts] = useState<Record<string, number>>({});
  const key = mine.map((m) => m.id).join(',');

  useEffect(() => {
    setComments([]);
    setReactionCounts({});
    if (!db || !treeId || !key) return;
    const database = db;
    const stops: Array<() => void> = [];
    for (const id of key.split(',')) {
      stops.push(
        onSnapshot(
          collection(database, 'trees', treeId, 'memories', id, 'comments'),
          (snap) => {
            const here = snap.docs.map((d) => ({
              id: d.id,
              memoryId: id,
              authorUid: String(d.data().authorUid ?? ''),
              authorName: d.data().authorName as string | undefined,
              at: d.data().createdAt?.toDate?.() as Date | undefined,
            }));
            setComments((all) => [...all.filter((c) => c.memoryId !== id), ...here]);
          },
          () => undefined,
        ),
        onSnapshot(
          collection(database, 'trees', treeId, 'memories', id, 'reactions'),
          (snap) => setReactionCounts((all) => ({ ...all, [id]: snap.size })),
          () => undefined,
        ),
      );
    }
    return () => stops.forEach((s) => s());
  }, [treeId, key]);

  return { comments, reactionCounts };
}

export function NotificationsProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { lang, t } = useI18n();
  const { notify } = useSettings();
  const { current, role, canEdit, people, proposals, joinRequests } = useTree();
  const uid = user?.uid ?? '';
  const treeId = current?.id;
  const { published, waiting } = useMemories(treeId, uid || undefined, canEdit);
  const reports = useReports(canEdit ? treeId : undefined, uid || undefined, true);
  const mine = useMemo(() => published.filter((m) => m.authorUid === uid).slice(0, MY_STORIES), [published, uid]);
  const { comments, reactionCounts } = useActivityOnMine(treeId, mine);

  // When the person was last here, before this visit. Remembered per account on this device.
  const visitKey = `purbosuri.lastVisit.${uid}`;
  const [previousVisit] = useState<Date | undefined>(() => {
    const ms = readJson<number | null>(visitKey, null);
    return typeof ms === 'number' ? new Date(ms) : undefined;
  });
  useEffect(() => {
    if (uid) writeJson(visitKey, Date.now());
  }, [uid, visitKey]);

  const seenKey = `purbosuri.notifSeen.${uid}.${treeId ?? ''}`;
  const [seen, setSeen] = useState<string[]>(() => readJson<string[]>(seenKey, []));
  useEffect(() => setSeen(readJson<string[]>(seenKey, [])), [seenKey]);

  const items = useMemo(
    () =>
      !uid || !role
        ? []
        : buildNotifications({
            uid,
            isAdmin: canEdit,
            now: new Date(),
            prefs: notify,
            people,
            memories: published,
            myProposals: canEdit ? [] : proposals,
            comments,
            reactionCounts,
            waiting: {
              proposals: proposals.length,
              join: joinRequests.length,
              memories: waiting.length,
              reports: reports.filter((r) => r.status === 'open').length,
            },
            previousVisit,
            nameOf: (p) => personName(p, lang, t('unknownName')),
          }),
    [uid, role, canEdit, notify, people, published, proposals, comments, reactionCounts, joinRequests, waiting, reports, previousVisit, lang, t],
  );

  const seenSet = useMemo(() => new Set(seen), [seen]);
  const unread = items.filter((n) => !seenSet.has(n.id)).length;
  const latest = useRef(items);
  latest.current = items;

  const markAllSeen = useCallback(() => {
    setSeen((old) => {
      const next = [...new Set([...old, ...latest.current.map((n) => n.id)])].slice(-MAX_SEEN);
      writeJson(seenKey, next);
      return next;
    });
  }, [seenKey]);

  const value = useMemo<NotifValue>(
    () => ({ items, unread, isUnread: (id) => !seenSet.has(id), markAllSeen }),
    [items, unread, seenSet, markAllSeen],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useNotifications(): NotifValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useNotifications must be used inside NotificationsProvider');
  return v;
}
