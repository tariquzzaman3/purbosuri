import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { useAuth } from '../auth';
import { db } from '../firebase';
import { buildGraph, type Graph } from '../data/graph';
import type { Person, Relationship, Role, TreeRef } from '../data/types';

interface TreeValue {
  /** True once the person's list of trees has loaded. */
  treesLoaded: boolean;
  trees: TreeRef[];
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

  const [trees, setTrees] = useState<TreeRef[]>([]);
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
        setTrees(snap.docs.map((d) => ({ id: d.id, name: String(d.data().name ?? '') })));
        setTreesLoaded(true);
      },
      () => {
        setError(true);
        setTreesLoaded(true);
      },
    );
  }, [uid]);

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
    [treesLoaded, trees, current, chooseTree, role, ready, error, people, rels, graph],
  );

  return <TreeContext.Provider value={value}>{children}</TreeContext.Provider>;
}

export function useTree(): TreeValue {
  const ctx = useContext(TreeContext);
  if (!ctx) throw new Error('useTree must be used inside TreeProvider');
  return ctx;
}
