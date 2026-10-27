import { readFileSync } from 'node:fs';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from '@firebase/rules-unit-testing';
import {
  Timestamp,
  deleteDoc,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
  serverTimestamp,
  setDoc,
  updateDoc,
  writeBatch,
} from 'firebase/firestore';

// Cast: the test SDK hands back a Firestore instance for the modular API.
type Db = ReturnType<ReturnType<RulesTestEnvironment['authenticatedContext']>['firestore']>;

let env: RulesTestEnvironment;

const db = (uid: string): Db => env.authenticatedContext(uid).firestore();
const anon = (): Db => env.unauthenticatedContext().firestore();

/** Puts a tree in a person's list: the list entry and the slot it takes, in one batch. */
function listTree(d: Db, uid: string, treeId: string, slot: number, batch = writeBatch(d)) {
  batch.set(doc(d, `users/${uid}/slots/${slot}`), { treeId });
  batch.set(doc(d, `users/${uid}/trees/${treeId}`), { name: 'Tree', addedAt: serverTimestamp(), slot });
  return batch;
}

// Two independent trees.
//   treeA: alice=owner, rita=reviewer, carl=contributor, vera=viewer
//   treeB: bob=owner
async function seed() {
  await env.withSecurityRulesDisabled(async (ctx) => {
    const d = ctx.firestore();
    const now = Timestamp.now();

    await setDoc(doc(d, 'users/alice'), { displayName: 'Alice', createdAt: now });

    await setDoc(doc(d, 'trees/treeA'), { name: 'Tree A', ownerUid: 'alice', createdAt: now });
    const members: Array<[string, string]> = [
      ['alice', 'owner'],
      ['rita', 'reviewer'],
      ['carl', 'contributor'],
      ['vera', 'viewer'],
    ];
    for (const [uid, role] of members) {
      await setDoc(doc(d, `trees/treeA/members/${uid}`), { role, displayName: uid, joinedAt: now });
    }
    await setDoc(doc(d, 'trees/treeA/people/p1'), {
      nameBn: 'আবদুল করিম',
      nameEn: 'Abdul Karim',
      createdBy: 'alice',
      createdAt: now,
    });
    await setDoc(doc(d, 'trees/treeA/people/p1/private/contact'), { phone: '01700000000' });
    await setDoc(doc(d, 'trees/treeA/proposals/byCarl'), {
      targetType: 'person',
      targetId: 'p1',
      reason: 'spelling',
      status: 'pending',
      proposedBy: 'carl',
      createdAt: now,
    });
    await setDoc(doc(d, 'trees/treeA/proposals/byRita'), {
      targetType: 'person',
      targetId: 'p1',
      reason: 'date',
      status: 'pending',
      proposedBy: 'rita',
      createdAt: now,
    });
    await setDoc(doc(d, 'trees/treeA/audit/a1'), {
      action: 'create',
      targetType: 'person',
      targetId: 'p1',
      actorUid: 'alice',
      createdAt: now,
    });

    await setDoc(doc(d, 'trees/treeB'), { name: 'Tree B', ownerUid: 'bob', createdAt: now });
    await setDoc(doc(d, 'trees/treeB/members/bob'), {
      role: 'owner',
      displayName: 'Bob',
      joinedAt: now,
    });
    await setDoc(doc(d, 'trees/treeB/people/q1'), {
      nameEn: 'Secret Person',
      createdBy: 'bob',
      createdAt: now,
    });
  });
}

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-purbosuri',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
  await seed();
});

describe('reading: private by default, no cross-tree leakage', () => {
  it('signed-out users cannot read anything', async () => {
    await assertFails(getDoc(doc(anon(), 'trees/treeA')));
    await assertFails(getDoc(doc(anon(), 'trees/treeA/people/p1')));
  });

  it('members of every role can read their own tree', async () => {
    for (const uid of ['alice', 'rita', 'carl', 'vera']) {
      await assertSucceeds(getDoc(doc(db(uid), 'trees/treeA')));
      await assertSucceeds(getDoc(doc(db(uid), 'trees/treeA/people/p1')));
    }
  });

  it("a member of tree B cannot read tree A by guessing its id", async () => {
    await assertFails(getDoc(doc(db('bob'), 'trees/treeA')));
    await assertFails(getDoc(doc(db('bob'), 'trees/treeA/people/p1')));
    await assertFails(getDoc(doc(db('bob'), 'trees/treeA/members/alice')));
  });

  it('a user with no membership cannot read a tree', async () => {
    await assertFails(getDoc(doc(db('stranger'), 'trees/treeA')));
    await assertFails(getDoc(doc(db('stranger'), 'trees/treeB/people/q1')));
  });

  it("nobody can read another user's profile", async () => {
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice')));
    await assertFails(getDoc(doc(db('bob'), 'users/alice')));
  });

  it('removing a member revokes their access immediately', async () => {
    await assertSucceeds(getDoc(doc(db('carl'), 'trees/treeA')));
    await assertSucceeds(deleteDoc(doc(db('alice'), 'trees/treeA/members/carl')));
    await assertFails(getDoc(doc(db('carl'), 'trees/treeA')));
    await assertFails(getDoc(doc(db('carl'), 'trees/treeA/people/p1')));
  });
});

