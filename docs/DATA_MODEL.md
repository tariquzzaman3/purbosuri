# Purbosuri data model and access control

Enforced by `firestore.rules`, checked by `rules-tests/firestore.rules.test.ts`.

## How access works

Every family tree has its own id. Who can see it is decided by one document:
`trees/{treeId}/members/{userId}`. If that document does not exist for you, you
cannot read or write anything in that tree. Guessing a tree id gets you nothing.

| Role | Can do |
| --- | --- |
| viewer | Read the tree |
| contributor | Add people, relationships, stories, media records, proposals, comments, votes. Cannot edit or delete existing people or relationships directly |
| reviewer | Everything a contributor can, plus edit records and decide proposals (not their own) |
| owner | Everything a reviewer can, plus add, remove and change members. Can decide their own proposals (a one-person tree needs this) |

Sharing the app link grants nothing. Only an owner adding someone as a member
grants access.

## Collections

```
users/{uid}                              private profile (only that user)
trees/{treeId}                           name, ownerUid
  members/{uid}                          role, displayName, joinedAt
  people/{personId}                      names, dates, places, bio (all optional)
    private/{doc}                        contact details (owner and reviewers only)
  relationships/{relId}                  personA, personB, type, kind, status
  memories/{memoryId}                    story text, authorUid, personIds[]
  media/{mediaId}                        metadata only: caption, date, taggedPeople[]
  proposals/{proposalId}                 edit suggestions, status, decision
    comments/{commentId}                 discussion (cannot be edited)
    votes/{uid}                          agree, disagree, need_info (one per person)
  audit/{entryId}                        append-only history
```

Every person, relationship and story has its own id. Names are never used as
identity. A story or photo points at people by id (`personIds`, `taggedPeople`),
so one item can belong to many people without copies.

## Relationships

`type`: `parent` (personA is a parent of personB), `spouse`, `sibling`, `other`.
`kind`: `biological`, `adoptive`, `step`, `foster`, `unknown`.
`status`: `confirmed`, `uncertain`, `disputed`.
Any number of spouses and children, all optional.

## Proposals and the audit trail

1. A contributor creates a proposal (always `pending`).
2. Members comment and vote. Votes are opinion, not proof.
3. A reviewer sets `under_review`, `approved`, `rejected` or `more_info`, with a reason.
   Only the decision fields can change. A reviewer cannot decide their own proposal.
4. The reviewer applies the approved change and appends an `audit` entry with the
   before and after values.

Proposals and audit entries can never be deleted or rewritten.

## Not built yet (rules deny these on purpose)

- Invitations (Milestone 4). Until then an owner adds members directly by user id.
- Notifications, tree matching and merging (Milestone 6).
- Per-item privacy levels for stories and media. Today every member of a tree
  can read all of its stories and media records.
- The stronger review for sensitive changes to living people. Today it is one reviewer.
- Checks that stop circular parent-child links. These need app logic, not rules.

## Known limits of rules-only security

- No Cloud Functions are used because they need a paid plan. Anything that must be
  atomic across documents (accepting an invitation, applying an approved change) is
  done by the client. Rules guard each write but cannot guarantee the audit entry is
  written alongside an approved change.
- Deleting a tree or account does not remove its subcollections automatically.
  The client deletes them collection by collection.
