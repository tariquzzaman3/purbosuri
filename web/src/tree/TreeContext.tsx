import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { collection, doc, onSnapshot, query, where } from 'firebase/firestore';
import { usePending, type PendingJoin } from './usePending';
import { freeSlot, giveSlot, removeFromMyList } from '../data/mutations';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { buildGraph, type Graph } from '../data/graph';
import type { JoinRequest, Person, Relationship, Role, TreeRef, TreeSettings } from '../data/types';

interface TreeValue {
  /** True once the person's list of trees has loaded. */
  treesLoaded: boolean;
  trees: TreeRef[];
  /** How many trees this person created (the limit applies to these). */
  ownedCount: number;
  /** The next free one of the person's five tree slots, or null when all five are used. */
  nextSlot: number | null;
  current: TreeRef | null;
  chooseTree: (id: string) => void;
  role: Role | null;
  /** True once the current tree's people and relationships have loaded. */
  ready: boolean;
  error: boolean;
  people: Person[];
  rels: Relationship[];
  graph: Graph;
  /** The current tree's switches (who may invite). */
  settings: TreeSettings;
  /** The person in the tree that I am, once an admin has linked me. */
  myPersonId: string | null;
  /** Whether I may create invitations in this tree. */
  canInvite: boolean;
  /** Join requests waiting for a decision (managers and admins only). */
  joinRequests: JoinRequest[];
  /** Trees I asked to join and have not entered yet. */
  pending: PendingJoin[];
  /** Owner, reviewer and contributor can add people. */
  canContribute: boolean;
  /** Owner and reviewer can edit and delete. */
  canEdit: boolean;
}

const TreeContext = createContext<TreeValue | null>(null);

const STORAGE_KEY = 'purbosuri.tree';

