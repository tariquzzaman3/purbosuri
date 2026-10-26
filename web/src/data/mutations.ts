import {
  collection,
  deleteField,
  getDocs,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { PersonFields, RelKind, RelStatus, RelType, Relationship } from './types';

function database(): Firestore {
  if (!db) throw new Error('not-configured');
  return db;
}

/** Firestore rejects undefined and empty values, so only real values are sent. */
function clean<T extends Record<string, unknown>>(fields: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(fields)) {
    if (value === undefined || value === null) continue;
    if (typeof value === 'string' && value.trim() === '') continue;
    if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value as object).length === 0) continue;
    out[key] = typeof value === 'string' ? value.trim() : value;
  }
  return out;
}

const PERSON_KEYS: Array<keyof PersonFields> = [
  'nameBn',
  'nameEn',
  'nickname',
  'birth',
  'birthOrder',
  'death',
  'birthPlace',
  'residence',
  'deathPlace',
  'occupation',
  'bio',
  'living',
  'verification',
];

export interface NewRelationship {
  type: RelType;
  personA: string;
  personB: string;
  kind?: RelKind;
  status?: RelStatus;
}

function relationshipData(uid: string, rel: NewRelationship) {
  return {
    ...clean({ ...rel }),
    createdBy: uid,
    createdAt: serverTimestamp(),
  };
}

/** One person can belong to at most this many trees, created or joined. */
export const MAX_TREES = 5;

/** The lowest numbered slot (1 to 5) that no tree in the person's list uses, or null if all are full. */
export function freeSlot(trees: Array<{ slot?: number }>): number | null {
  const used = new Set(trees.map((t) => t.slot));
  for (let n = 1; n <= MAX_TREES; n++) if (!used.has(n)) return n;
  return null;
}

/** Takes a slot for a tree in the person's own list. Used when joining and for older entries. */
export async function addToMyList(uid: string, treeId: string, name: string, slot: number): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.set(doc(d, 'users', uid, 'slots', String(slot)), { treeId });
  batch.set(doc(d, 'users', uid, 'trees', treeId), { name, addedAt: serverTimestamp(), slot });
  await batch.commit();
}

/** Gives an older list entry (made before slots existed) its slot. */
export async function giveSlot(uid: string, treeId: string, slot: number): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.set(doc(d, 'users', uid, 'slots', String(slot)), { treeId });
  batch.update(doc(d, 'users', uid, 'trees', treeId), { slot });
  await batch.commit();
}

/** Takes a tree out of the person's own list and frees its slot. */
export async function removeFromMyList(uid: string, treeId: string, slot?: number): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.delete(doc(d, 'users', uid, 'trees', treeId));
  if (slot) batch.delete(doc(d, 'users', uid, 'slots', String(slot)));
  await batch.commit();
}

export type MemberRole = 'owner' | 'reviewer' | 'contributor' | 'viewer';

/** Manager or admin: make someone an admin or a participant. */
export async function setMemberRole(treeId: string, memberUid: string, role: 'reviewer' | 'contributor'): Promise<void> {
  await updateDoc(doc(database(), 'trees', treeId, 'members', memberUid), { role });
}

/** An admin steps down to participant. */
export async function stepDown(treeId: string, uid: string): Promise<void> {
  await updateDoc(doc(database(), 'trees', treeId, 'members', uid), { role: 'contributor' });
}

/** Manager or admin: take someone out of the tree. */
export async function removeMember(treeId: string, memberUid: string): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.delete(doc(d, 'trees', treeId, 'members', memberUid));
  await batch.commit();
}

/** The manager hands the tree to another member and becomes an admin or a participant. */
export async function transferManager(
  treeId: string,
  fromUid: string,
  toUid: string,
  myNewRole: 'reviewer' | 'contributor',
): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.update(doc(d, 'trees', treeId, 'members', toUid), { role: 'owner' });
  batch.update(doc(d, 'trees', treeId, 'members', fromUid), { role: myNewRole });
  batch.update(doc(d, 'trees', treeId), { ownerUid: toUid });
  await batch.commit();
}

/** Renames a tree (the admin only; the rules check this). */
export async function renameTree(treeId: string, name: string): Promise<void> {
  const d = database();
  await updateDoc(doc(d, 'trees', treeId), { name: name.trim() });
}

