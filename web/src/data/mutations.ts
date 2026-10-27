import {
  Timestamp,
  collection,
  deleteField,
  getDocs,
  setDoc,
  doc,
  serverTimestamp,
  updateDoc,
  writeBatch,
  type DocumentReference,
  type Firestore,
} from 'firebase/firestore';
import { db } from '../firebase';
import type { Contact, JoinRequest, Person, PersonFields, RelKind, RelStatus, RelType, Relationship, TreeSettings } from './types';

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

// ---------- invitations and joining ----------

const DEFAULT_INVITE_DAYS = 7;

/** Makes an invitation and returns its code. The link is built from the tree id and this code. */
export async function createInvite(
  treeId: string,
  uid: string,
  treeName: string,
  role: 'reviewer' | 'contributor',
  days: number = DEFAULT_INVITE_DAYS,
): Promise<string> {
  const d = database();
  const ref = doc(collection(d, 'trees', treeId, 'invites'));
  await setDoc(ref, {
    role,
    treeName,
    createdBy: uid,
    createdAt: serverTimestamp(),
    expiresAt: Timestamp.fromMillis(Date.now() + days * 24 * 3600 * 1000),
  });
  return ref.id;
}

export async function revokeInvite(treeId: string, code: string): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.delete(doc(d, 'trees', treeId, 'invites', code));
  await batch.commit();
}

export interface JoinForm {
  displayName: string;
  fatherName?: string;
  motherName?: string;
  contactOf: 'self' | 'father' | 'mother' | 'other';
  contact: Contact;
}

/** A newcomer asks to join: the request, the use of the invitation and a waiting note, in one batch. */
export async function submitJoin(
  treeId: string,
  uid: string,
  code: string,
  invite: { role: 'reviewer' | 'contributor'; treeName: string },
  form: JoinForm,
): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.set(doc(d, 'trees', treeId, 'joinRequests', uid), {
    ...clean({
      displayName: form.displayName,
      fatherName: form.fatherName,
      motherName: form.motherName,
      contactOf: form.contactOf,
      contact: clean({ ...form.contact }),
    }),
    inviteCode: code,
    role: invite.role,
    status: 'pending',
    createdAt: serverTimestamp(),
  });
  batch.update(doc(d, 'trees', treeId, 'invites', code), { usedBy: uid, usedAt: serverTimestamp() });
  batch.set(doc(d, 'users', uid, 'pending', treeId), { treeName: invite.treeName, requestedAt: serverTimestamp() });
  await batch.commit();
}

export type ApprovePlan =
  | { kind: 'link'; personId: string }
  | {
      kind: 'new';
      nameBn?: string;
      nameEn?: string;
      /** Who the new person is connected to. Required unless the tree is still empty. */
      relation?: { existingId: string; as: 'parent' | 'child' | 'spouse' };
    };

/**
 * An admin approves a join request: the newcomer is linked to a person already in the tree, or
 * added as a new person connected to someone (so no outsider ends up floating in the tree), and
 * becomes a member. Their contact details go where only admins can read them.
 */
export async function approveJoin(treeId: string, adminUid: string, req: JoinRequest, plan: ApprovePlan): Promise<string> {
  const d = database();
  const batch = writeBatch(d);
  let personId: string;

  if (plan.kind === 'link') {
    personId = plan.personId;
  } else {
    const personRef = doc(collection(d, 'trees', treeId, 'people'));
    personId = personRef.id;
    batch.set(personRef, {
      ...clean({ nameBn: plan.nameBn, nameEn: plan.nameEn }),
      createdBy: adminUid,
      createdAt: serverTimestamp(),
    });
    if (plan.relation) {
      const relRef = doc(collection(d, 'trees', treeId, 'relationships'));
      const { existingId, as } = plan.relation;
      const rel: NewRelationship =
        as === 'parent'
          ? { type: 'parent', personA: personId, personB: existingId }
          : as === 'child'
            ? { type: 'parent', personA: existingId, personB: personId }
            : { type: 'spouse', personA: existingId, personB: personId };
      batch.set(relRef, relationshipData(adminUid, rel));
    }
  }

  const contact = clean({
    ...(req.contact ?? {}),
    contactOf: req.contactOf,
    fatherName: req.fatherName,
    motherName: req.motherName,
  });
  if (Object.keys(contact).length > 0) {
    batch.set(doc(d, 'trees', treeId, 'people', personId, 'private', 'contact'), contact, { merge: true });
  }

  batch.set(doc(d, 'trees', treeId, 'members', req.uid), {
    role: req.role,
    displayName: req.displayName.slice(0, 100),
    joinedAt: serverTimestamp(),
    personId,
  });
  batch.update(doc(d, 'trees', treeId, 'joinRequests', req.uid), {
    status: 'approved',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    personId,
  });
  await batch.commit();
  return personId;
}