describe('creating trees and membership', () => {
  it('a user can create a tree together with their owner membership and list entry', async () => {
    const d = db('dina');
    const batch = writeBatch(d);
    batch.set(doc(d, 'trees/treeD'), {
      name: 'Dina family',
      ownerUid: 'dina',
      createdAt: serverTimestamp(),
    });
    batch.set(doc(d, 'trees/treeD/members/dina'), {
      role: 'owner',
      displayName: 'Dina',
      joinedAt: serverTimestamp(),
    });
    listTree(d, 'dina', 'treeD', 1, batch);
    await assertSucceeds(batch.commit());
  });

  it('a tree that is not in its creator list is rejected (no hidden trees)', async () => {
    const d = db('dina');
    const batch = writeBatch(d);
    batch.set(doc(d, 'trees/treeD'), { name: 'Hidden', ownerUid: 'dina', createdAt: serverTimestamp() });
    batch.set(doc(d, 'trees/treeD/members/dina'), {
      role: 'owner',
      displayName: 'Dina',
      joinedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it('a tree without its owner membership is rejected', async () => {
    const d = db('dina');
    await assertFails(
      setDoc(doc(d, 'trees/treeD'), {
        name: 'Dina family',
        ownerUid: 'dina',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('a user cannot create a tree that names someone else as owner', async () => {
    const d = db('dina');
    const batch = writeBatch(d);
    batch.set(doc(d, 'trees/treeD'), {
      name: 'Stolen',
      ownerUid: 'alice',
      createdAt: serverTimestamp(),
    });
    batch.set(doc(d, 'trees/treeD/members/dina'), {
      role: 'owner',
      displayName: 'Dina',
      joinedAt: serverTimestamp(),
    });
    await assertFails(batch.commit());
  });

  it("a user cannot add themselves to someone else's tree", async () => {
    for (const role of ['owner', 'reviewer', 'contributor', 'viewer']) {
      await assertFails(
        setDoc(doc(db('dina'), 'trees/treeA/members/dina'), {
          role,
          displayName: 'Dina',
          joinedAt: serverTimestamp(),
        }),
      );
    }
  });

  it('nobody can be added to a tree without an approved join request', async () => {
    const member = (role: string) => ({ role, displayName: 'Eve', joinedAt: serverTimestamp() });
    await assertFails(setDoc(doc(db('alice'), 'trees/treeA/members/eve'), member('contributor')));
    await assertFails(setDoc(doc(db('rita'), 'trees/treeA/members/eve3'), member('viewer')));
    await assertFails(setDoc(doc(db('alice'), 'trees/treeA/members/eve2'), member('owner')));
  });

  it('a contributor cannot promote themselves', async () => {
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/members/carl'), { role: 'owner' }));
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/members/carl'), { role: 'reviewer' }));
  });

  it('the owner cannot remove or demote themselves (the tree would be orphaned)', async () => {
    await assertFails(deleteDoc(doc(db('alice'), 'trees/treeA/members/alice')));
    await assertFails(updateDoc(doc(db('alice'), 'trees/treeA/members/alice'), { role: 'viewer' }));
  });

  it('a non-owner member can leave a tree', async () => {
    await assertSucceeds(deleteDoc(doc(db('vera'), 'trees/treeA/members/vera')));
  });
});

describe('my list of trees and the five-tree limit', () => {
  it('a member can list their own tree', async () => {
    await assertSucceeds(listTree(db('alice'), 'alice', 'treeA', 1).commit());
    await assertSucceeds(getDoc(doc(db('alice'), 'users/alice/trees/treeA')));
  });

  it('a user cannot list a tree they do not belong to', async () => {
    await assertFails(listTree(db('bob'), 'bob', 'treeA', 1).commit());
    await assertFails(listTree(db('dina'), 'dina', 'treeA', 1).commit());
  });

  it("a user cannot write into someone else's list", async () => {
    await assertFails(listTree(db('bob'), 'alice', 'treeB', 1).commit());
    await assertFails(listTree(db('alice'), 'carl', 'treeA', 1).commit());
  });

  it('nobody can read another user list', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/trees/treeA'), {
        name: 'Tree A',
        addedAt: Timestamp.now(),
        slot: 1,
      });
    });
    await assertFails(getDoc(doc(db('bob'), 'users/alice/trees/treeA')));
  });

  it('a list entry needs a matching slot', async () => {
    const d = db('alice');
    await assertFails(
      setDoc(doc(d, 'users/alice/trees/treeA'), { name: 'Tree A', addedAt: serverTimestamp(), slot: 1 }),
    );
    const batch = writeBatch(d);
    batch.set(doc(d, 'users/alice/slots/2'), { treeId: 'treeA' });
    batch.set(doc(d, 'users/alice/trees/treeA'), { name: 'Tree A', addedAt: serverTimestamp(), slot: 1 });
    await assertFails(batch.commit()); // slot 1 named, slot 2 filled
  });

  const fillFive = async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const d = ctx.firestore();
      for (let i = 1; i <= 5; i++) {
        await setDoc(doc(d, `users/dina/slots/${i}`), { treeId: `old${i}` });
        await setDoc(doc(d, `users/dina/trees/old${i}`), { name: `Old ${i}`, addedAt: Timestamp.now(), slot: i });
      }
    });
  };

  const createD = (slot: number) => {
    const d = db('dina');
    const batch = writeBatch(d);
    batch.set(doc(d, 'trees/treeD'), { name: 'Sixth', ownerUid: 'dina', createdAt: serverTimestamp() });
    batch.set(doc(d, 'trees/treeD/members/dina'), {
      role: 'owner',
      displayName: 'Dina',
      joinedAt: serverTimestamp(),
    });
    listTree(d, 'dina', 'treeD', slot, batch);
    return batch.commit();
  };

  it('a sixth tree is refused, whichever slot is named', async () => {
    await fillFive();
    for (const slot of [1, 3, 5, 6, 0]) await assertFails(createD(slot));
  });

  it('a slot cannot be freed without removing its tree from the list', async () => {
    await fillFive();
    const d = db('dina');
    await assertFails(deleteDoc(doc(d, 'users/dina/slots/2')));
    const batch = writeBatch(d);
    batch.delete(doc(d, 'users/dina/slots/2'));
    batch.delete(doc(d, 'users/dina/trees/old2'));
    await assertSucceeds(batch.commit());
    await assertSucceeds(createD(2));
  });

  it('an old list entry without a slot can be given one', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'users/alice/trees/treeA'), { name: 'Tree A', addedAt: Timestamp.now() });
    });
    const d = db('alice');
    const batch = writeBatch(d);
    batch.set(doc(d, 'users/alice/slots/4'), { treeId: 'treeA' });
    batch.update(doc(d, 'users/alice/trees/treeA'), { slot: 4 });
    await assertSucceeds(batch.commit());
  });
});

