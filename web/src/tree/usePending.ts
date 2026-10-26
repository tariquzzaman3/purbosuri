import { useEffect, useRef, useState } from 'react';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';
import { claimTree } from '../data/mutations';

export interface PendingJoin {
  treeId: string;
  treeName: string;
  /** waiting: admins have not decided. full: approved, but all five tree places are used. rejected: not approved. */
  status: 'waiting' | 'full' | 'rejected';
}

type Decision = 'pending' | 'approved' | 'rejected' | 'missing';

/**
 * The trees this person has asked to join. When an admin approves one, it is put in the
 * person's own list here (taking a free place), so it simply shows up in "Family trees".
 */
export function usePending(uid: string | null, nextSlot: number | null): PendingJoin[] {
  const [notes, setNotes] = useState<Array<{ treeId: string; treeName: string }>>([]);
  const [decision, setDecision] = useState<Record<string, Decision>>({});
  const claiming = useRef(false);

  useEffect(() => {
    if (!db || !uid) return;
    return onSnapshot(
      collection(db, 'users', uid, 'pending'),
      (snap) => setNotes(snap.docs.map((d) => ({ treeId: d.id, treeName: String(d.data().treeName ?? '') }))),
      () => setNotes([]),
    );
  }, [uid]);

  const key = notes.map((n) => n.treeId).join(',');
  useEffect(() => {
    if (!db || !uid) return;
    const stops = notes.map((n) =>
      onSnapshot(
        doc(db!, 'trees', n.treeId, 'joinRequests', uid),
        (snap) =>
          setDecision((m) => ({
            ...m,
            [n.treeId]: snap.exists() ? (snap.data().status as Decision) : 'missing',
          })),
        () => undefined,
      ),
    );
    return () => stops.forEach((stop) => stop());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid, key]);

  // Approved and there is a free place: add it to my list.
  useEffect(() => {
    if (!uid || nextSlot === null || claiming.current) return;
    const ready = notes.find((n) => decision[n.treeId] === 'approved');
    if (!ready) return;
    claiming.current = true;
    void claimTree(uid, ready.treeId, ready.treeName, nextSlot)
      .catch(() => undefined)
      .finally(() => {
        claiming.current = false;
      });
  }, [uid, nextSlot, notes, decision]);

  return notes.map((n) => {
    const d = decision[n.treeId] ?? 'pending';
    const status: PendingJoin['status'] =
      d === 'approved' ? 'full' : d === 'rejected' || d === 'missing' ? 'rejected' : 'waiting';
    return { ...n, status };
  });
}