export async function rejectJoin(treeId: string, adminUid: string, uid: string): Promise<void> {
  await updateDoc(doc(database(), 'trees', treeId, 'joinRequests', uid), {
    status: 'rejected',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  });
}

/** After approval: put the tree in the newcomer's own list and clear the waiting note. */
export async function claimTree(uid: string, treeId: string, name: string, slot: number): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.set(doc(d, 'users', uid, 'slots', String(slot)), { treeId });
  batch.set(doc(d, 'users', uid, 'trees', treeId), { name, addedAt: serverTimestamp(), slot });
  batch.delete(doc(d, 'users', uid, 'pending', treeId));
  await batch.commit();
}

/** Remove a waiting note, and the request itself when it was not approved. */
export async function dismissPending(uid: string, treeId: string): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  batch.delete(doc(d, 'users', uid, 'pending', treeId));
  batch.delete(doc(d, 'trees', treeId, 'joinRequests', uid));
  await batch.commit();
}

export async function saveTreeSettings(treeId: string, settings: TreeSettings): Promise<void> {
  await updateDoc(doc(database(), 'trees', treeId), { settings });
}

/** A member shows (or, with an empty object, hides) their own contact details to everyone in the tree. */
export async function savePublicContact(treeId: string, personId: string, contact: Contact): Promise<void> {
  const cleaned = clean({ ...contact });
  await updateDoc(doc(database(), 'trees', treeId, 'people', personId), {
    publicContact: Object.keys(cleaned).length > 0 ? cleaned : deleteField(),
    updatedAt: serverTimestamp(),
  });
}

// ---------- suggestions from participants, and their approval ----------

export type ProposalKind = 'addPerson' | 'editPerson' | 'deletePerson' | 'addRelation' | 'removeRelation';

export interface Report {
  id: string;
  text: string;
  category: 'problem' | 'contact';
  reporterUid: string;
  reporterName?: string;
  status: 'open' | 'seen' | 'solved';
  reply?: string;
  createdAt?: Date;
}

/** A message to the tree's admin team (managers and admins). Replies never name an admin. */
export async function submitReport(
  treeId: string,
  uid: string,
  name: string,
  category: Report['category'],
  text: string,
): Promise<void> {
  const d = database();
  await setDoc(doc(collection(d, 'trees', treeId, 'reports')), {
    text: text.trim().slice(0, 5000),
    category,
    reporterUid: uid,
    reporterName: (name || 'Member').slice(0, 100),
    status: 'open',
    createdAt: serverTimestamp(),
  });
}

export async function answerReport(
  treeId: string,
  reportId: string,
  status: Report['status'],
  reply: string,
): Promise<void> {
  const d = database();
  await updateDoc(doc(d, 'trees', treeId, 'reports', reportId), {
    status,
    reply: reply.trim().slice(0, 2000),
    updatedAt: serverTimestamp(),
  });
}

export interface Proposal {
  id: string;
  kind: ProposalKind;
  targetId: string;
  targetName?: string;
  proposerName?: string;
  reason: string;
  payload: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected' | 'under_review' | 'more_info';
  proposedBy: string;
  decision?: string;
  createdAt?: Date;
}

async function submitProposal(
  treeId: string,
  uid: string,
  proposerName: string,
  p: {
    kind: ProposalKind;
    targetType: 'person' | 'relationship';
    targetId?: string;
    targetName?: string;
    payload: Record<string, unknown>;
    reason: string;
  },
): Promise<void> {
  const d = database();
  const ref = doc(collection(d, 'trees', treeId, 'proposals'));
  await setDoc(ref, {
    kind: p.kind,
    targetType: p.targetType,
    targetId: p.targetId ?? '',
    ...(p.targetName ? { targetName: p.targetName.slice(0, 200) } : {}),
    proposerName: (proposerName || 'Member').slice(0, 100),
    reason: p.reason.trim().slice(0, 5000),
    payload: p.payload,
    status: 'pending',
    proposedBy: uid,
    createdAt: serverTimestamp(),
  });
}

export function proposeAddPerson(
  treeId: string,
  uid: string,
  proposerName: string,
  fields: PersonFields,
  relation: { existingId: string; as: 'parent' | 'child' | 'spouse'; kind?: RelKind; existingName?: string } | undefined,
  reason: string,
) {
  const name = fields.nameBn || fields.nameEn || '';
  return submitProposal(treeId, uid, proposerName, {
    kind: 'addPerson',
    targetType: 'person',
    targetName: name,
    reason,
    payload: { fields: clean({ ...fields }), ...(relation ? { relation: clean({ ...relation }) } : {}) },
  });
}

