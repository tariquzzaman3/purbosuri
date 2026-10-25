import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { collection, deleteDoc, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { buildGraph, type Graph } from '../data/graph';
import type { Person, Relationship, Role, TreeRef } from '../data/types';

interface TreeValue {
  /** True once the person's list of trees has loaded. */
  treesLoaded: boolean;
  trees: TreeRef[];
  /** How many trees this person created (the limit applies to these). */
  ownedCount: number;
  current: TreeRef | null;
  chooseTree: (id: string) => void;
  role: Role | null;
  /** True once the current tree's people and relationships have loaded. */
  ready: boolean;
  error: boolean;
  people: Person[];
  rels: Relationship[];
  graph: Graph;
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
  const [meta, setMeta] = useState<Record<string, { name: string; ownerUid: string } | 'gone'>>({});
  const [treesLoaded, setTreesLoaded] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(readSavedTree);

  const [role, setRole] = useState<Role | null>(null);
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
        setIndex(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') })));
        setTreesLoaded(true);
      },
      () => {
        setError(true);
        setTreesLoaded(true);
      },
    );
  }, [uid]);

  // Follow each tree's own name and creator, so a rename shows for everyone and a deleted
  // tree disappears from the list.
  const indexKey = index.map((x) => x.id).join(',');
  useEffect(() => {
    if (!db || !uid) return;
    const stops = index.map((ref) =>
      onSnapshot(
        doc(db!, 'trees', ref.id),
        (snap) => {
          if (snap.exists()) {
            const d = snap.data();
            setMeta((m) => ({ ...m, [ref.id]: { name: String(d.name ?? ref.name), ownerUid: String(d.ownerUid ?? '') } }));
          } else {
            setMeta((m) => ({ ...m, [ref.id]: 'gone' }));
            void deleteDoc(doc(db!, 'users', uid, 'trees', ref.id)).catch(() => undefined);
          }
        },
        (err) => {
          if ((err as { code?: string }).code === 'permission-denied') {
            setMeta((m) => ({ ...m, [ref.id]: 'gone' }));
            void deleteDoc(doc(db!, 'users', uid, 'trees', ref.id)).catch(() => undefined);
          }
        },
      ),
    );
    return () => stops.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, indexKey]);

  const trees = useMemo<TreeRef[]>(
    () =>
      index
        .filter((ref) => meta[ref.id] !== 'gone')
        .map((ref) => {
          const m = meta[ref.id];
          return m && m !== 'gone' ? { id: ref.id, name: m.name, ownerUid: m.ownerUid } : ref;
        }),
    [index, meta],
  );
  const ownedCount = trees.filter((x) => x.ownerUid === uid).length;

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

  const value = useMemo<TreeValue>(
    () => ({
      treesLoaded,
      trees,
      ownedCount,
      current,
      chooseTree,
      role,
      ready,
      error,
      people,
      rels,
      graph,
      canContribute: role === 'owner' || role === 'reviewer' || role === 'contributor',
      canEdit: role === 'owner' || role === 'reviewer',
    }),
    [treesLoaded, trees, ownedCount, current, chooseTree, role, ready, error, people, rels, graph],
  );

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}

export function useTree(): TreeValue {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('useTree must be used inside TreeProvider');
  return ctx;
}
