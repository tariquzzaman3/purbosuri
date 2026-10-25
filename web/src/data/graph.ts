import type { Person, Relationship, RelKind, RelType } from './types';

/** Lookup tables built from the flat lists of people and relationships. */
export interface Graph {
  people: Map<string, Person>;
  /** child id -> relationships where that child is personB */
  parentRels: Map<string, Relationship[]>;
  /** parent id -> relationships where that parent is personA */
  childRels: Map<string, Relationship[]>;
  spouses: Map<string, Set<string>>;
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}

function addSpouse(map: Map<string, Set<string>>, a: string, b: string) {
  const set = map.get(a);
  if (set) set.add(b);
  else map.set(a, new Set([b]));
}

export function buildGraph(people: Person[], rels: Relationship[]): Graph {
  const g: Graph = {
    people: new Map(),
    parentRels: new Map(),
    childRels: new Map(),
    spouses: new Map(),
  };
  for (const p of people) g.people.set(p.id, p);
  for (const r of rels) {
    // Ignore relationships that point at people who no longer exist.
    if (!g.people.has(r.personA) || !g.people.has(r.personB)) continue;
    if (r.type === 'parent') {
      push(g.parentRels, r.personB, r);
      push(g.childRels, r.personA, r);
    } else if (r.type === 'spouse') {
      addSpouse(g.spouses, r.personA, r.personB);
      addSpouse(g.spouses, r.personB, r.personA);
    }
  }
  return g;
}

export const parentIds = (g: Graph, id: string): string[] =>
  (g.parentRels.get(id) ?? []).map((r) => r.personA);

export const childIds = (g: Graph, id: string): string[] =>
  (g.childRels.get(id) ?? []).map((r) => r.personB);

export const spouseIds = (g: Graph, id: string): string[] => [...(g.spouses.get(id) ?? [])];

/** Full and half siblings: everyone who shares at least one recorded parent. */
export function siblingIds(g: Graph, id: string): string[] {
  const out = new Set<string>();
  for (const parent of parentIds(g, id)) {
    for (const child of childIds(g, parent)) if (child !== id) out.add(child);
  }
  return [...out];
}

/**
 * True when making `parentId` a parent of `childId` would be impossible:
 * a person cannot be their own ancestor.
 */
export function wouldCreateCycle(g: Graph, parentId: string, childId: string): boolean {
  if (parentId === childId) return true;
  const seen = new Set<string>();
  const stack = [childId];
  while (stack.length) {
    const current = stack.pop() as string;
    if (current === parentId) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    stack.push(...childIds(g, current));
  }
  return false;
}

export type WarningCode = 'duplicate' | 'parentYounger' | 'manyBioParents' | 'spouseIsRelative';

export interface RelationshipInput {
  type: RelType;
  kind?: RelKind;
  /** For 'parent': the parent. */
  a: string;
  /** For 'parent': the child. */
  b: string;
}

const MIN_PARENT_AGE = 12;

/**
 * Things that look unusual. They are shown to the person, who can still go ahead,
 * because real families are sometimes unusual. Impossible cycles are handled
 * separately by wouldCreateCycle and are never allowed.
 */
export function relationshipWarnings(g: Graph, input: RelationshipInput): WarningCode[] {
  const { type, kind, a, b } = input;
  const warnings: WarningCode[] = [];

  if (type === 'parent') {
    if (parentIds(g, b).includes(a)) warnings.push('duplicate');

    const parentYear = g.people.get(a)?.birth?.year;
    const childYear = g.people.get(b)?.birth?.year;
    if (parentYear !== undefined && childYear !== undefined && childYear - parentYear < MIN_PARENT_AGE) {
      warnings.push('parentYounger');
    }

    if (kind === undefined || kind === 'biological') {
      const bioParents = (g.parentRels.get(b) ?? []).filter(
        (r) => r.kind === undefined || r.kind === 'biological',
      );
      if (bioParents.length >= 2) warnings.push('manyBioParents');
    }
  }

  if (type === 'spouse') {
    if (spouseIds(g, a).includes(b)) warnings.push('duplicate');
    const related =
      parentIds(g, a).includes(b) ||
      parentIds(g, b).includes(a) ||
      siblingIds(g, a).includes(b);
    if (related) warnings.push('spouseIsRelative');
  }

  return warnings;
}

/**
 * Generation numbers, starting at 0 for the oldest recorded people.
 * A person who married in (no recorded parents) takes their spouse's generation.
 */
export function generations(g: Graph): Map<string, number> {
  const memo = new Map<string, number>();
  const visiting = new Set<string>();

  const gen = (id: string): number => {
    const known = memo.get(id);
    if (known !== undefined) return known;
    if (visiting.has(id)) return 0; // damaged data: stop instead of looping forever
    visiting.add(id);

    const parents = parentIds(g, id);
    let value = 0;
    if (parents.length > 0) {
      value = Math.max(...parents.map(gen)) + 1;
    } else {
      const marriedInto = spouseIds(g, id).filter((s) => parentIds(g, s).length > 0);
      if (marriedInto.length > 0) value = Math.max(...marriedInto.map(gen));
    }

    visiting.delete(id);
    memo.set(id, value);
    return value;
  };

  for (const id of g.people.keys()) gen(id);
  return memo;
}

