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
import { layoutForest, CARD_H, CARD_W } from './layout';
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
    // A spouse has her own box, just below.
    expect(y('mum')).toBeGreaterThan(y('dad'));
    expect(y('mum')).toBeLessThan(y('kid1'));
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

describe('several spouses', () => {
  const multi = () =>
    buildGraph(
      [
        person('a'),
        person('s1'),
        person('s2'),
        person('k1', { birth: { year: 2000 } }),
        person('k2', { birth: { year: 2005 } }),
        person('k3', { birth: { year: 2002 } }),
        person('k4', { birth: { year: 2010 } }),
      ],
      [
        spouse('a', 's1'),
        spouse('a', 's2'),
        parent('a', 'k1'),
        parent('s1', 'k1'),
        parent('a', 'k2'),
        parent('s2', 'k2'),
        parent('a', 'k3'),
        parent('s2', 'k3'),
        parent('a', 'k4'),
      ],
    );

  it('groups children under the spouse who is their parent', () => {
    const unit = buildForest(multi())[0];
    expect(unit.children.map((c) => [c.person.id, c.fromId])).toEqual([
      ['k1', 's1'],
      ['k3', 's2'],
      ['k2', 's2'],
      ['k4', 'a'],
    ]);
  });

  it('puts each spouse in a box below and runs child lines from that spouse', () => {
    const layout = layoutForest(buildForest(multi()));
    const card = (id: string) => layout.cards.find((c) => c.id === id)!;
    expect(layout.cards).toHaveLength(7);
    for (const s of ['s1', 's2']) {
      expect(card(s).isSpouse).toBe(true);
      expect(card(s).y).toBeGreaterThan(card('a').y);
      expect(card(s).y).toBeLessThan(card('k1').y);
    }
    // Different spouses never share a column, and their children sit under them in order.
    expect(card('s1').x + card('s1').w).toBeLessThanOrEqual(card('s2').x);
    expect(card('k1').x).toBeLessThan(card('k3').x);
    expect(card('k2').x).toBeLessThan(card('k4').x);

    // The line to k1 starts at the bottom of s1's box, not the person's.
    const s1 = card('s1');
    const k1Line = layout.childLines.find((l) => l.points.endsWith(`${card('k1').x + card('k1').w / 2},${card('k1').y}`))!;
    expect(k1Line.points.startsWith(`${s1.x + s1.w / 2},${s1.y + CARD_H} `)).toBe(true);
    expect(layout.spouseLines).toHaveLength(2);
    expect(layout.childLines).toHaveLength(4);
  });
});

describe('marriage between cousins', () => {
  // grandpa has sons s1 and s2. c1 (child of s1) marries c2 (child of s2); their child is kid.
  const cousins = () =>
    buildGraph(
      [
        person('grandpa'),
        person('s1', { birth: { year: 1950 } }),
        person('s2', { birth: { year: 1955 } }),
        person('c1'),
        person('c2'),
        person('kid'),
      ],
      [
        parent('grandpa', 's1'),
        parent('grandpa', 's2'),
        parent('s1', 'c1'),
        parent('s2', 'c2'),
        spouse('c1', 'c2'),
        parent('c1', 'kid'),
        parent('c2', 'kid'),
      ],
    );

  it('shows every person once in the tree, with the child under one of the cousins', () => {
    const forest = buildForest(cousins());
    expect(forest).toHaveLength(1);
    expect(countPeople(forest)).toBe(6);
  });

  it('shows the marriage in both branches as a reference', () => {
    const root = buildForest(cousins())[0];
    const unit = (id: string) => findUnit([root], id)!;
    expect(unit('c1').refs.map((p) => p.id)).toEqual(['c2']);
    expect(unit('c2').refs.map((p) => p.id)).toEqual(['c1']);
    // The child hangs from c2 (the reference box) under c1's branch, and nowhere else.
    expect(unit('c1').children.map((c) => [c.person.id, c.fromId])).toEqual([['kid', 'c2']]);
    expect(unit('c2').children).toHaveLength(0);
  });

  it('draws reference boxes without overlap and links the child to the right parent', () => {
    const layout = layoutForest(buildForest(cousins()));
    // six people plus two reference boxes
    expect(layout.cards).toHaveLength(8);
    expect(layout.cards.filter((c) => c.isRef).map((c) => c.id).sort()).toEqual(['c1', 'c2']);
    const main = (id: string) => layout.cards.find((c) => c.id === id && !c.isRef)!;
    expect(main('kid').y).toBeGreaterThan(main('c1').y);

    const rows = new Map<number, Array<{ x: number; w: number }>>();
    for (const c of layout.cards) rows.set(c.y, [...(rows.get(c.y) ?? []), c]);
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w);
    }
  });
});

