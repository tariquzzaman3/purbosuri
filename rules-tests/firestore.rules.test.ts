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
  getDoc,
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
  it('a user can create a tree together with their owner membership', async () => {
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
    await assertSucceeds(batch.commit());
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

  it('only the owner can add members, and never as another owner', async () => {
    const member = (role: string) => ({ role, displayName: 'Eve', joinedAt: serverTimestamp() });
    await assertSucceeds(setDoc(doc(db('alice'), 'trees/treeA/members/eve'), member('contributor')));
    await assertFails(setDoc(doc(db('alice'), 'trees/treeA/members/eve2'), member('owner')));
    await assertFails(setDoc(doc(db('rita'), 'trees/treeA/members/eve3'), member('viewer')));
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

describe('people and relationships', () => {
  const newPerson = (uid: string) => ({
    nameBn: 'নতুন',
    createdBy: uid,
    createdAt: serverTimestamp(),
  });

  it('a contributor can add a person with almost no information', async () => {
    await assertSucceeds(setDoc(doc(db('carl'), 'trees/treeA/people/p2'), newPerson('carl')));
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
      setDoc(doc(db('carl'), 'trees/treeA/people/p2'), { ...newPerson('carl'), isAdmin: true }),
    );
  });

  it('approximate and uncertain information is accepted', async () => {
    await assertSucceeds(
      setDoc(doc(db('carl'), 'trees/treeA/people/p3'), {
        ...newPerson('carl'),
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
        setDoc(doc(db('carl'), `trees/treeA/relationships/r-${kind}`), {
          personA: 'p1',
          personB: 'p2',
          type: 'parent',
          kind,
          status: 'confirmed',
          createdBy: 'carl',
          createdAt: serverTimestamp(),
        }),
      );
    }
  });

  it('a person cannot be related to themselves', async () => {
    await assertFails(
      setDoc(doc(db('carl'), 'trees/treeA/relationships/self'), {
        personA: 'p1',
        personB: 'p1',
        type: 'spouse',
        createdBy: 'carl',
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
  const story = (uid: string) => ({
    title: 'ঈদের স্মৃতি',
    body: 'দাদুর সঙ্গে ঈদের দিনের গল্প।',
    authorUid: uid,
    personIds: ['p1'],
    createdAt: serverTimestamp(),
  });

  it('a contributor can write a story linked to several people', async () => {
    await assertSucceeds(
      setDoc(doc(db('carl'), 'trees/treeA/memories/m1'), {
        ...story('carl'),
        personIds: ['p1', 'p2', 'p3'],
      }),
    );
  });

  it('a story cannot claim another person as its author', async () => {
    await assertFails(setDoc(doc(db('carl'), 'trees/treeA/memories/m2'), story('alice')));
  });

  it('only the author or a reviewer can edit a story', async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), 'trees/treeA/memories/m3'), {
        ...story('carl'),
        createdAt: Timestamp.now(),
      });
    });
    await assertSucceeds(
      updateDoc(doc(db('carl'), 'trees/treeA/memories/m3'), { body: 'সংশোধিত' }),
    );
    await assertSucceeds(
      updateDoc(doc(db('rita'), 'trees/treeA/memories/m3'), { body: 'পর্যালোচিত' }),
    );
    await assertFails(
      setDoc(doc(db('vera'), 'trees/treeA/memories/m3'), { ...story('vera') }),
    );
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
