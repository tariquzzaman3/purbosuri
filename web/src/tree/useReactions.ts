import { useEffect, useState } from 'react';
import { collection, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import type { ReactionType } from '../data/mutations';

export interface Comment {
  id: string;
  authorUid: string;
  authorName?: string;
  text: string;
  createdAt?: Date;
}

/** Everyone's reactions to one story: who reacted how. */
export function useReactions(treeId: string | undefined, memoryId: string, enabled: boolean): Record<string, ReactionType> {
  const [map, setMap] = useState<Record<string, ReactionType>>({});
  useEffect(() => {
    setMap({});
    if (!db || !treeId || !enabled) return;
    return onSnapshot(
      collection(db, 'trees', treeId, 'memories', memoryId, 'reactions'),
      (snap) => {
        const next: Record<string, ReactionType> = {};
        for (const d of snap.docs) next[d.id] = d.data().type as ReactionType;
        setMap(next);
      },
      () => setMap({}),
    );
  }, [treeId, memoryId, enabled]);
  return map;
}

export function useComments(treeId: string | undefined, memoryId: string, enabled: boolean): Comment[] {
  const [items, setItems] = useState<Comment[]>([]);
  useEffect(() => {
    setItems([]);
    if (!db || !treeId || !enabled) return;
    return onSnapshot(
      collection(db, 'trees', treeId, 'memories', memoryId, 'comments'),
      (snap) =>
        setItems(
          snap.docs
            .map((d) => ({
              ...(d.data() as Omit<Comment, 'id' | 'createdAt'>),
              id: d.id,
              createdAt: d.data().createdAt?.toDate?.() as Date | undefined,
            }))
            .sort((a, b) => (a.createdAt?.getTime() ?? Date.now()) - (b.createdAt?.getTime() ?? Date.now())),
        ),
      () => setItems([]),
    );
  }, [treeId, memoryId, enabled]);
  return items;
}
