import { describe, expect, it } from 'vitest';
import {
  buildForest,
  buildGraph,
  childIds,
  countPeople,
  findUnit,
  generations,
  parentIds,
  relationshipWarnings,
  siblingIds,
  wouldCreateCycle,
} from './graph';
import { layoutForest, CARD_W } from './layout';
import type { Person, Relationship } from './types';

const person = (id: string, extra: Partial<Person> = {}): Person => ({
  id,
  nameEn: id,
  createdBy: 'u',
  ...extra,
});

let n = 0;
const parent = (a: string, b: string, kind?: Relationship['kind']): Relationship => ({
  id: `r${n++}`,
  personA: a,
  personB: b,
  type: 'parent',
  kind,
  createdBy: 'u',
});

const spouse = (a: string, b: string): Relationship => ({
  id: `r${n++}`,
  personA: a,
  personB: b,
  type: 'spouse',
  createdBy: 'u',
});

// grandpa + grandma -> dad (+ mum, married in) -> kid1, kid2
const family = () => {
  const people = [
    person('grandpa', { birth: { year: 1920 } }),
    person('grandma', { birth: { year: 1925 } }),
    person('dad', { birth: { year: 1950 } }),
    person('mum', { birth: { year: 1955 } }),
    person('kid1', { birth: { year: 1980 } }),
    person('kid2', { birth: { year: 1983 } }),
  ];
  const rels = [
    spouse('grandpa', 'grandma'),
    parent('grandpa', 'dad'),
    parent('grandma', 'dad'),
    spouse('dad', 'mum'),
    parent('dad', 'kid1'),
    parent('mum', 'kid1'),
    parent('dad', 'kid2'),
    parent('mum', 'kid2'),
  ];
  return buildGraph(people, rels);
};

describe('relationships lookup', () => {
  it('finds parents, children and siblings', () => {
    const g = family();
    expect(parentIds(g, 'kid1').sort()).toEqual(['dad', 'mum']);
    expect(childIds(g, 'dad').sort()).toEqual(['kid1', 'kid2']);
    expect(siblingIds(g, 'kid1')).toEqual(['kid2']);
  });

  it('ignores relationships to people who no longer exist', () => {
    const g = buildGraph([person('a')], [parent('a', 'ghost')]);
    expect(childIds(g, 'a')).toEqual([]);
  });
});

describe('impossible loops are blocked', () => {
  it('a person cannot be their own parent', () => {
    expect(wouldCreateCycle(family(), 'dad', 'dad')).toBe(true);
  });

  it('a descendant cannot become an ancestor', () => {
    expect(wouldCreateCycle(family(), 'kid1', 'grandpa')).toBe(true);
    expect(wouldCreateCycle(family(), 'kid1', 'dad')).toBe(true);
  });

  it('normal additions are allowed', () => {
    expect(wouldCreateCycle(family(), 'grandpa', 'kid2')).toBe(false);
    expect(wouldCreateCycle(family(), 'mum', 'dad')).toBe(false);
  });
});

describe('warnings for unusual but possible situations', () => {
  it('flags a parent who is too young', () => {
    const g = family();
    expect(relationshipWarnings(g, { type: 'parent', a: 'kid2', b: 'kid1' })).toContain('parentYounger');
  });

  it('flags a third biological parent but accepts an adoptive one', () => {
    const g = buildGraph(
      [person('a'), person('b'), person('c'), person('kid')],
      [parent('a', 'kid', 'biological'), parent('b', 'kid', 'biological')],
    );
    expect(relationshipWarnings(g, { type: 'parent', kind: 'biological', a: 'c', b: 'kid' })).toContain(
      'manyBioParents',
    );
    expect(relationshipWarnings(g, { type: 'parent', kind: 'adoptive', a: 'c', b: 'kid' })).toEqual([]);
    expect(relationshipWarnings(g, { type: 'parent', kind: 'step', a: 'c', b: 'kid' })).toEqual([]);
    expect(relationshipWarnings(g, { type: 'parent', kind: 'foster', a: 'c', b: 'kid' })).toEqual([]);
  });

  it('flags duplicates and relatives marrying', () => {
    const g = family();
    expect(relationshipWarnings(g, { type: 'parent', a: 'dad', b: 'kid1' })).toContain('duplicate');
    expect(relationshipWarnings(g, { type: 'spouse', a: 'dad', b: 'mum' })).toContain('duplicate');
    expect(relationshipWarnings(g, { type: 'spouse', a: 'kid1', b: 'kid2' })).toContain('spouseIsRelative');
  });

  it('does not warn about a missing birth year', () => {
    const g = buildGraph([person('a'), person('b')], []);
    expect(relationshipWarnings(g, { type: 'parent', a: 'a', b: 'b' })).toEqual([]);
  });
});