/** Only the fields that really changed are sent; a cleared field is sent as null. */
export function proposeEditPerson(
  treeId: string,
  uid: string,
  proposerName: string,
  person: Person,
  fields: PersonFields,
  reason: string,
) {
  const cleaned = clean({ ...fields });
  const changes: Record<string, unknown> = {};
  for (const key of PERSON_KEYS) {
    const before = person[key] ?? null;
    const after = key in cleaned ? cleaned[key] : null;
    if (JSON.stringify(before) !== JSON.stringify(after)) changes[key] = after;
  }
  return submitProposal(treeId, uid, proposerName, {
    kind: 'editPerson',
    targetType: 'person',
    targetId: person.id,
    targetName: person.nameBn || person.nameEn,
    reason,
    payload: { changes },
  });
}

export function proposeDeletePerson(
  treeId: string,
  uid: string,
  proposerName: string,
  person: { id: string; nameBn?: string; nameEn?: string },
  reason: string,
) {
  return submitProposal(treeId, uid, proposerName, {
    kind: 'deletePerson',
    targetType: 'person',
    targetId: person.id,
    targetName: person.nameBn || person.nameEn,
    reason,
    payload: {},
  });
}

export function proposeAddRelation(
  treeId: string,
  uid: string,
  proposerName: string,
  rel: NewRelationship,
  description: string,
  reason: string,
) {
  return submitProposal(treeId, uid, proposerName, {
    kind: 'addRelation',
    targetType: 'relationship',
    targetName: description,
    reason,
    payload: { rel: clean({ ...rel }) },
  });
}

export function proposeRemoveRelation(
  treeId: string,
  uid: string,
  proposerName: string,
  relId: string,
  description: string,
  reason: string,
) {
  return submitProposal(treeId, uid, proposerName, {
    kind: 'removeRelation',
    targetType: 'relationship',
    targetId: relId,
    targetName: description,
    reason,
    payload: { relId },
  });
}

/**
 * The admin approves a suggestion: the change is made and the suggestion is marked approved,
 * in one batch. For names the admin can write the right one (for example the certificate
 * name) instead of what was suggested: pass it as `overrides`.
 */
export async function approveProposal(
  treeId: string,
  adminUid: string,
  p: Proposal,
  rels: Relationship[],
  overrides: Record<string, unknown> = {},
): Promise<void> {
  const d = database();
  const batch = writeBatch(d);
  const payload = p.payload as {
    fields?: Record<string, unknown>;
    relation?: { existingId: string; as: 'parent' | 'child' | 'spouse'; kind?: RelKind };
    changes?: Record<string, unknown>;
    rel?: NewRelationship;
    relId?: string;
  };

  if (p.kind === 'addPerson') {
    const personRef = doc(collection(d, 'trees', treeId, 'people'));
    batch.set(personRef, {
      ...clean({ ...(payload.fields ?? {}), ...overrides }),
      createdBy: adminUid,
      createdAt: serverTimestamp(),
    });
    if (payload.relation) {
      const { existingId, as, kind } = payload.relation;
      const rel: NewRelationship =
        as === 'parent'
          ? { type: 'parent', personA: personRef.id, personB: existingId, kind }
          : as === 'child'
            ? { type: 'parent', personA: existingId, personB: personRef.id, kind }
            : { type: 'spouse', personA: existingId, personB: personRef.id };
      batch.set(doc(collection(d, 'trees', treeId, 'relationships')), relationshipData(adminUid, rel));
    }
  } else if (p.kind === 'editPerson') {
    const patch: Record<string, unknown> = { updatedAt: serverTimestamp() };
    for (const [key, value] of Object.entries({ ...(payload.changes ?? {}), ...overrides })) {
      if (!PERSON_KEYS.includes(key as keyof PersonFields)) continue;
      patch[key] = value === null || value === '' ? deleteField() : value;
    }
    batch.update(doc(d, 'trees', treeId, 'people', p.targetId), patch);
  } else if (p.kind === 'deletePerson') {
    batch.delete(doc(d, 'trees', treeId, 'people', p.targetId));
    for (const r of rels) {
      if (r.personA === p.targetId || r.personB === p.targetId) {
        batch.delete(doc(d, 'trees', treeId, 'relationships', r.id));
      }
    }
  } else if (p.kind === 'addRelation' && payload.rel) {
    batch.set(doc(collection(d, 'trees', treeId, 'relationships')), relationshipData(adminUid, payload.rel));
  } else if (p.kind === 'removeRelation' && payload.relId) {
    batch.delete(doc(d, 'trees', treeId, 'relationships', payload.relId));
  }

  batch.update(doc(d, 'trees', treeId, 'proposals', p.id), {
    status: 'approved',
    ...(Object.keys(overrides).length > 0 ? { decision: 'Approved with a correction by the admin team' } : {}),
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  });
  await batch.commit();
}

export async function rejectProposal(treeId: string, adminUid: string, id: string, note: string): Promise<void> {
  await updateDoc(doc(database(), 'trees', treeId, 'proposals', id), {
    status: 'rejected',
    ...(note.trim() ? { decision: note.trim().slice(0, 2000) } : {}),
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
  });
}
