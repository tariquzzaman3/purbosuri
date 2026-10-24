import type { UnitNode } from './graph';

export const CARD_W = 150;
export const CARD_H = 62;
const SPOUSE_GAP = 12;
const SIBLING_GAP = 26;
const ROOT_GAP = 56;
const LEVEL_GAP = 66;

export interface PlacedCard {
  id: string;
  x: number;
  y: number;
  gen: number;
  isSpouse: boolean;
}

export interface Line {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ChartLayout {
  cards: PlacedCard[];
  /** Elbow connectors from a family unit down to each child unit. */
  childLines: Array<{ points: string }>;
  spouseLines: Line[];
  width: number;
  height: number;
}

interface Measured {
  node: UnitNode;
  unitWidth: number;
  kidsWidth: number;
  width: number;
  kids: Measured[];
}

function measure(node: UnitNode): Measured {
  const count = 1 + node.spouses.length;
  const unitWidth = count * CARD_W + (count - 1) * SPOUSE_GAP;
  const kids = node.children.map(measure);
  const kidsWidth = kids.length
    ? kids.reduce((s, k) => s + k.width, 0) + SIBLING_GAP * (kids.length - 1)
    : 0;
  return { node, unitWidth, kidsWidth, width: Math.max(unitWidth, kidsWidth), kids };
}

/**
 * Lays the forest out top to bottom. Each family unit is centred over its children,
 * and sibling subtrees never overlap.
 */
export function layoutForest(forest: UnitNode[]): ChartLayout {
  const cards: PlacedCard[] = [];
  const childLines: Array<{ points: string }> = [];
  const spouseLines: Line[] = [];
  let maxDepth = 0;

  const place = (m: Measured, left: number, depth: number): number => {
    maxDepth = Math.max(maxDepth, depth);
    const y = depth * (CARD_H + LEVEL_GAP);
    const unitLeft = left + (m.width - m.unitWidth) / 2;
    const unitCenter = left + m.width / 2;

    const members = [m.node.person, ...m.node.spouses];
    members.forEach((person, i) => {
      const x = unitLeft + i * (CARD_W + SPOUSE_GAP);
      cards.push({ id: person.id, x, y, gen: m.node.gen, isSpouse: i > 0 });
      if (i > 0) {
        spouseLines.push({
          x1: x - SPOUSE_GAP,
          y1: y + CARD_H / 2,
          x2: x,
          y2: y + CARD_H / 2,
        });
      }
    });

    let cursor = left + (m.width - m.kidsWidth) / 2;
    for (const kid of m.kids) {
      const kidCenter = cursor + kid.width / 2;
      const y1 = y + CARD_H;
      const y2 = y + CARD_H + LEVEL_GAP;
      const mid = (y1 + y2) / 2;
      childLines.push({ points: `${unitCenter},${y1} ${unitCenter},${mid} ${kidCenter},${mid} ${kidCenter},${y2}` });
      place(kid, cursor, depth + 1);
      cursor += kid.width + SIBLING_GAP;
    }

    return m.width;
  };

  let cursor = 0;
  const measured = forest.map(measure);
  measured.forEach((m, i) => {
    place(m, cursor, 0);
    cursor += m.width + (i < measured.length - 1 ? ROOT_GAP : 0);
  });

  return {
    cards,
    childLines,
    spouseLines,
    width: Math.max(cursor, CARD_W),
    height: (maxDepth + 1) * (CARD_H + LEVEL_GAP) - LEVEL_GAP,
  };
}