describe('roles: who sees whom, and who can change what', () => {
  it('a participant sees only their own membership, an admin sees everyone', async () => {
    await assertSucceeds(getDoc(doc(db('carl'), 'trees/treeA/members/carl')));
    await assertFails(getDoc(doc(db('carl'), 'trees/treeA/members/rita')));
    await assertFails(getDoc(doc(db('vera'), 'trees/treeA/members/alice')));
    await assertSucceeds(getDoc(doc(db('rita'), 'trees/treeA/members/carl')));
    await assertSucceeds(getDoc(doc(db('alice'), 'trees/treeA/members/rita')));
  });

  it('an admin can make a participant an admin, and back', async () => {
    const ref = doc(db('rita'), 'trees/treeA/members/carl');
    await assertSucceeds(updateDoc(ref, { role: 'reviewer' }));
    await assertSucceeds(updateDoc(doc(db('rita'), 'trees/treeA/members/carl'), { role: 'contributor' }));
  });

  it('an admin cannot touch the manager, or make someone manager', async () => {
    await assertFails(updateDoc(doc(db('rita'), 'trees/treeA/members/alice'), { role: 'contributor' }));
    await assertFails(updateDoc(doc(db('rita'), 'trees/treeA/members/carl'), { role: 'owner' }));
    await assertFails(deleteDoc(doc(db('rita'), 'trees/treeA/members/alice')));
  });

  it('a participant cannot change anyone, not even themselves', async () => {
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/members/vera'), { role: 'contributor' }));
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/members/carl'), { role: 'reviewer' }));
  });

  it('an admin can step down to participant but not up', async () => {
    await assertSucceeds(updateDoc(doc(db('rita'), 'trees/treeA/members/rita'), { role: 'contributor' }));
    await assertFails(updateDoc(doc(db('rita'), 'trees/treeA/members/rita'), { role: 'owner' }));
  });

  it('an admin can remove a participant', async () => {
    await assertSucceeds(deleteDoc(doc(db('rita'), 'trees/treeA/members/carl')));
  });

  it('the manager can hand the tree to another member and step down, only in one step', async () => {
    const d = db('alice');
    // Making someone manager without stepping down is refused.
    await assertFails(updateDoc(doc(d, 'trees/treeA/members/rita'), { role: 'owner' }));

    const batch = writeBatch(d);
    batch.update(doc(d, 'trees/treeA/members/rita'), { role: 'owner' });
    batch.update(doc(d, 'trees/treeA/members/alice'), { role: 'reviewer' });
    batch.update(doc(d, 'trees/treeA'), { ownerUid: 'rita' });
    await assertSucceeds(batch.commit());

    // Rita now manages: she can rename the tree, and Alice is an admin.
    await assertSucceeds(updateDoc(doc(db('rita'), 'trees/treeA'), { name: 'Renamed' }));
    await assertFails(updateDoc(doc(db('alice'), 'trees/treeA'), { name: 'Not allowed' }));
  });

  it('the manager cannot step down without handing over', async () => {
    const d = db('alice');
    await assertFails(updateDoc(doc(d, 'trees/treeA/members/alice'), { role: 'reviewer' }));
    const batch = writeBatch(d);
    batch.update(doc(d, 'trees/treeA/members/alice'), { role: 'reviewer' });
    batch.update(doc(d, 'trees/treeA'), { ownerUid: 'alice' });
    await assertFails(batch.commit());
  });
});