function readSavedTree(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

const EMPTY_GRAPH = buildGraph([], []);

export function TreeProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [index, setIndex] = useState<TreeRef[]>([]);
  // What each tree says about itself. 'gone' means it was deleted or I was removed from it.
  const [meta, setMeta] = useState<Record<string, { name: string; ownerUid: string; settings: TreeSettings } | 'gone'>>({});
  const [treesLoaded, setTreesLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(readSavedTree);

  const [role, setRole] = useState<Role | null>(null);
  const [myPersonId, setMyPersonId] = useState<string | null>(null);
  const [joinRequests, setJoinRequests] = useState<JoinRequest[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [rels, setRels] = useState<Relationship[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState(false);

  // The person's own list of trees.
  useEffect(() => {
    if (!db || !uid) return;
    setTreesLoaded(false);
    return onSnapshot(
      collection(db, 'users', uid, 'trees'),
      (snap) => {
        setIndex(
          snap.docs.map((d) => {
            const slot = d.data().slot;
            return { id: d.id, name: String(d.data().name ?? ''), slot: typeof slot === 'number' ? slot : undefined };
          }),
        );
        setTreesLoaded(true);
      },
      () => {
        setError(true);
        setTreesLoaded(true);
      },
    );
  }, [uid]);

  // Follow each tree's own name and creator, so a rename shows for everyone and a deleted
  // tree disappears from the list. A tree only counts as gone when the server itself says so:
  // while a new tree is still being saved, the server may not know it yet, so a "not found" or
  // "no permission" answer at that moment must never remove it from the person's list.
  const indexKey = index.map((x) => x.id).join(',');
  useEffect(() => {
    if (!db || !uid) return;
    const database = db;
    const timers: number[] = [];
    const stops: Array<() => void> = [];

    const markGone = (id: string) => {
      setMeta((m) => ({ ...m, [id]: 'gone' }));
      void removeFromMyList(uid, id, index.find((x) => x.id === id)?.slot).catch(() => undefined);
    };

    const watch = (ref: TreeRef, attempt: number) => {
      const stop = onSnapshot(
        doc(database, 'trees', ref.id),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setMeta((m) => ({
              ...m,
              [ref.id]: {
                name: String(d.name ?? ref.name),
                ownerUid: String(d.ownerUid ?? ''),
                settings: (d.settings ?? {}) as TreeSettings,
              },
            }));
          } else if (!snap.metadata.fromCache && !snap.metadata.hasPendingWrites) {
            markGone(ref.id);
          }
        },
        (err) => {
          if ((err as { code?: string }).code !== 'permission-denied') return;
          // Try again a little later; only a repeated refusal means I was removed.
          if (attempt >= 2) markGone(ref.id);
          else timers.push(window.setTimeout(() => stops.push(watch(ref, attempt + 1)), 4000 * (attempt + 1)));
        },
      );
      return stop;
    };

    index.forEach((ref) => stops.push(watch(ref, 0)));
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      stops.forEach((stop) => stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, indexKey]);

  const trees = useMemo<TreeRef[]>(
    () =>
      index
        .filter((ref) => meta[ref.id] !== 'gone')
        .map((ref) => {
          const m = meta[ref.id];
          return m && m !== 'gone'
            ? { id: ref.id, name: m.name, ownerUid: m.ownerUid, slot: ref.slot, settings: m.settings }
            : ref;
        }),
    [index, meta],
  );
  const ownedCount = trees.filter((x) => x.ownerUid === uid).length;
  const nextSlot = freeSlot(index.filter((x) => meta[x.id] !== 'gone'));

  // Entries made before the five slots existed get a slot, once.
  useEffect(() => {
    if (!db || !uid || !treesLoaded) return;
    const legacy = index.filter((x) => x.slot === undefined);
    if (legacy.length === 0) return;
    const taken = [...index];
    legacy.forEach((x) => {
      const n = freeSlot(taken);
      if (n === null) return;
      taken.push({ ...x, slot: n });
      void giveSlot(uid, x.id, n).catch(() => undefined);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, treesLoaded, indexKey]);

  const current = useMemo(
    () => trees.find((t) => t.id === currentId) ?? trees[0] ?? null,
    [trees, currentId],
  );
  const treeId = current?.id ?? null;

  const chooseTree = useCallback((id: string) => {
    setCurrentId(id);
    try {
      localStorage.setItem(STORAGE_KEY, id);
    } catch {
      // Ignore: the choice just will not be remembered.
    }
  }, []);

  // The current tree: my role, its people and its relationships.
  useEffect(() => {
    setRole(null);
    setPeople([]);
    setRels([]);
    setReady(false);
    setError(false);
    if (!db || !uid || !treeId) return;

    let roleLoaded = false;
    let peopleLoaded = false;
    let relsLoaded = false;
    const check = () => setReady(roleLoaded && peopleLoaded && relsLoaded);
    const fail = () => {
      setError(true);
      setReady(true);
    };

    const stops = [
      onSnapshot(
        doc(db, 'trees', treeId, 'members', uid),
        (snap) => {
          setRole(snap.exists() ? (snap.data().role as Role) : null);
          setMyPersonId(snap.exists() && typeof snap.data().personId === 'string' ? snap.data().personId : null);
          roleLoaded = true;
          check();
        },
        fail,
      ),
      onSnapshot(
        collection(db, 'trees', treeId, 'people'),
        (snap) => {
          setPeople(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Person, 'id'>) })));
          peopleLoaded = true;
          check();
        },
        fail,
      ),
      onSnapshot(
        collection(db, 'trees', treeId, 'relationships'),
        (snap) => {
          setRels(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<Relationship, 'id'>) })));
          relsLoaded = true;
          check();
        },
        fail,
      ),
    ];
    return () => stops.forEach((stop) => stop());
  }, [uid, treeId]);

  const graph = useMemo(() => (people.length ? buildGraph(people, rels) : EMPTY_GRAPH), [people, rels]);

  const settings = useMemo<TreeSettings>(() => current?.settings ?? {}, [current]);
  const canEdit = role === 'owner' || role === 'reviewer';
  const canInvite =
    role === 'owner' ||
    (role === 'reviewer' && settings.adminsCanInvite !== false) ||
    (role === 'contributor' && settings.participantsCanInvite === true);

  // Requests to join this tree that are waiting for a decision (managers and admins only).
  useEffect(() => {
    setJoinRequests([]);
    if (!db || !treeId || !canEdit) return;
    return onSnapshot(
      query(collection(db, 'trees', treeId, 'joinRequests'), where('status', '==', 'pending')),
      (snap) =>
        setJoinRequests(
          snap.docs.map((d) => ({ ...(d.data() as Omit<JoinRequest, 'uid'>), uid: d.id })),
        ),
      () => setJoinRequests([]),
    );
  }, [treeId, canEdit]);

  const pending = usePending(uid, nextSlot);

  const value = useMemo<TreeValue>(
    () => ({
      treesLoaded,
      trees,
      ownedCount,
      nextSlot,
      current,
      chooseTree,
      role,
      ready,
      error,
      people,
      rels,
      graph,
      settings,
      myPersonId,
      canInvite,
      joinRequests,
      pending,
      canContribute: role === 'owner' || role === 'reviewer' || role === 'contributor',
      canEdit,
    }),
    [
      treesLoaded,
      trees,
      ownedCount,
      nextSlot,
      current,
      chooseTree,
      role,
      ready,
      error,
      people,
      rels,
      graph,
      settings,
      myPersonId,
      canInvite,
      joinRequests,
      pending,
      canEdit,
    ],
  );

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}

export function useTree(): TreeValue {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('useTree must be used inside TreeProvider');
  return ctx;
}
