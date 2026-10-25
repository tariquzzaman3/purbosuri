import type { UnitNode } from './graph';
import type { Person } from './types';

export const CARD_W = 150;
export const CARD_H = 62;
/** Vertical space between a person and the row of their spouses below. */
const SPOUSE_DROP = 34;
const SIBLING_GAP = 26;
const ROOT_GAP = 56;
const LEVEL_GAP = 66;

/** Width of one person's card. The chart passes widths measured from the names. */
export type WidthOf = (personId: string) => number;

export interface PlacedCard {
  id: string;
  x: number;
  w: number;
  y: number;
  gen: number;
  isSpouse: boolean;
  /** For a spouse: the person whose box this one hangs from. */
  partnerOf?: string;
}

export interface ChartLayout {
  cards: PlacedCard[];
  /** Elbow connectors from each parent (or spouse) down to each of their children. */
  childLines: Array<{ points: string }>;
  /** Short connectors from a person down to each of their spouses. */
  spouseLines: Array<{ points: string }>;
  width: number;
  height: number;
}

/** One column under a person: a spouse (box and their children) or the person's own children. */
interface Slot {
  /** The spouse shown in this slot; absent for the person's own children. */
  spouse?: Person;
  spouseW: number;
  kids: Measured[];
  kidsWidth: number;
  width: number;
}

interface Measured {
  node: UnitNode;
  personW: number;
  slots: Slot[];
  slotsWidth: number;
  width: number;
  hasSpouses: boolean;
}

function measure(node: UnitNode, widthOf: WidthOf): Measured {
  const slots: Slot[] = [];
  const makeSlot = (spouse: Person | undefined, ownerId: string): Slot | null => {
    const kids = node.children.filter((k) => (k.fromId ?? node.person.id) === ownerId).map((k) => measure(k, widthOf));
    if (!spouse && kids.length === 0) return null;
    const kidsWidth = kids.length
      ? kids.reduce((s, k) => s + k.width, 0) + SIBLING_GAP * (kids.length - 1)
      : 0;
    const spouseW = spouse ? widthOf(spouse.id) : 0;
    return { spouse, spouseW, kids, kidsWidth, width: Math.max(spouseW, kidsWidth) };
  };
  for (const s of node.spouses) {
    const slot = makeSlot(s, s.id);
    if (slot) slots.push(slot);
  }
  const own = makeSlot(undefined, node.person.id);
  if (own) slots.push(own);

  const slotsWidth = slots.length
    ? slots.reduce((sum, sl) => sum + sl.width, 0) + SIBLING_GAP * (slots.length - 1)
    : 0;
  const personW = widthOf(node.person.id);
  return {
    node,
    personW,
    slots,
    slotsWidth,
    width: Math.max(personW, slotsWidth),
    hasSpouses: node.spouses.length > 0,
  };
}

/**
 * Lays the forest out top to bottom. A person's spouses sit in their own boxes just below
 * the person, and each child's line runs down from the parent it belongs to, so the
 * children of different spouses are never mixed up. Sibling subtrees never overlap.
 */
export function layoutForest(forest: UnitNode[], widthOf: WidthOf = () => CARD_W): ChartLayout {
  const cards: PlacedCard[] = [];
  const childLines: Array<{ points: string }> = [];
  const spouseLines: Array<{ points: string }> = [];

  const measured = forest.map((n) => measure(n, widthOf));

  // Rows are shared by a whole generation; a row is taller when anyone in it has spouses.
  const rowHasSpouses: boolean[] = [];
  const walk = (m: Measured, depth: number) => {
    rowHasSpouses[depth] = rowHasSpouses[depth] === true || m.hasSpouses;
    for (const sl of m.slots) for (const k of sl.kids) walk(k, depth + 1);
  };
  measured.forEach((m) => walk(m, 0));
  const rowH = rowHasSpouses.map((h) => (h ? CARD_H + SPOUSE_DROP + CARD_H : CARD_H));
  const rowY: number[] = [];
  rowH.forEach((_h, d) => {
    rowY[d] = d === 0 ? 0 : rowY[d - 1] + rowH[d - 1] + LEVEL_GAP;
  });

  const elbow = (x1: number, y1: number, x2: number, y2: number, midY: number) =>
    `${x1},${y1} ${x1},${midY} ${x2},${midY} ${x2},${y2}`;

  const place = (m: Measured, left: number, depth: number) => {
    const y = rowY[depth];
    const personX = left + (m.width - m.personW) / 2;
    const personCx = personX + m.personW / 2;
    cards.push({ id: m.node.person.id, x: personX, w: m.personW, y, gen: m.node.gen, isSpouse: false });

    const spouseY = y + CARD_H + SPOUSE_DROP;
    const dropMid = y + CARD_H + SPOUSE_DROP / 2;
    const kidTop = depth + 1 < rowY.length ? rowY[depth + 1] : y + CARD_H + LEVEL_GAP;

    let slotLeft = left + (m.width - m.slotsWidth) / 2;
    for (const sl of m.slots) {
      const slotCx = slotLeft + sl.width / 2;
      let fromX = personCx;
      let fromY = y + CARD_H;

      if (sl.spouse) {
        const sx = slotCx - sl.spouseW / 2;
        cards.push({
          id: sl.spouse.id,
          x: sx,
          w: sl.spouseW,
          y: spouseY,
          gen: m.node.gen,
          isSpouse: true,
          partnerOf: m.node.person.id,
        });
        spouseLines.push({ points: elbow(personCx, y + CARD_H, slotCx, spouseY, dropMid) });
        fromX = slotCx;
        fromY = spouseY + CARD_H;
      }

      let cursor = slotLeft + (sl.width - sl.kidsWidth) / 2;
      for (const kid of sl.kids) {
        const kidCx = cursor + kid.width / 2;
        // A person's own children (no recorded spouse as the other parent) hang from the
        // person, passing through the empty space beside the spouse boxes.
        const mid = sl.spouse || !m.hasSpouses ? (fromY + kidTop) / 2 : dropMid;
        childLines.push({ points: elbow(fromX, fromY, kidCx, kidTop, mid) });
        place(kid, cursor, depth + 1);
        cursor += kid.width + SIBLING_GAP;
      }
      slotLeft += sl.width + SIBLING_GAP;
    }
  };

  let cursor = 0;
  measured.forEach((m, i) => {
    place(m, cursor, 0);
    cursor += m.width + (i < measured.length - 1 ? ROOT_GAP : 0);
  });

  const last = rowY.length - 1;
  return {
    cards,
    childLines,
    spouseLines,
    width: Math.max(cursor, CARD_W),
    height: last >= 0 ? rowY[last] + rowH[last] : CARD_H,
  };
}
