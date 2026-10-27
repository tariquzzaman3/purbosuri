import { useEffect, useState } from 'react';
import { collection, onSnapshot, query, where, type DocumentData, type QueryDocumentSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { Memory } from '../data/types';

const toMemory = (d: QueryDocumentSnapshot<DocumentData>): Memory => ({
  ...(d.data() as Omit<Memory, 'id' | 'createdAt'>),
  id: d.id,
  createdAt: d.data().createdAt?.toDate?.() as Date | undefined,
});

const newest = (a: Memory, b: Memory) => (b.createdAt?.getTime() ?? Date.now()) - (a.createdAt?.getTime() ?? Date.now());

/**
 * Published stories (everyone in the tree) and the ones still waiting: for admins all of them,
 * for a participant only their own.
 */
export function useMemories(
  treeId: string | undefined,
  uid: string | undefined,
  isAdmin: boolean,
): { published: Memory[]; waiting: Memory[] } {
  const [published, setPublished] = useState<Memory[]>([]);
  const [waiting, setWaiting] = useState<Memory[]>([]);

  useEffect(() => {
    setPublished([]);
    if (!db || !treeId) return;
    return onSnapshot(
      query(collection(db, 'trees', treeId, 'memories'), where('status', '==', 'published')),
      (snap) => setPublished(snap.docs.map(toMemory).sort(newest)),
      () => setPublished([]),
    );
  }, [treeId]);

  useEffect(() => {
    setWaiting([]);
    if (!db || !treeId || !uid) return;
    const col = collection(db, 'trees', treeId, 'memories');
    const q = isAdmin ? query(col, where('status', '==', 'pending')) : query(col, where('authorUid', '==', uid));
    return onSnapshot(
      q,
      (snap) => setWaiting(snap.docs.map(toMemory).filter((m) => m.status === 'pending').sort(newest)),
      () => setWaiting([]),
    );
  }, [treeId, uid, isAdmin]);

  return { published, waiting };
}
