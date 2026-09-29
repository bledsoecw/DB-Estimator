/**
 * Prices that are off the cost-type policy on purpose.
 *
 * Every entry here is a decision someone made, recorded with who made it and
 * when. Without this the auditor has two bad options: flag a deliberate price
 * on every estimate forever, or widen a rule until it stops catching the thing
 * it was built for. Both end with a reviewer who has stopped reading.
 *
 * An exception is a statement about ONE catalog item, not a loosened rule. The
 * item stays exempt only while its price matches what was approved — change the
 * price and the exception stops applying, because what was approved is no
 * longer what is on the estimate.
 *
 * Entries are matched on the catalog item id where one is known, because names
 * get edited on the line: the estimate line called "Aluminum Soffit Install"
 * is catalog item "Vinyl Soffit Install".
 */

import { type Money, type Rate, moneyFromString, rateFromNumber } from '../money.ts';

export interface Exception {
  /** organizationCostItem id, when known. Matched first. */
  catalogItemId?: string;
  /** Catalog item name, as a fallback for items not yet seen on a line. */
  name?: string;
  /**
   * The approved multiplier — this price is right, do not raise it.
   * The exemption lapses if the price moves off it.
   */
  approvedAt?: Rate;
  /**
   * This item is priced from a different book than its cost type says, so
   * measure it against THIS instead of the cost-type policy.
   *
   * Not the same as approvedAt. An item with `measureAgainst` is still checked
   * and can still be found wrong — it is simply checked against the right
   * number. Aluminum Fascia Install is subcontracted, so it belongs at the
   * Subcontractor margin even though the line carries cost type Labor.
   */
  measureAgainst?: Rate;
  /** Approved unit cost, where the decision was about a specific price point. */
  unitCost?: Money;
  reason: string;
  decidedBy: string;
  decidedOn: string;
}

/** Construction Subcontractor policy: 30% margin. */
const SUB = rateFromNumber(1 / 0.7);
/** The roofing schedule, which Shawn maintains and which is not the cost types. */
const ROOFING = rateFromNumber(1.45);

export const EXCEPTIONS: Exception[] = [
  {
    catalogItemId: '22PCCDafayH8',
    name: 'Designer - Schematic',
    approvedAt: rateFromNumber(1.25),
    unitCost: moneyFromString('100'),
    reason: 'Design time is billed at a set rate, not at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    catalogItemId: '22PDa443H59U',
    name: 'Designer - Developmental',
    approvedAt: rateFromNumber(1.25),
    unitCost: moneyFromString('100'),
    reason: 'Design time is billed at a set rate, not at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    catalogItemId: '22PCCDaewQ5n',
    name: 'Designer - Con Docs',
    approvedAt: rateFromNumber(1.25),
    unitCost: moneyFromString('100'),
    reason: 'Design time is billed at a set rate, not at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'HOVER Complete - Simple',
    approvedAt: rateFromNumber(1.0),
    reason: 'Measurement report passed through at cost, on purpose.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },

  // --- Roofing-trade work inside a construction job ---------------------------
  //
  // Gutters and siding price from the roofing book wherever they appear, and a
  // construction job that includes them is not thereby mispriced. Who does the
  // work decides the cost type; which trade it is decides the book.
  //
  //   removal and rehang  -> DB crew   -> roofing schedule, x1.45
  //   installs            -> the sub   -> construction Subcontractor, x1.4286
  //
  // Listed per item rather than matched on "Remove" / "Rehang" / "Install" in
  // the name. A string test would quietly mis-sort the first item somebody
  // names differently, and would have no idea that the line reading "Aluminum
  // Soffit Install" is catalog item "Vinyl Soffit Install".
  {
    catalogItemId: '22PLm3w6734e',
    name: 'Gutter Rehang',
    approvedAt: ROOFING,
    reason: 'Gutter rehang is DB crew, priced from the roofing book.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    catalogItemId: '22PL8h6a8aFQ',
    name: 'Remove Vinyl Siding',
    approvedAt: ROOFING,
    reason: 'Siding removal is DB crew, priced from the roofing book.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    catalogItemId: '22PLkzertZt5',
    name: 'Aluminum Fascia Install',
    measureAgainst: SUB,
    reason: 'Fascia install is subcontracted — construction Subcontractor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    catalogItemId: '22PLm2GUPX5q',
    name: 'Vinyl Soffit Install',
    measureAgainst: SUB,
    reason: 'Soffit install is subcontracted — construction Subcontractor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
];

/** Tolerance on the approved multiplier, matching the rule's own cent tolerance. */
const TOLERANCE = 5_000n; // 0.005

export interface ExceptionMatch {
  exception: Exception;
}

/**
 * The approved exception for this line, or null.
 *
 * Returns null when the line's price has moved away from what was approved:
 * the decision was about a price, and a different price is a different
 * decision that nobody has made.
 */
export function entryFor(
  line: { catalogItemId: string | null; name: string },
): Exception | null {
  for (const e of EXCEPTIONS) {
    if (e.catalogItemId !== undefined) {
      if (e.catalogItemId === line.catalogItemId) return e;
      continue;
    }
    if (e.name !== undefined && e.name === line.name) return e;
  }
  return null;
}

/**
 * The approved exception for this line, or null.
 *
 * Returns null when the line's price has moved away from what was approved:
 * the decision was about a price, and a different price is a different
 * decision that nobody has made. Entries that only redirect which policy
 * applies (`measureAgainst`) never exempt anything.
 */
export function exceptionFor(
  line: { catalogItemId: string | null; name: string; multiplier: Rate | null },
): Exception | null {
  if (line.multiplier === null) return null;
  const e = entryFor(line);
  if (!e || e.approvedAt === undefined) return null;
  const drift = line.multiplier - e.approvedAt;
  if ((drift < 0n ? -drift : drift) > TOLERANCE) return null; // price moved; no longer approved
  return e;
}

/** The multiplier this item should be measured against, when not its cost type's. */
export function policyOverrideFor(
  line: { catalogItemId: string | null; name: string },
): Rate | null {
  return entryFor(line)?.measureAgainst ?? null;
}