describe('invitations, join requests and approval', () => {
  const week = () => Timestamp.fromMillis(Date.now() + 7 * 24 * 3600 * 1000);
  const invite = (role = 'contributor') => ({
    role,
    treeName: 'Tree A',
    createdBy: 'rita',
    createdAt: serverTimestamp(),
    expiresAt: week(),
  });

  const seedInvite = async (code: string, extra: Record<string, unknown> = {}, role = 'contributor') => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `trees/treeA/invites/${code}`), {
        role,
        treeName: 'Tree A',
        createdBy: 'rita',
        createdAt: Timestamp.now(),
        expiresAt: week(),
        ...extra,
      });
    });
  };

  /** What a newcomer sends: the join request and the use of the invitation, in one batch. */
  const join = (uid: string, code: string, role = 'contributor') => {
    const d = db(uid);
    const batch = writeBatch(d);
    batch.set(doc(d, `trees/treeA/joinRequests/${uid}`), {
      displayName: 'Dina',
      fatherName: 'Abdul Karim',
      motherName: 'Rahima',
      contact: { phone: '01711000000' },
      contactOf: 'father',
      inviteCode: code,
      role,
      status: 'pending',
      createdAt: serverTimestamp(),
    });
    batch.update(doc(d, `trees/treeA/invites/${code}`), { usedBy: uid, usedAt: serverTimestamp() });
    batch.set(doc(d, `users/${uid}/pending/treeA`), { treeName: 'Tree A', requestedAt: serverTimestamp() });
    return batch.commit();
  };

  const approve = (by: string, uid: string, role = 'contributor') => {
    const d = db(by);
    const batch = writeBatch(d);
    batch.update(doc(d, `trees/treeA/joinRequests/${uid}`), {
      status: 'approved',
      reviewedBy: by,
      reviewedAt: serverTimestamp(),
      personId: 'p1',
    });
    batch.set(doc(d, `trees/treeA/members/${uid}`), {
      role,
      displayName: 'Dina',
      joinedAt: serverTimestamp(),
      personId: 'p1',
    });
    return batch.commit();
  };

  it('admins and the manager can invite; participants only when the manager allows it', async () => {
    await assertSucceeds(setDoc(doc(db('rita'), 'trees/treeA/invites/c1'), invite()));
    await assertSucceeds(setDoc(doc(db('alice'), 'trees/treeA/invites/c2'), { ...invite(), createdBy: 'alice' }));
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/invites/c3'), { ...invite(), createdBy: 'carl' }));
    await assertFails(setDoc(doc(db('dina'), 'trees/treeA/invites/c4'), { ...invite(), createdBy: 'dina' }));

    await assertSucceeds(
      updateDoc(doc(db('alice'), 'trees/treeA'), { settings: { participantsCanInvite: true } }),
    );
    await assertSucceeds(setDoc(doc(db('carl'), 'trees/treeA/invites/c3'), { ...invite(), createdBy: 'carl' }));
    // ...but a participant can still not invite someone as an admin.
    await assertFails(
      setDoc(doc(db('carl'), 'trees/treeA/invites/c5'), { ...invite('reviewer'), createdBy: 'carl' }),
    );
  });

  it('an invitation must expire within thirty days and name the right creator', async () => {
    const far = Timestamp.fromMillis(Date.now() + 40 * 24 * 3600 * 1000);
    const past = Timestamp.fromMillis(Date.now() - 1000);
    await assertFails(setDoc(doc(db('rita'), 'trees/treeA/invites/c1'), { ...invite(), expiresAt: far }));
    await assertFails(setDoc(doc(db('rita'), 'trees/treeA/invites/c2'), { ...invite(), expiresAt: past }));
    await assertFails(setDoc(doc(db('rita'), 'trees/treeA/invites/c3'), { ...invite(), createdBy: 'alice' }));
  });

  it('anyone signed in can open one invitation by its code, but only admins can list them', async () => {
    await seedInvite('abc');
    await assertSucceeds(getDoc(doc(db('dina'), 'trees/treeA/invites/abc')));
    await assertFails(getDoc(doc(anon(), 'trees/treeA/invites/abc')));
    await assertFails(getDocs(collection(db('dina'), 'trees/treeA/invites')));
    await assertSucceeds(getDocs(collection(db('rita'), 'trees/treeA/invites')));
  });

  it('a newcomer can send a join request with a valid invitation, once', async () => {
    await seedInvite('abc');
    await assertSucceeds(join('dina', 'abc'));
    // The same invitation cannot be used again.
    await assertFails(join('eve', 'abc'));
  });

  it('a join request is refused for an expired invitation, a wrong role, or an unused-link trick', async () => {
    await seedInvite('old', { expiresAt: Timestamp.fromMillis(Date.now() - 1000) });
    await assertFails(join('dina', 'old'));
    await seedInvite('abc');
    await assertFails(join('dina', 'abc', 'reviewer')); // asks for more than was offered
    await assertFails(join('dina', 'nosuchcode'));
  });

  it('only the newcomer and the admins can read a join request', async () => {
    await seedInvite('abc');
    await join('dina', 'abc');
    await assertSucceeds(getDoc(doc(db('dina'), 'trees/treeA/joinRequests/dina')));
    await assertSucceeds(getDoc(doc(db('rita'), 'trees/treeA/joinRequests/dina')));
    await assertSucceeds(getDoc(doc(db('alice'), 'trees/treeA/joinRequests/dina')));
    await assertFails(getDoc(doc(db('carl'), 'trees/treeA/joinRequests/dina')));
    await assertFails(getDoc(doc(db('bob'), 'trees/treeA/joinRequests/dina')));
  });

  it('an admin approves: the member is added in the same batch, in the offered role', async () => {
    await seedInvite('abc');
    await join('dina', 'abc');
    await assertSucceeds(approve('rita', 'dina'));
    await assertSucceeds(getDoc(doc(db('dina'), 'trees/treeA')));
    // A participant sees the tree but nothing about roles.
    await assertFails(getDoc(doc(db('dina'), 'trees/treeA/members/rita')));
  });

  it('approval cannot hand out a bigger role, skip the request, or come from a participant', async () => {
    await seedInvite('abc');
    await join('dina', 'abc');
    await assertFails(approve('rita', 'dina', 'reviewer')); // request asked for participant
    await assertFails(approve('carl', 'dina'));
    // Adding a member without touching the join request is refused.
    await assertFails(
      setDoc(doc(db('rita'), 'trees/treeA/members/dina'), {
        role: 'contributor',
        displayName: 'Dina',
        joinedAt: serverTimestamp(),
      }),
    );
  });

  it('an admin can turn a request down, and then nothing is added', async () => {
    await seedInvite('abc');
    await join('dina', 'abc');
    await assertSucceeds(
      updateDoc(doc(db('rita'), 'trees/treeA/joinRequests/dina'), {
        status: 'rejected',
        reviewedBy: 'rita',
        reviewedAt: serverTimestamp(),
      }),
    );
    await assertFails(getDoc(doc(db('dina'), 'trees/treeA')));
  });

  it('after approval the newcomer can put the tree in their list and clear the waiting note', async () => {
    await seedInvite('abc');
    await join('dina', 'abc');
    await approve('rita', 'dina');
    const d = db('dina');
    const batch = writeBatch(d);
    listTree(d, 'dina', 'treeA', 1, batch);
    batch.delete(doc(d, 'users/dina/pending/treeA'));
    await assertSucceeds(batch.commit());
  });

  it('nobody can fake a waiting note without a join request', async () => {
    await assertFails(
      setDoc(doc(db('dina'), 'users/dina/pending/treeA'), { treeName: 'Tree A', requestedAt: serverTimestamp() }),
    );
  });

  it('a member shows or hides their own contact details, and can change nothing else', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await updateDoc(doc(ctx.firestore(), 'trees/treeA/members/carl'), { personId: 'p1' });
    });
    const ref = doc(db('carl'), 'trees/treeA/people/p1');
    await assertSucceeds(
      updateDoc(ref, { publicContact: { phone: '01700000000' }, updatedAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(ref, { nameEn: 'Changed', updatedAt: serverTimestamp() }));
    await assertFails(updateDoc(ref, { publicContact: { secret: 'x' }, updatedAt: serverTimestamp() }));
    // Someone not linked to this person cannot.
    await assertFails(
      updateDoc(doc(db('vera'), 'trees/treeA/people/p1'), { publicContact: { phone: '1' }, updatedAt: serverTimestamp() }),
    );
  });

  it('an admin can change who may invite participants; only the manager changes the rest', async () => {
    await assertSucceeds(
      updateDoc(doc(db('rita'), 'trees/treeA'), { settings: { participantsCanInvite: true } }),
    );
    await assertFails(updateDoc(doc(db('rita'), 'trees/treeA'), { settings: { adminsCanInvite: false } }));
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA'), { settings: { participantsCanInvite: true } }));
    await assertSucceeds(updateDoc(doc(db('alice'), 'trees/treeA'), { settings: { adminsCanInvite: false } }));
    // With admins switched off from inviting, an admin cannot create one, but the manager can.
    await assertFails(setDoc(doc(db('rita'), 'trees/treeA/invites/c1'), invite()));
    await assertSucceeds(setDoc(doc(db('alice'), 'trees/treeA/invites/c2'), { ...invite(), createdBy: 'alice' }));
  });
});