/** One person, the spouses shown beside them, and the children of that family unit. */
export interface UnitNode {
  person: Person;
  spouses: Person[];
  gen: number;
  children: UnitNode[];
  /**
   * Which member of the parent unit this unit hangs from: the parent person, or one of
   * their spouses. Keeps the children of different spouses apart.
   */
  fromId?: string;
}

const nameKey = (p: Person) => p.nameBn ?? p.nameEn ?? '';

/**
 * Eldest first. People with a known birth year come before those without one.
 * Among them the order is year, month, day (an unknown month or day counts as
 * earliest). Anything still tied, such as twins or people with no dates at all,
 * is ordered by the optional birth order number, then by name.
 */
export function byBirthThenName(a: Person, b: Person): number {
  const ya = a.birth?.year;
  const yb = b.birth?.year;
  if (ya !== undefined && yb === undefined) return -1;
  if (ya === undefined && yb !== undefined) return 1;
  if (ya !== undefined && yb !== undefined) {
    if (ya !== yb) return ya - yb;
    const ma = a.birth?.month ?? 0;
    const mb = b.birth?.month ?? 0;
    if (ma !== mb) return ma - mb;
    const da = a.birth?.day ?? 0;
    const db = b.birth?.day ?? 0;
    if (da !== db) return da - db;
  }
  const oa = a.birthOrder ?? Number.POSITIVE_INFINITY;
  const ob = b.birthOrder ?? Number.POSITIVE_INFINITY;
  if (oa !== ob) return oa < ob ? -1 : 1;
  return nameKey(a).localeCompare(nameKey(b)) || a.id.localeCompare(b.id);
}

/**
 * Turns the graph into a forest of family units for the list and the chart.
 * Every person appears exactly once. A child with two recorded parents is shown
 * under the first parent's unit; the profile shows both.
 */
export function buildForest(g: Graph): UnitNode[] {
  const gens = generations(g);
  const placed = new Set<string>();

  const makeUnit = (p: Person): UnitNode => {
    placed.add(p.id);

    // Spouses who have no recorded parents (married in) are drawn next to this person.
    const spouses: Person[] = [];
    for (const sid of spouseIds(g, p.id)) {
      const s = g.people.get(sid);
      if (!s || placed.has(sid)) continue;
      if (parentIds(g, sid).length === 0) {
        placed.add(sid);
        spouses.push(s);
      }
    }
    spouses.sort(byBirthThenName);

    const kidIds = new Set<string>();
    for (const member of [p, ...spouses]) for (const c of childIds(g, member.id)) kidIds.add(c);

    const kids = [...kidIds]
      .map((id) => g.people.get(id))
      .filter((c): c is Person => c !== undefined && !placed.has(c.id));

    // A child belongs to a spouse when that spouse is a recorded parent, otherwise to the
    // person. Each spouse's children stay together (eldest first), spouses in order, and
    // the person's own children (other parent not recorded) come last.
    const memberFor = (c: Person): string => {
      const parents = new Set((g.parentRels.get(c.id) ?? []).map((r) => r.personA));
      return spouses.find((s) => parents.has(s.id))?.id ?? p.id;
    };
    const children: UnitNode[] = [];
    for (const memberId of [...spouses.map((s) => s.id), p.id]) {
      const group = kids.filter((c) => memberFor(c) === memberId).sort(byBirthThenName);
      for (const kid of group) {
        if (placed.has(kid.id)) continue;
        const unit = makeUnit(kid);
        unit.fromId = memberId;
        children.push(unit);
      }
    }

    return { person: p, spouses, gen: gens.get(p.id) ?? 0, children };
  };

  const everyone = [...g.people.values()];
  const isMarriedIn = (p: Person) =>
    parentIds(g, p.id).length === 0 && spouseIds(g, p.id).some((s) => parentIds(g, s).length > 0);

  const roots = everyone
    .filter((p) => parentIds(g, p.id).length === 0 && !isMarriedIn(p))
    .sort(byBirthThenName);

  const forest: UnitNode[] = [];
  for (const root of roots) if (!placed.has(root.id)) forest.push(makeUnit(root));

  // Anything left over (for example damaged data with a loop) still gets shown.
  for (const p of everyone.sort(byBirthThenName)) if (!placed.has(p.id)) forest.push(makeUnit(p));

  return forest;
}

/** The unit that contains this person, and everything below it. Used for "show this branch". */
export function findUnit(forest: UnitNode[], personId: string): UnitNode | null {
  for (const node of forest) {
    if (node.person.id === personId || node.spouses.some((s) => s.id === personId)) return node;
    const inside = findUnit(node.children, personId);
    if (inside) return inside;
  }
  return null;
}

export function countPeople(forest: UnitNode[]): number {
  return forest.reduce(
    (sum, n) => sum + 1 + n.spouses.length + countPeople(n.children),
    0,
  );
}
