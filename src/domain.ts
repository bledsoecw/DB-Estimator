/**
 * The domain the rules see.
 *
 * This is the boundary where JobTread's floats become exact Money and never go
 * back. Rules take an Estimate and a Policy and return Findings; they do no I/O
 * and no float arithmetic, which is what makes them testable against a frozen
 * fixture and cheap to run on every estimate.
 */

import {
  type Money, type Rate, ZERO,
  add, moneyFromApi, mulQty, multiplierFromMargin, observedMultiplier,
  qtyFromApi, rateFromApi, roundToCents, sub,
} from './money.ts';
import type { ApiComparable, ApiCostType, ApiDocument, AuditFixture } from './jobtread/types.ts';

export interface Line {
  id: string;
  name: string;
  /** null means the field was blank, which is different from zero. */
  quantity: bigint | null;
  unitCost: Money;
  unitPrice: Money;
  /** Extension as JobTread stores it. */
  cost: Money;
  price: Money;
  /** Extension as we compute it: unitPrice * quantity, rounded to cents once. */
  computedPrice: Money;
  computedCost: Money;
  isTaxable: boolean;
  isSpecification: boolean;
  globalId: string | null;
  quantityFormula: string | null;
  unitName: string | null;
  costTypeId: string;
  costTypeName: string;
  costCodeName: string;
  groupId: string | null;
  catalogItemId: string | null;
  /** Observed unitPrice / unitCost, or null when cost is zero. */
  multiplier: Rate | null;
}

export interface Group {
  id: string;
  name: string;
  parentId: string | null;
  isSelectionGroup: boolean;
  minSelections: number | null;
  maxSelections: number | null;
}

export interface Estimate {
  id: string;
  name: string;
  type: string;
  status: string;
  jobId: string;
  jobName: string;
  createdAt: string;
  /** Totals as JobTread stores them. */
  statedPrice: Money;
  statedCost: Money;
  taxRate: Rate;
  externalId: string | null;
  showChildCosts: boolean;
  showQuantity: boolean;
  showProfit: boolean;
  requireSignature: boolean;
  includeInBudget: boolean;
  lines: Line[];
  groups: Group[];
  groupsById: Map<string, Group>;
}

/** The org's markup policy, read live from JobTread cost types. */
export interface Policy {
  byCostTypeId: Map<string, { name: string; margin: Rate; multiplier: Rate; isTaxable: boolean }>;
}

export interface Comparable {
  jobName: string;
  price: Money;
  cost: Money;
  /** Gross margin in millionths. */
  margin: Rate;
}

export interface AuditInput {
  estimate: Estimate;
  policy: Policy;
  comparables: Comparable[];
  capturedAt: string;
}

export function toPolicy(costTypes: ApiCostType[]): Policy {
  const byCostTypeId = new Map<
    string,
    { name: string; margin: Rate; multiplier: Rate; isTaxable: boolean }
  >();
  for (const ct of costTypes) {
    if (ct.margin === null || ct.margin === undefined) continue;
    const margin = rateFromApi(ct.margin);
    // Clock In carries margin 0 — a real policy, not a missing one.
    byCostTypeId.set(ct.id, {
      name: ct.name,
      margin,
      multiplier: multiplierFromMargin(margin),
      isTaxable: ct.isTaxable,
    });
  }
  return { byCostTypeId };
}

export function toEstimate(doc: ApiDocument): Estimate {
  const groups: Group[] = doc.costGroups.nodes.map((g) => ({
    id: g.id,
    name: g.name,
    parentId: g.parentCostGroup?.id ?? null,
    // A group that constrains how many children may be chosen is an options
    // group. JobTread exposes the constraint but not, on the wire, which branch
    // won — see the selection-reconciliation rule.
    isSelectionGroup: g.minSelectionsRequired !== null || g.maxSelectionsAllowed !== null,
    minSelections: g.minSelectionsRequired,
    maxSelections: g.maxSelectionsAllowed,
  }));

  const lines: Line[] = doc.costItems.nodes.map((i) => {
    const unitCost = moneyFromApi(i.unitCost);
    const unitPrice = moneyFromApi(i.unitPrice);
    const quantity = i.quantity === null || i.quantity === undefined ? null : qtyFromApi(i.quantity);
    const q = quantity ?? 0n;
    return {
      id: i.id,
      name: i.name,
      quantity,
      unitCost,
      unitPrice,
      cost: moneyFromApi(i.cost),
      price: moneyFromApi(i.price),
      computedCost: roundToCents(mulQty(unitCost, q)),
      computedPrice: roundToCents(mulQty(unitPrice, q)),
      isTaxable: i.isTaxable,
      isSpecification: i.isSpecification,
      globalId: i.globalId,
      quantityFormula: i.quantityFormula,
      unitName: i.unit?.name ?? null,
      costTypeId: i.costType.id,
      costTypeName: i.costType.name,
      costCodeName: i.costCode.name,
      groupId: i.costGroup?.id ?? null,
      catalogItemId: i.organizationCostItem?.id ?? null,
      multiplier: observedMultiplier(unitCost, unitPrice),
    };
  });

  return {
    id: doc.id,
    name: doc.name,
    type: doc.type,
    status: doc.status,
    jobId: doc.job.id,
    jobName: doc.job.name,
    createdAt: doc.createdAt,
    statedPrice: moneyFromApi(doc.price),
    statedCost: moneyFromApi(doc.cost),
    taxRate: rateFromApi(doc.taxRate),
    externalId: doc.externalId,
    showChildCosts: doc.showChildCosts,
    showQuantity: doc.showQuantity,
    showProfit: doc.showProfit,
    requireSignature: doc.requireSignature,
    includeInBudget: doc.includeInBudget,
    lines,
    groups,
    groupsById: new Map(groups.map((g) => [g.id, g])),
  };
}

export function toComparables(rows: ApiComparable[]): Comparable[] {
  return rows.map((r) => {
    const price = moneyFromApi(r.price);
    const cost = moneyFromApi(r.cost);
    return {
      jobName: r.job.name,
      price,
      cost,
      margin: price === ZERO ? (0n as Rate) : marginOf(price, cost),
    };
  });
}

/** Gross margin of a price/cost pair, in millionths. */
export function marginOf(price: Money, cost: Money): Rate {
  if (price === ZERO) return 0n as Rate;
  return ((sub(price, cost) * 1_000_000n) / price) as Rate;
}

export function sumLinePrices(lines: Line[]): Money {
  return lines.reduce((acc, l) => add(acc, l.price), ZERO);
}

export function sumLineCosts(lines: Line[]): Money {
  return lines.reduce((acc, l) => add(acc, l.cost), ZERO);
}

/** Walk a group's ancestry, nearest first. */
export function ancestorsOf(estimate: Estimate, groupId: string | null): Group[] {
  const out: Group[] = [];
  const seen = new Set<string>();
  let id = groupId;
  while (id) {
    if (seen.has(id)) break; // cycle guard — malformed data must not hang the audit
    seen.add(id);
    const g = estimate.groupsById.get(id);
    if (!g) break;
    out.push(g);
    id = g.parentId;
  }
  return out;
}

export function fromFixture(f: AuditFixture): AuditInput {
  return {
    estimate: toEstimate(f.document),
    policy: toPolicy(f.costTypes),
    comparables: toComparables(f.comparables),
    capturedAt: f.capturedAt,
  };
}
