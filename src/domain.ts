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
import type {
  ApiBudget, ApiBudgetRef, ApiCatalogItem, ApiComparable, ApiCostType, ApiDocument, AuditFixture,
} from './jobtread/types.ts';
import { jobTypeOf } from './jobtread/queries.ts';

/** The job-budget line a document line was built from. */
export interface BudgetLine {
  id: string;
  name: string;
  quantity: bigint | null;
  unitCost: Money;
  unitPrice: Money;
  cost: Money;
  price: Money;
  /** null when not captured. A blank description on the wire reads as "". */
  description: string | null;
}

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
  /** null when not captured. A blank description on the wire reads as "". */
  description: string | null;
  /** The budget line this one was built from; null when not linked, or not captured. */
  budget: BudgetLine | null;
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
  /** "Construction" | "Roofing" | null. Decides which policy applies at all. */
  jobType: string | null;
  createdAt: string;
  /** Totals as JobTread stores them. */
  statedPrice: Money;
  /** Stored total including tax. The difference from statedPrice is the tax charged. */
  statedPriceWithTax: Money;
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

/** A catalog item, as the price of record for one thing. */
export interface CatalogItem {
  id: string;
  name: string;
  unitCost: Money;
  unitPrice: Money;
  costTypeId: string | null;
  costTypeName: string | null;
  costCodeName: string | null;
  /**
   * "Parent › Group" when the item is a line inside a catalog cost group, i.e.
   * a template; null for an ungrouped item. Where to click to find it.
   */
  groupPath: string | null;
  /** unitPrice / unitCost, or null when cost is zero or missing. */
  multiplier: Rate | null;
}

/** One line of the job budget. */
export interface BudgetItem {
  id: string;
  name: string;
  quantity: bigint | null;
  unitCost: Money;
  unitPrice: Money;
  cost: Money;
  price: Money;
  isSpecification: boolean;
  costTypeName: string;
  catalogItemId: string | null;
  /** Group names from the line's own group up to the root of the budget. */
  groupPath: string[];
  /** Document lines built from this budget line, on any document of the job. */
  documentLines: number;
}

/**
 * The job budget: every cost item on the job that sits on no document.
 *
 * Documents are built from it, and edits to it do not flow to a document
 * already built — which is what the budget-drift rule checks.
 */
export interface Budget {
  jobId: string;
  lines: BudgetItem[];
}

export interface AuditInput {
  estimate: Estimate;
  policy: Policy;
  comparables: Comparable[];
  /**
   * The catalog behind the lines, keyed by catalog item id.
   *
   * EMPTY means "not fetched", not "no catalog" — fixtures captured before the
   * catalog check existed carry none. Rules must treat an empty map as "cannot
   * check", never as "everything matches".
   */
  catalog: Map<string, CatalogItem>;
  /** null when the fixture predates the budget check. Never a reason to raise drift. */
  budget: Budget | null;
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
      description: descriptionFromApi(i.description),
      budget: i.jobCostItem ? toBudgetLine(i.jobCostItem) : null,
    };
  });

  return {
    id: doc.id,
    name: doc.name,
    type: doc.type,
    status: doc.status,
    jobId: doc.job.id,
    jobName: doc.job.name,
    jobType: jobTypeOf(doc.job),
    createdAt: doc.createdAt,
    statedPrice: moneyFromApi(doc.price),
    statedPriceWithTax: moneyFromApi(doc.priceWithTax),
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

export function toCatalog(rows: ApiCatalogItem[]): Map<string, CatalogItem> {
  const out = new Map<string, CatalogItem>();
  for (const r of rows) {
    const unitCost = moneyFromApi(r.unitCost);
    const unitPrice = moneyFromApi(r.unitPrice);
    out.set(r.id, {
      id: r.id,
      name: r.name,
      unitCost,
      unitPrice,
      costTypeId: r.costType?.id ?? null,
      costTypeName: r.costType?.name ?? null,
      costCodeName: r.costCode?.name ?? null,
      groupPath: r.costGroup
        ? [r.costGroup.parentCostGroup?.name, r.costGroup.name].filter(Boolean).join(' \u203a ')
        : null,
      multiplier: observedMultiplier(unitCost, unitPrice),
    });
  }
  return out;
}

/** undefined (never fetched) stays unknown; the wire's null (blank) reads as "". */
function descriptionFromApi(v: string | null | undefined): string | null {
  return v === undefined ? null : (v ?? '');
}

function toBudgetLine(b: ApiBudgetRef): BudgetLine {
  return {
    id: b.id,
    name: b.name,
    quantity: b.quantity === null || b.quantity === undefined ? null : qtyFromApi(b.quantity),
    unitCost: moneyFromApi(b.unitCost),
    unitPrice: moneyFromApi(b.unitPrice),
    cost: moneyFromApi(b.cost),
    price: moneyFromApi(b.price),
    description: descriptionFromApi(b.description),
  };
}

export function toBudget(b: ApiBudget): Budget {
  const groups = new Map(b.costGroups.nodes.map((g) => [g.id, g]));

  // Nearest group first, then its parents. A group missing from the captured
  // list — it should not happen, the connection is paginated — falls back to
  // the name the line itself carries, so a template line is still recognised.
  const pathOf = (groupId: string | null, ownName: string | null): string[] => {
    const out: string[] = [];
    const seen = new Set<string>();
    let id = groupId;
    while (id && !seen.has(id)) {
      seen.add(id);
      const g = groups.get(id);
      if (!g) {
        if (out.length === 0 && ownName !== null) out.push(ownName);
        break;
      }
      out.push(g.name);
      id = g.parentCostGroup?.id ?? null;
    }
    return out;
  };

  return {
    jobId: b.jobId,
    lines: b.costItems.nodes.map((i) => ({
      id: i.id,
      name: i.name,
      quantity: i.quantity === null || i.quantity === undefined ? null : qtyFromApi(i.quantity),
      unitCost: moneyFromApi(i.unitCost),
      unitPrice: moneyFromApi(i.unitPrice),
      cost: moneyFromApi(i.cost),
      price: moneyFromApi(i.price),
      isSpecification: i.isSpecification,
      costTypeName: i.costType.name,
      catalogItemId: i.organizationCostItem?.id ?? null,
      groupPath: pathOf(i.costGroup?.id ?? null, i.costGroup?.name ?? null),
      documentLines: i.documentCostItems.count,
    })),
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
    catalog: toCatalog(f.catalog ?? []),
    budget: f.budget ? toBudget(f.budget) : null,
    capturedAt: f.capturedAt,
  };
}