describe('people and relationships', () => {
  const newPerson = (uid: string) => ({
    nameBn: 'নতুন',
    createdBy: uid,
    createdAt: serverTimestamp(),
  });

  it('an admin can add a person with almost no information', async () => {
    await assertSucceeds(setDoc(doc(db('rita'), 'trees/treeA/people/p2'), newPerson('rita')));
  });

  it('a participant cannot add a person or a relationship directly (they propose it)', async () => {
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/people/p2'), newPerson('carl')));
    await assertFails(
      setDoc(doc(db('carl'), 'trees/treeA/relationships/r1'), {
        personA: 'p1',
        personB: 'p2',
        type: 'parent',
        createdBy: 'carl',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('a viewer cannot add a person', async () => {
    await assertFails(setDoc(doc(db('vera'), 'trees/treeA/people/p2'), newPerson('vera')));
  });

  it("a contributor cannot add a person to someone else's tree", async () => {
    await assertFails(setDoc(doc(db('carl'), 'trees/treeB/people/p2'), newPerson('carl')));
  });

  it('a contributor cannot pretend someone else created the record', async () => {
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/people/p2'), newPerson('alice')));
  });

  it('a contributor cannot directly edit or delete an existing person', async () => {
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/people/p1'), { nameEn: 'Changed' }));
    await assertFails(deleteDoc(doc(db('carl'), 'trees/treeA/people/p1')));
  });

  it('a reviewer can edit an existing person', async () => {
    await assertSucceeds(
      updateDoc(doc(db('rita'), 'trees/treeA/people/p1'), {
        nameEn: 'Abdul Karim Sarker',
        updatedAt: serverTimestamp(),
      }),
    );
  });

  it('unknown fields are rejected', async () => {
    await assertFails(
      setDoc(doc(db('rita'), 'trees/treeA/people/p2'), { ...newPerson('rita'), isAdmin: true }),
    );
  });

  it('accepts a birth order from 1 to 30 and rejects anything else', async () => {
    const ref = (id: string) => doc(db('rita'), `trees/treeA/people/${id}`);
    await assertSucceeds(setDoc(ref('o1'), { ...newPerson('rita'), birthOrder: 1 }));
    await assertSucceeds(setDoc(ref('o2'), { ...newPerson('rita'), birthOrder: 30 }));
    await assertFails(setDoc(ref('o3'), { ...newPerson('rita'), birthOrder: 0 }));
    await assertFails(setDoc(ref('o4'), { ...newPerson('rita'), birthOrder: 31 }));
    await assertFails(setDoc(ref('o5'), { ...newPerson('rita'), birthOrder: 1.5 }));
    await assertFails(setDoc(ref('o6'), { ...newPerson('rita'), birthOrder: 'first' }));
  });

  it('approximate and uncertain information is accepted', async () => {
    await assertSucceeds(
      setDoc(doc(db('rita'), 'trees/treeA/people/p3'), {
        ...newPerson('rita'),
        birth: { year: 1920, precision: 'approximate' },
        verification: 'estimated',
        living: false,
      }),
    );
  });

  it('contributors cannot read private contact details; reviewers can', async () => {
    await assertFails(getDoc(doc(db('carl'), 'trees/treeA/people/p1/private/contact')));
    await assertFails(getDoc(doc(db('vera'), 'trees/treeA/people/p1/private/contact')));
    await assertSucceeds(getDoc(doc(db('rita'), 'trees/treeA/people/p1/private/contact')));
  });

  it('adoptive, step and foster relationships are valid', async () => {
    for (const kind of ['biological', 'adoptive', 'step', 'foster', 'unknown']) {
      await assertSucceeds(
        setDoc(doc(db('rita'), `trees/treeA/relationships/r-${kind}`), {
          personA: 'p1',
          personB: 'p2',
          type: 'parent',
          kind,
          status: 'confirmed',
          createdBy: 'rita',
          createdAt: serverTimestamp(),
        }),
      );
    }
  });

  it('a person cannot be related to themselves', async () => {
    await assertFails(
      setDoc(doc(db('rita'), 'trees/treeA/relationships/self'), {
        personA: 'p1',
        personB: 'p1',
        type: 'spouse',
        createdBy: 'rita',
        createdAt: serverTimestamp(),
      }),
    );
  });
});

describe('proposals, votes and review', () => {
  const decision = (uid: string, status: string) => ({
    status,
    decision: 'Checked the certificate',
    reviewedBy: uid,
    reviewedAt: serverTimestamp(),
  });

  it('a contributor can submit a pending proposal', async () => {
    await assertSucceeds(
      setDoc(doc(db('carl'), 'trees/treeA/proposals/new1'), {
        targetType: 'person',
        targetId: 'p1',
        field: 'birth',
        newValue: { year: 1921 },
        reason: 'Birth certificate',
        status: 'pending',
        proposedBy: 'carl',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('a proposal cannot be created already approved', async () => {
    await assertFails(
      setDoc(doc(db('carl'), 'trees/treeA/proposals/new2'), {
        targetType: 'person',
        targetId: 'p1',
        reason: 'x',
        status: 'approved',
        proposedBy: 'carl',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('a viewer cannot submit a proposal', async () => {
    await assertFails(
      setDoc(doc(db('vera'), 'trees/treeA/proposals/new3'), {
        targetType: 'person',
        targetId: 'p1',
        reason: 'x',
        status: 'pending',
        proposedBy: 'vera',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('a contributor cannot approve a proposal, not even their own', async () => {
    await assertFails(
      updateDoc(doc(db('carl'), 'trees/treeA/proposals/byCarl'), decision('carl', 'approved')),
    );
  });

  it('a reviewer can decide a proposal made by someone else', async () => {
    await assertSucceeds(
      updateDoc(doc(db('rita'), 'trees/treeA/proposals/byCarl'), decision('rita', 'approved')),
    );
  });

  it('a reviewer cannot approve their own proposal, but the owner can', async () => {
    await assertFails(
      updateDoc(doc(db('rita'), 'trees/treeA/proposals/byRita'), decision('rita', 'approved')),
    );
    await assertSucceeds(
      updateDoc(doc(db('alice'), 'trees/treeA/proposals/byRita'), decision('alice', 'approved')),
    );
  });

  it("a decision cannot be recorded in someone else's name", async () => {
    await assertFails(
      updateDoc(doc(db('rita'), 'trees/treeA/proposals/byCarl'), decision('alice', 'approved')),
    );
  });

  it('a reviewer cannot rewrite the proposal itself while deciding', async () => {
    await assertFails(
      updateDoc(doc(db('rita'), 'trees/treeA/proposals/byCarl'), {
        ...decision('rita', 'approved'),
        newValue: { year: 1900 },
      }),
    );
  });

  it('proposals can never be deleted', async () => {
    await assertFails(deleteDoc(doc(db('alice'), 'trees/treeA/proposals/byCarl')));
  });

  it('a contributor can vote once as themselves but not as someone else', async () => {
    const vote = { value: 'agree', votedAt: serverTimestamp() };
    await assertSucceeds(setDoc(doc(db('carl'), 'trees/treeA/proposals/byRita/votes/carl'), vote));
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/proposals/byRita/votes/rita'), vote));
    await assertFails(
      setDoc(doc(db('vera'), 'trees/treeA/proposals/byRita/votes/vera'), vote),
    );
  });

  it('a vote only accepts the allowed values', async () => {
    await assertFails(
      setDoc(doc(db('carl'), 'trees/treeA/proposals/byRita/votes/carl'), {
        value: 'strongly-agree',
        votedAt: serverTimestamp(),
      }),
    );
  });

  it('comments are immutable once posted', async () => {
    const ref = doc(db('carl'), 'trees/treeA/proposals/byRita/comments/c1');
    await assertSucceeds(
      setDoc(ref, { authorUid: 'carl', text: 'Please share the document', createdAt: serverTimestamp() }),
    );
    await assertFails(updateDoc(ref, { text: 'edited' }));
    await assertFails(deleteDoc(ref));
  });
});

describe('suggestions from participants', () => {
  const suggestion = (uid: string, kind: string, extra: Record<string, unknown> = {}) => ({
    kind,
    targetType: 'person',
    targetId: 'p1',
    targetName: 'Abdul Karim',
    proposerName: uid,
    reason: 'Name on the certificate',
    payload: { changes: { nameEn: 'Abdul Karim Sarker' } },
    status: 'pending',
    proposedBy: uid,
    createdAt: serverTimestamp(),
    ...extra,
  });

  it('a participant can suggest adding, editing and removing', async () => {
    for (const kind of ['addPerson', 'editPerson', 'deletePerson', 'addRelation', 'removeRelation']) {
      await assertSucceeds(setDoc(doc(db('carl'), `trees/treeA/proposals/s-${kind}`), suggestion('carl', kind)));
    }
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/proposals/bad'), suggestion('carl', 'takeOver')));
  });

  it('a participant cannot suggest in the name of someone else, or already approved', async () => {
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/proposals/x1'), suggestion('rita', 'editPerson')));
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/proposals/x2'), suggestion('carl', 'editPerson', { status: 'approved' })));
  });

  it('admins see every suggestion; a participant sees only their own', async () => {
    await assertSucceeds(getDoc(doc(db('rita'), 'trees/treeA/proposals/byCarl')));
    await assertSucceeds(getDoc(doc(db('alice'), 'trees/treeA/proposals/byRita')));
    await assertSucceeds(getDoc(doc(db('carl'), 'trees/treeA/proposals/byCarl')));
    await assertFails(getDoc(doc(db('carl'), 'trees/treeA/proposals/byRita')));
    await assertFails(getDoc(doc(db('vera'), 'trees/treeA/proposals/byCarl')));
    await assertFails(getDoc(doc(db('bob'), 'trees/treeA/proposals/byCarl')));
  });

  it('a participant can list their own suggestions but not everyone’s', async () => {
    const col = collection(db('carl'), 'trees/treeA/proposals');
    await assertSucceeds(getDocs(query(col, where('proposedBy', '==', 'carl'))));
    await assertFails(getDocs(col));
  });
});

describe('messages to the admin team', () => {
  const report = (uid: string, extra: Record<string, unknown> = {}) => ({
    text: 'Something is wrong',
    category: 'problem',
    reporterUid: uid,
    reporterName: uid,
    status: 'open',
    createdAt: serverTimestamp(),
    ...extra,
  });

  it('any member can write, but only as themselves and as open', async () => {
    await assertSucceeds(setDoc(doc(db('carl'), 'trees/treeA/reports/r1'), report('carl')));
    await assertSucceeds(setDoc(doc(db('vera'), 'trees/treeA/reports/r2'), report('vera')));
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/reports/r3'), report('rita')));
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/reports/r4'), report('carl', { status: 'solved' })));
    await assertFails(setDoc(doc(db('bob'), 'trees/treeA/reports/r5'), report('bob')));
  });

  it('admins read all; a member reads only their own', async () => {
    await setDoc(doc(db('carl'), 'trees/treeA/reports/r6'), report('carl'));
    await assertSucceeds(getDoc(doc(db('rita'), 'trees/treeA/reports/r6')));
    await assertSucceeds(getDoc(doc(db('alice'), 'trees/treeA/reports/r6')));
    await assertSucceeds(getDoc(doc(db('carl'), 'trees/treeA/reports/r6')));
    await assertFails(getDoc(doc(db('vera'), 'trees/treeA/reports/r6')));
  });

  it('only admins answer, and only the status and reply change', async () => {
    await setDoc(doc(db('carl'), 'trees/treeA/reports/r7'), report('carl'));
    const answer = { status: 'solved', reply: 'Fixed', updatedAt: serverTimestamp() };
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/reports/r7'), answer));
    await assertFails(updateDoc(doc(db('rita'), 'trees/treeA/reports/r7'), { ...answer, reviewedBy: 'rita' }));
    await assertSucceeds(updateDoc(doc(db('rita'), 'trees/treeA/reports/r7'), answer));
  });
});

describe('invitation validity is a manager switch', () => {
  it('uses the days the manager set, with a day of slack', async () => {
    const inDays = (n: number) => Timestamp.fromMillis(Date.now() + n * 24 * 3600 * 1000);
    const invite = (days: number) => ({
      role: 'contributor',
      treeName: 'Tree A',
      createdBy: 'rita',
      createdAt: serverTimestamp(),
      expiresAt: inDays(days),
    });
    await assertSucceeds(setDoc(doc(db('rita'), 'trees/treeA/invites/a'), invite(7)));
    await assertFails(setDoc(doc(db('rita'), 'trees/treeA/invites/b'), invite(10)));
    await assertSucceeds(updateDoc(doc(db('alice'), 'trees/treeA'), { settings: { inviteDays: 14 } }));
    await assertSucceeds(setDoc(doc(db('rita'), 'trees/treeA/invites/c'), invite(14)));
    await assertFails(updateDoc(doc(db('alice'), 'trees/treeA'), { settings: { inviteDays: 31 } }));
    await assertFails(updateDoc(doc(db('alice'), 'trees/treeA'), { settings: { inviteDays: 0 } }));
    // Only the manager sets it; an admin cannot.
    await assertFails(updateDoc(doc(db('rita'), 'trees/treeA'), { settings: { inviteDays: 3 } }));
  });
});

describe('audit log', () => {
  it('a member can append an entry about their own action', async () => {
    await assertSucceeds(
      setDoc(doc(db('rita'), 'trees/treeA/audit/a2'), {
        action: 'approve',
        targetType: 'person',
        targetId: 'p1',
        actorUid: 'rita',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('an entry cannot be attributed to someone else', async () => {
    await assertFails(
      setDoc(doc(db('rita'), 'trees/treeA/audit/a3'), {
        action: 'approve',
        targetType: 'person',
        targetId: 'p1',
        actorUid: 'alice',
        createdAt: serverTimestamp(),
      }),
    );
  });

  it('entries can never be changed or deleted, even by the owner', async () => {
    await assertFails(updateDoc(doc(db('alice'), 'trees/treeA/audit/a1'), { action: 'noop' }));
    await assertFails(deleteDoc(doc(db('alice'), 'trees/treeA/audit/a1')));
  });
});

describe('memories', () => {
  const story = (uid: string, status = 'pending') => ({
    title: 'ঈদের স্মৃতি',
    body: 'দাদুর সঙ্গে ঈদের দিনের গল্প।',
    authorUid: uid,
    authorName: uid,
    personIds: ['p1'],
    status,
    createdAt: serverTimestamp(),
  });

  const seed = async (id: string, uid: string, status: string) => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), `trees/treeA/memories/${id}`), {
        ...story(uid, status),
        createdAt: Timestamp.now(),
      });
    });
  };

  it('a participant writes a story that waits; only an admin publishes directly', async () => {
    await assertSucceeds(
      setDoc(doc(db('carl'), 'trees/treeA/memories/m1'), { ...story('carl'), personIds: ['p1', 'p2', 'p3'] }),
    );
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/memories/m1b'), story('carl', 'published')));
    await assertSucceeds(setDoc(doc(db('rita'), 'trees/treeA/memories/m1c'), story('rita', 'published')));
  });

  it('a story cannot claim another person as its author', async () => {
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/memories/m2'), story('alice')));
  });

  it('waiting stories are seen only by the author and admins; published ones by all members', async () => {
    await seed('w1', 'carl', 'pending');
    await seed('p1x', 'carl', 'published');
    await assertSucceeds(getDoc(doc(db('carl'), 'trees/treeA/memories/w1')));
    await assertSucceeds(getDoc(doc(db('rita'), 'trees/treeA/memories/w1')));
    await assertFails(getDoc(doc(db('vera'), 'trees/treeA/memories/w1')));
    await assertSucceeds(getDoc(doc(db('vera'), 'trees/treeA/memories/p1x')));
    await assertFails(getDoc(doc(db('bob'), 'trees/treeA/memories/p1x')));
  });

  it('the feed can be listed with the published filter', async () => {
    const col = collection(db('vera'), 'trees/treeA/memories');
    await assertSucceeds(getDocs(query(col, where('status', '==', 'published'))));
    await assertFails(getDocs(col));
  });

  it('only an admin approves; an author’s own edit goes back to waiting', async () => {
    await seed('w2', 'carl', 'pending');
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/memories/w2'), { status: 'published' }));
    await assertSucceeds(updateDoc(doc(db('carl'), 'trees/treeA/memories/w2'), { body: 'সংশোধিত' }));
    await assertSucceeds(updateDoc(doc(db('rita'), 'trees/treeA/memories/w2'), { status: 'published' }));
    await assertFails(updateDoc(doc(db('carl'), 'trees/treeA/memories/w2'), { body: 'চুপচাপ বদল' }));
    await assertSucceeds(
      updateDoc(doc(db('carl'), 'trees/treeA/memories/w2'), { body: 'নতুন', status: 'pending' }),
    );
  });

  it('a participant can delete only their own waiting story', async () => {
    await seed('w3', 'carl', 'pending');
    await seed('p3', 'carl', 'published');
    await assertFails(deleteDoc(doc(db('vera'), 'trees/treeA/memories/w3')));
    await assertFails(deleteDoc(doc(db('carl'), 'trees/treeA/memories/p3')));
    await assertSucceeds(deleteDoc(doc(db('carl'), 'trees/treeA/memories/w3')));
    await assertSucceeds(deleteDoc(doc(db('rita'), 'trees/treeA/memories/p3')));
  });
});

describe('email verification', () => {
  const asPassword = (uid: string, verified: boolean): Db =>
    env.authenticatedContext(uid, { email_verified: verified, firebase: { sign_in_provider: 'password' } }).firestore();
  const asGoogle = (uid: string): Db =>
    env.authenticatedContext(uid, { email_verified: true, firebase: { sign_in_provider: 'google.com' } }).firestore();

  const profile = () => ({ displayName: 'Zed', createdAt: serverTimestamp() });

  it('blocks an email-and-password user who has not verified the email', async () => {
    await assertFails(setDoc(doc(asPassword('zed', false), 'users/zed'), profile()));
  });

  it('allows the same user once the email is verified', async () => {
    await assertSucceeds(setDoc(doc(asPassword('zed', true), 'users/zed'), profile()));
  });

  it('allows a Google user', async () => {
    await assertSucceeds(setDoc(doc(asGoogle('zed'), 'users/zed'), profile()));
  });

  it('does not let an unverified member read their tree', async () => {
    await assertFails(getDoc(doc(asPassword('alice', false), 'trees/treeA')));
    await assertSucceeds(getDoc(doc(asPassword('alice', true), 'trees/treeA')));
  });
});

describe('default deny', () => {
  it('collections that are not built yet are closed', async () => {
    await assertFails(setDoc(doc(db('alice'), 'trees/treeA/invitations/i1'), { x: 1 }));
    await assertFails(setDoc(doc(db('alice'), 'notifications/n1'), { x: 1 }));
    await assertFails(getDoc(doc(db('alice'), 'somethingElse/doc1')));
  });
});

// A tiny sanity check so a broken test setup fails loudly instead of passing by accident.
describe('test harness', () => {
  it('seed data exists and is readable with rules disabled', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      const snap = await getDoc(doc(ctx.firestore(), 'trees/treeA'));
      expect(snap.exists()).toBe(true);
    });
  });
});