describe('sibling order (eldest first)', () => {
  const order = (kids: Person[]) => {
    const g = buildGraph(
      [person('p'), ...kids],
      kids.map((k) => parent('p', k.id)),
    );
    return buildForest(g)[0].children.map((c) => c.person.id);
  };

  it('orders by year, then month, then day', () => {
    expect(
      order([
        person('a', { birth: { year: 1990, month: 5, day: 10 } }),
        person('b', { birth: { year: 1990, month: 2, day: 20 } }),
        person('c', { birth: { year: 1989, month: 12, day: 31 } }),
        person('d', { birth: { year: 1990, month: 5, day: 2 } }),
      ]),
    ).toEqual(['c', 'b', 'd', 'a']);
  });

  it('uses the birth order number for twins', () => {
    const born = { year: 1990, month: 5, day: 10 };
    expect(
      order([
        person('second', { birth: born, birthOrder: 2 }),
        person('first', { birth: born, birthOrder: 1 }),
      ]),
    ).toEqual(['first', 'second']);
  });

  it('uses the birth order number when birth dates are unknown', () => {
    expect(
      order([
        person('x', { birthOrder: 3 }),
        person('y', { birthOrder: 1 }),
        person('z', { birthOrder: 2 }),
      ]),
    ).toEqual(['y', 'z', 'x']);
  });

  it('puts people without a birth year after those with one', () => {
    expect(order([person('unknown'), person('known', { birth: { year: 2001 } })])).toEqual([
      'known',
      'unknown',
    ]);
  });

  it('shows the eldest first in the chart layout too', () => {
    const g = buildGraph(
      [
        person('p'),
        person('young', { birth: { year: 2000 } }),
        person('old', { birth: { year: 1990 } }),
      ],
      [parent('p', 'young'), parent('p', 'old')],
    );
    const layout = layoutForest(buildForest(g));
    const x = (id: string) => layout.cards.find((c) => c.id === id)!.x;
    expect(x('old')).toBeLessThan(x('young'));
  });
});

describe('chart layout with cards of different widths', () => {
  it('never lets neighbouring cards overlap', () => {
    const widths: Record<string, number> = { kid1: 280, kid2: 120, mum: 220 };
    const layout = layoutForest(buildForest(family()), (id) => widths[id] ?? CARD_W);

    const rows = new Map<number, Array<{ x: number; w: number }>>();
    for (const c of layout.cards) rows.set(c.y, [...(rows.get(c.y) ?? []), { x: c.x, w: c.w }]);
    for (const row of rows.values()) {
      row.sort((a, b) => a.x - b.x);
      for (let i = 1; i < row.length; i++) {
        expect(row[i].x).toBeGreaterThanOrEqual(row[i - 1].x + row[i - 1].w);
      }
    }
  });

  it('records the width of each card', () => {
    const layout = layoutForest(buildForest(family()), (id) => (id === 'dad' ? 300 : CARD_W));
    expect(layout.cards.find((c) => c.id === 'dad')!.w).toBe(300);
    expect(layout.cards.find((c) => c.id === 'mum')!.w).toBe(CARD_W);
  });
});
