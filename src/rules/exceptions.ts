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
  /** The approved multiplier. The exemption lapses if the price moves off it. */
  multiplier: Rate;
  /** Approved unit cost, where the decision was about a specific price point. */
  unitCost?: Money;
  reason: string;
  decidedBy: string;
  decidedOn: string;
}

export const EXCEPTIONS: Exception[] = [
  {
    catalogItemId: '22PCCDafayH8',
    name: 'Designer - Schematic',
    multiplier: rateFromNumber(1.25),
    unitCost: moneyFromString('100'),
    reason: 'Design time is billed at a set rate, not at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    catalogItemId: '22PDa443H59U',
    name: 'Designer - Developmental',
    multiplier: rateFromNumber(1.25),
    unitCost: moneyFromString('100'),
    reason: 'Design time is billed at a set rate, not at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    catalogItemId: '22PCCDaewQ5n',
    name: 'Designer - Con Docs',
    multiplier: rateFromNumber(1.25),
    unitCost: moneyFromString('100'),
    reason: 'Design time is billed at a set rate, not at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'HOVER Complete - Simple',
    multiplier: rateFromNumber(1.0),
    reason: 'Measurement report passed through at cost, on purpose.',
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
export function exceptionFor(
  line: { catalogItemId: string | null; name: string; multiplier: Rate | null },
): Exception | null {
  if (line.multiplier === null) return null;
  for (const e of EXCEPTIONS) {
    const matches =
      (e.catalogItemId !== undefined && e.catalogItemId === line.catalogItemId) ||
      (e.catalogItemId === undefined && e.name !== undefined && e.name === line.name);
    if (!matches) continue;
    const drift = line.multiplier - e.multiplier;
    if ((drift < 0n ? -drift : drift) > TOLERANCE) return null; // price moved; no longer approved
    return e;
  }
  return null;
}
