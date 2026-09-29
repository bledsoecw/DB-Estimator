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

import { type Money, type Rate, rateFromNumber } from '../money.ts';

export interface Exception {
  /** organizationCostItem id, when known. Matched first. */
  catalogItemId?: string;
  /** Catalog item name, as a fallback for items not yet seen on a line. */
  name?: string;
  /**
   * A CLASS of items, by name prefix, when the decision is about all of them.
   *
   * "Sub-supplied fasteners carry a 40% margin" is one decision covering
   * seventeen catalog items and every fastener added after them. Listing ids
   * would need updating each time and would miss the eighteenth. A prefix is
   * what Carl actually means — and the price check still applies to every
   * match, so an item in the class priced at some other rate is not covered.
   *
   * Prefixes are matched case-insensitively. An id or exact-name entry always
   * wins over a prefix, so a single item can be carved out of its class.
   */
  namePrefix?: string;
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
  // --- Classes: one decision, every item it covers -----------------------------
  {
    namePrefix: 'Designer',
    approvedAt: rateFromNumber(1.25),
    reason: 'Design time is billed at a set rate, not at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    namePrefix: 'HOVER',
    approvedAt: rateFromNumber(1.0),
    reason: 'Measurement reports are passed through at cost.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    namePrefix: 'Fastener',
    approvedAt: rateFromNumber(5 / 3),
    reason:
      'Fasteners are bought through the subcontractor, so they carry a 40% margin ' +
      'rather than the Materials 31.03%.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },

  // --- Decided on 2026-09-29 from the first full catalog audit ---------------
  //
  // 718 items, 74 off the cost-type defaults. Carl walked the groups. These are
  // the ones that are priced the way they are on purpose; the rest he fixed.
  {
    namePrefix: 'Service Call',
    approvedAt: rateFromNumber(125 / 55),
    reason: 'Service calls are a trip-charge schedule by zone, not hourly labour at the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    namePrefix: 'Payment processing',
    approvedAt: rateFromNumber(0),
    reason: 'Card fees are recorded as a cost and not charged to the customer — DB absorbs them, for now.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    namePrefix: 'Install SS Steel Panel',
    approvedAt: rateFromNumber(1.8),
    reason: 'Steep-pitch standing-seam install carries a premium; the shallow pitches sit at the Subcontractor margin and never reach this entry.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'Logistical Management',
    approvedAt: rateFromNumber(1.45),
    reason: 'Priced at 45% markup on purpose — the catalog item\'s own note says "$65 with 45% markup".',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  // Warranties: three deliberate rates, so one entry per name rather than a class.
  {
    name: '20 YR Warranty',
    approvedAt: rateFromNumber(2.4),
    reason: 'Warranty registration priced on its own schedule.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'Platinum Metals 20 Warranty',
    approvedAt: rateFromNumber(2.4),
    reason: 'Warranty registration priced on its own schedule.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'OC Upgrd Warranty - Preferred',
    approvedAt: rateFromNumber(2.5),
    reason: 'Warranty registration priced on its own schedule.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'OC Upgrd Warranty - System',
    approvedAt: rateFromNumber(7 / 3),
    reason: 'Warranty registration priced on its own schedule.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  // Tarps: storm response with adders, three rates.
  {
    name: 'Tarp Installed - per square',
    approvedAt: rateFromNumber(5 / 3),
    reason: 'Emergency tarping is its own schedule.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'Tarp Installed - after hours or weekend, per square',
    approvedAt: rateFromNumber(1.76),
    reason: 'Emergency tarping, after-hours adder.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'Tarp - steep or two-story adder, per square',
    approvedAt: rateFromNumber(2.0),
    reason: 'Emergency tarping, steep or two-storey adder.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  // Roofing labour items with a premium or on the roofing schedule.
  {
    name: 'Cricket Lab - Average',
    approvedAt: rateFromNumber(1.78),
    reason: 'Cricket fabrication carries a premium over the Labor margin.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'Fill Box Vent(s)',
    approvedAt: rateFromNumber(1.45),
    reason: 'Roofing labour priced on the roofing schedule.',
    decidedBy: 'Carl Bledsoe',
    decidedOn: '2026-09-29',
  },
  {
    name: 'Ridgevent - Cut',
    approvedAt: rateFromNumber(1.45),
    reason: 'Roofing labour priced on the roofing schedule.',
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
  // Both of these were reclassified to Subcontractor in the catalog on
  // 2026-09-29, and Subcontractor now prices at x1.45 — so the catalog says
  // what these entries say, and new estimates need neither. They stay because
  // estimates written before that date carry cost type Labor on the line, and
  // against the Labor margin x1.45 still reads as off policy.
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
  // 'Aluminum Fascia Install' and 'Vinyl Soffit Install' were listed here with
  // measureAgainst: SUB, on the strength of a read of the estimate lines. The
  // catalog says otherwise, and the catalog is the truth:
  //
  //   Aluminum Fascia Install   $4.00 -> $7.27   45% margin   Labor
  //   Fascia and Soffit Install $4.50 -> $6.43   30% margin   Subcontractor
  //
  // Two different items. Fascia install is DB crew at the Labor margin and
  // needs no entry at all; "Fascia and Soffit Install" is the subcontracted
  // one and is already at 30%. Both were right before I touched them.
  //
  // What the estimate line actually showed was drift FROM the catalog — the
  // line read $7.20 against a catalog price of $7.27 — which is a different
  // finding this auditor cannot yet make, because it never reads the catalog.
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
  list: Exception[] = EXCEPTIONS,
): Exception | null {
  // Specific before general: an id or an exact name beats a prefix, so one
  // item can be carved out of its class.
  for (const e of list) {
    if (e.catalogItemId !== undefined) {
      if (e.catalogItemId === line.catalogItemId) return e;
      continue;
    }
    if (e.name !== undefined && e.name === line.name) return e;
  }
  const lower = line.name.trim().toLowerCase();
  for (const e of list) {
    if (e.namePrefix !== undefined && lower.startsWith(e.namePrefix.toLowerCase())) return e;
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
  list: Exception[] = EXCEPTIONS,
): Exception | null {
  if (line.multiplier === null) return null;
  const e = entryFor(line, list);
  if (!e || e.approvedAt === undefined) return null;
  const drift = line.multiplier - e.approvedAt;
  if ((drift < 0n ? -drift : drift) > TOLERANCE) return null; // price moved; no longer approved
  return e;
}

/** The multiplier this item should be measured against, when not its cost type's. */
export function policyOverrideFor(
  line: { catalogItemId: string | null; name: string },
  list: Exception[] = EXCEPTIONS,
): Rate | null {
  return entryFor(line, list)?.measureAgainst ?? null;
}