describe('generations', () => {
  it('numbers generations and puts married-in people with their spouse', () => {
    const gens = generations(family());
    expect(gens.get('grandpa')).toBe(0);
    expect(gens.get('dad')).toBe(1);
    expect(gens.get('mum')).toBe(1);
    expect(gens.get('kid1')).toBe(2);
  });

  it('does not loop forever on damaged data', () => {
    const g = buildGraph([person('a'), person('b')], [parent('a', 'b'), parent('b', 'a')]);
    expect(() => generations(g)).not.toThrow();
  });
});

describe('forest used by the list and the chart', () => {
  it('shows every person exactly once', () => {
    const forest = buildForest(family());
    expect(countPeople(forest)).toBe(6);
    expect(forest).toHaveLength(1);
  });

  it('draws married-in spouses next to their partner, not as separate roots', () => {
    const forest = buildForest(family());
    const root = forest[0];
    expect(root.person.id).toBe('grandpa');
    expect(root.spouses.map((s) => s.id)).toEqual(['grandma']);
    const dadUnit = root.children[0];
    expect(dadUnit.person.id).toBe('dad');
    expect(dadUnit.spouses.map((s) => s.id)).toEqual(['mum']);
    expect(dadUnit.children.map((c) => c.person.id)).toEqual(['kid1', 'kid2']);
  });

  it('orders siblings by birth year', () => {
    const g = buildGraph(
      [
        person('p'),
        person('young', { birth: { year: 2000 } }),
        person('old', { birth: { year: 1990 } }),
        person('unknown'),
      ],
      [parent('p', 'young'), parent('p', 'old'), parent('p', 'unknown')],
    );
    expect(buildForest(g)[0].children.map((c) => c.person.id)).toEqual(['old', 'young', 'unknown']);
  });

  it('supports several spouses, adoptive and step children, and unknown parents', () => {
    const g = buildGraph(
      [person('a'), person('s1'), person('s2'), person('own'), person('adopted'), person('stepkid'), person('orphan')],
      [
        spouse('a', 's1'),
        spouse('a', 's2'),
        parent('a', 'own', 'biological'),
        parent('a', 'adopted', 'adoptive'),
        parent('s2', 'stepkid', 'biological'),
        parent('a', 'stepkid', 'step'),
      ],
    );
    const forest = buildForest(g);
    expect(countPeople(forest)).toBe(7);
    const unit = forest.find((u) => u.person.id === 'a')!;
    expect(unit.spouses).toHaveLength(2);
    expect(unit.children.map((c) => c.person.id).sort()).toEqual(['adopted', 'own', 'stepkid']);
    expect(forest.some((u) => u.person.id === 'orphan')).toBe(true);
  });

  it('shows a child with two recorded parents once', () => {
    const g = buildGraph(
      [person('a'), person('b'), person('kid')],
      [parent('a', 'kid'), parent('b', 'kid')],
    );
    expect(countPeople(buildForest(g))).toBe(3);
  });

  it('still shows everyone when the data contains a loop', () => {
    const g = buildGraph([person('a'), person('b')], [parent('a', 'b'), parent('b', 'a')]);
    expect(countPeople(buildForest(g))).toBe(2);
  });

  it('finds the branch of a person, including a married-in spouse', () => {
    const forest = buildForest(family());
    expect(findUnit(forest, 'dad')?.person.id).toBe('dad');
    expect(findUnit(forest, 'mum')?.person.id).toBe('dad');
    expect(findUnit(forest, 'nobody')).toBeNull();
  });
});

describe('chart layout', () => {
  it('places every person once and nothing overlaps', () => {
    const forest = buildForest(family());
    const layout = layoutForest(forest);
    expect(layout.cards).toHaveLength(6);

    const rows = new Map<number, number[]>();
    for (const c of layout.cards) rows.set(c.y, [...(rows.get(c.y) ?? []), c.x]);
    for (const xs of rows.values()) {
      xs.sort((a, b) => a - b);
      for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1]).toBeGreaterThanOrEqual(CARD_W);
    }
  });

  it('puts children below their parents', () => {
    const layout = layoutForest(buildForest(family()));
    const y = (id: string) => layout.cards.find((c) => c.id === id)!.y;
    expect(y('dad')).toBeGreaterThan(y('grandpa'));
    expect(y('kid1')).toBeGreaterThan(y('dad'));
    expect(y('mum')).toBe(y('dad'));
  });

  it('handles an empty tree and a wide tree', () => {
    expect(layoutForest([]).cards).toHaveLength(0);
    const many = buildGraph(
      [person('p'), ...Array.from({ length: 30 }, (_, i) => person(`c${i}`))],
      Array.from({ length: 30 }, (_, i) => parent('p', `c${i}`)),
    );
    const layout = layoutForest(buildForest(many));
    expect(layout.cards).toHaveLength(31);
    expect(layout.width).toBeGreaterThan(30 * CARD_W);
  });
});