/**
 * Deletes a tree the person created: every person and relationship, then the tree itself,
 * then the person's own list entry. (Other members' list entries clean themselves up.)
 */
export async function deleteTree(treeId: string, uid: string, slot?: number): Promise<void> {
  const d = database();
  for (const part of ['relationships', 'people'] as const) {
    const snap = await getDocs(collection(d, 'trees', treeId, part));
    for (let i = 0; i < snap.docs.length; i += 400) {
      const batch = writeBatch(d);
      snap.docs.slice(i, i + 400).forEach((x) => batch.delete(x.ref));
      await batch.commit();
    }
  }
  const last = writeBatch(d);
  last.delete(doc(d, 'trees', treeId));
  last.delete(doc(d, 'users', uid, 'trees', treeId));
  if (slot) last.delete(doc(d, 'users', uid, 'slots', String(slot)));
  await last.commit();
}

/** Creates a tree, its owner membership and the owner's private list entry together. */
export async function createTree(uid: string, displayName: string, name: string, slot: number): Promise<string> {
  const d = database();
  const treeRef = doc(collection(d, 'trees'));
  const batch = writeBatch(d);
  batch.set(treeRef, { name: name.trim(), ownerUid: uid, createdAt: serverTimestamp() });
  batch.set(doc(d, 'trees', treeRef.id, 'members', uid), {
    role: 'owner',
    displayName: (displayName || 'Owner').slice(0, 100),
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(d, 'users', uid, 'slots', String(slot)), { treeId: treeRef.id });
  batch.set(doc(d, 'users', uid, 'trees', treeRef.id), { name: name.trim(), addedAt: serverTimestamp(), slot });
  await batch.commit();
  return treeRef.id;
}

/** Adds a person, and optionally their relationship to someone already in the tree, in one step. */
export async function addPerson(
  treeId: string,
  uid: string,
  fields: PersonFields,
  relation?: { existingId: string; as: 'parent' | 'child' | 'spouse'; kind?: RelKind },
): Promise<string> {
  const d = database();
  const personRef = doc(collection(d, 'trees', treeId, 'people'));
  const batch = writeBatch(d);
  batch.set(personRef, { ...clean({ ...fields }), createdBy: uid, createdAt: serverTimestamp() });

  if (relation) {
    const relRef = doc(collection(d, 'trees', treeId, 'relationships'));
    const rel: NewRelationship =
      relation.as === 'parent'
        ? { type: 'parent', personA: personRef.id, personB: relation.existingId, kind: relation.kind }
        : relation.as === 'child'
          ? { type: 'parent', personA: relation.existingId, personB: personRef.id, kind: relation.kind }
          : { type: 'spouse', personA: relation.existingId, personB: personRef.id };
    batch.set(relRef, relationshipData(uid, rel));
  }

  await batch.commit();
  return personRef.id;
}

/** Saves an edit. A field the person cleared is removed instead of left behind. */
export async function updatePerson(treeId: string, personId: string, fields: PersonFields): Promise<void> {
  const d = database();
  const cleaned = clean({ ...fields });
  const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
  for (const key of PERSON_KEYS) patch[key] = key in cleaned ? cleaned[key] : deleteField();
  await updateDoc(doc(d, 'trees', treeId, 'people', personId), patch);
}

/** Deletes a person together with every relationship that mentions them. */
export async function deletePerson(treeId: string, personId: string, rels: Relationship[]): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.delete(doc(d, 'trees', treeId, 'people', personId));
  for (const r of rels) {
    if (r.personA === personId || r.personB === personId) {
      batch.delete(doc(d, 'trees', treeId, 'relationships', r.id));
    }
  }
  await batch.commit();
}

export async function addRelationship(treeId: string, uid: string, rel: NewRelationship): Promise<void> {
  const d = database();
  const ref: DocumentReference = doc(collection(d, 'trees', treeId, 'relationships'));
  const batch = writeBatch(d);
  batch.set(ref, relationshipData(uid, rel));
  await batch.commit();
}

export async function removeRelationship(treeId: string, relId: string): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.delete(doc(d, 'trees', treeId, 'relationships', relId));
  await batch.commit();
}
