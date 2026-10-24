import {
  collection,
  deleteField,
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

/** Creates a tree, its owner membership and the owner's private list entry together. */
export async function createTree(uid: string, displayName: string, name: string): Promise<string> {
  const d = database();
  const treeRef = doc(collection(d, 'trees'));
  const batch = writeBatch(d);
  batch.set(treeRef, { name: name.trim(), ownerUid: uid, createdAt: serverTimestamp() });
  batch.set(doc(d, 'trees', treeRef.id, 'members', uid), {
    role: 'owner',
    displayName: (displayName || 'Owner').slice(0, 100),
    joinedAt: serverTimestamp(),
  });
  batch.set(doc(d, 'users', uid, 'trees', treeRef.id), { name: name.trim(), addedAt: serverTimestamp() });
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
