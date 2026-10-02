/**
 * Contingency: the one line every construction budget carries that no site
 * visit produces.
 *
 * Decided 28 Sep 2026 (docs/preconstruction-redesign.md §9, decision 2, on
 * the zen-fermat branch): contingency is a visible line, priced at cost, at
 * 5% when everything stays in place, 8% for a remodel where anything moves,
 * 10% for additions, structural work or an older home with hidden
 * conditions. Unforeseen conditions draw on it first; the unused balance is
 * credited at closeout. Carl, 30 Sep 2026: add it to every construction
 * budget template below Phase 4, as a new group.
 *
 * In JobTread the line is a template line like any other: it points at one
 * ungrouped catalog item (`Project Contingency`, $1.00 cost, $1.00 price, a
 * Lump Sum) and carries a quantity formula on two job parameters, so the
 * quantity IS the dollar amount:
 *
 *     {Contingency Base} * {Contingency Rate} / 100
 *
 * JobTread creates a parameter a formula names when the template is added
 * (job 25-0003 carries `Depth` with no value for exactly that reason), and
 * its formulas cannot sum the rest of the budget, so the rep types the base
 * — the drafter prints it. Two helpers here: `planContingency` says what
 * each template needs, `contingencyMutation` is the exact write.
 */

import { type Money, ZERO, mulRate, rateFromNumber, roundToCents } from '../money.ts';
import type { Reader } from '../jobtread/queries.ts';
import { isContingencyLine, type Template, type TemplateGroup, type TemplateLine } from './templates.ts';

export const CONTINGENCY_GROUP = 'Phase 5 - Contingency';
export const CONTINGENCY_LINE = 'Project Contingency';
export const CONTINGENCY_FORMULA = '{Contingency Base} * {Contingency Rate} / 100';
export const CONTINGENCY_PARAMETERS = { rate: 'Contingency Rate', base: 'Contingency Base' } as const;

/** The three rates the policy allows, as whole percents. */
export const CONTINGENCY_RATES = [5, 8, 10] as const;
export type ContingencyRate = (typeof CONTINGENCY_RATES)[number];
export const DEFAULT_CONTINGENCY_RATE: ContingencyRate = 8;

export const CONTINGENCY_DESCRIPTION =
  'Contingency for unforeseen conditions, carried as its own visible line and priced at cost ' +
  '(decided 28 Sep 2026): unforeseen conditions draw on it first, and any unused balance is credited ' +
  'to the customer at closeout. The quantity is the dollar amount, from two job parameters: ' +
  'Contingency Rate (5 when everything stays in place; 8 for a remodel where anything moves; 10 for ' +
  "additions, structural work, or an older home with hidden conditions) and Contingency Base (the budget's " +
  'cost total before this line, in dollars). Quantity = Base x Rate / 100 at $1.00 per unit.';

export const CONTINGENCY_GROUP_DESCRIPTION =
  'Project contingency, a visible line at cost. Set the job parameters Contingency Rate (5 / 8 / 10) ' +
  "and Contingency Base (the budget's cost total before this line).";

/** The catalog objects the line points at, by name; resolved from the organization at run time. */
export interface ContingencyIds {
  /** The ungrouped catalog item `Project Contingency`, $1.00 / $1.00. */
  organizationCostItemId: string;
  unitId: string;
  costTypeId: string;
  costCodeId: string;
}

export const CONTINGENCY_NAMES = {
  unit: 'Lump Sum',
  costType: 'Other',
  costCode: 'General Requirements',
} as const;

/**
 * DB's contingency policy, as the conditions the evidence can show and the
 * rate each calls for. The highest wins. Carl, 2026-10-02, on 25-0000: two
 * runs on the same basement gave 8% and 10%, because the walls come off
 * (8) and the walls are cracked, stained and peeling (10) were weighed
 * differently. An older home with signs of more to find is 10, every time.
 * So the model names the conditions and the code applies the rate.
 */
export const CONTINGENCY_CONDITIONS = {
  'in-kind': 5,
  'something-moves': 8,
  'stripped-to-substrate': 8,
  'addition': 10,
  'structural': 10,
  'older-home-hidden-conditions': 10,
} as const satisfies Record<string, ContingencyRate>;
export type ContingencyCondition = keyof typeof CONTINGENCY_CONDITIONS;
export const CONTINGENCY_CONDITION_NAMES = Object.keys(CONTINGENCY_CONDITIONS) as [ContingencyCondition, ...ContingencyCondition[]];

/** How each condition reads on the page. */
export const CONTINGENCY_CONDITION_LABELS: Record<ContingencyCondition, string> = {
  'in-kind': 'replaced in kind, nothing moves',
  'something-moves': 'something moves',
  'stripped-to-substrate': 'finish stripped to the substrate',
  'addition': 'an addition',
  'structural': 'structural work',
  'older-home-hidden-conditions': 'older home, more hidden conditions likely',
};

/** The rate for the conditions the evidence shows: the highest any calls for. With none named, the model's number, snapped. */
export function rateForConditions(conditions: readonly ContingencyCondition[] | undefined, fallback?: number | null): ContingencyRate {
  const known = (conditions ?? []).filter((c) => c in CONTINGENCY_CONDITIONS);
  if (!known.length) return chooseRate(fallback);
  return Math.max(...known.map((c) => CONTINGENCY_CONDITIONS[c])) as ContingencyRate;
}

/** Snap whatever the model said to the nearest rate the policy allows. */
export function chooseRate(n: number | null | undefined): ContingencyRate {
  if (n === null || n === undefined || !Number.isFinite(n)) return DEFAULT_CONTINGENCY_RATE;
  let best: ContingencyRate = CONTINGENCY_RATES[0];
  for (const r of CONTINGENCY_RATES) if (Math.abs(r - n) < Math.abs(best - n)) best = r;
  return best;
}

/** Base × rate / 100, to the cent. At cost, so this is the price too. */
export function contingencyAmount(base: Money, rate: ContingencyRate): Money {
  if (base <= ZERO) return ZERO;
  return roundToCents(mulRate(base, rateFromNumber(rate / 100)));
}

const PHASE_4 = /^phase\s*4\b/i;

export function isContingencyGroup(name: string): boolean {
  return /contingency/i.test(name);
}

/** The template's contingency line, when it already carries one. */
export function contingencyLine(t: Template): TemplateLine | null {
  return t.lines.find((l) => isContingencyLine(t, l)) ?? null;
}

/**
 * The ids the line points at, looked up by name so nothing is hard-coded to
 * one organization. `organizationCostItemId` is null until the catalog item
 * exists; the script creates it once.
 */
export async function fetchContingencyIds(
  client: Reader,
): Promise<Omit<ContingencyIds, 'organizationCostItemId'> & { organizationCostItemId: string | null }> {
  const res = await client.query<{
    organization: {
      units: { nodes: { id: string; name: string }[] };
      costTypes: { nodes: { id: string; name: string }[] };
      costCodes: { nodes: { id: string; name: string }[] };
      costItems: { nodes: { id: string; name: string; unitCost: number | null; unitPrice: number | null }[] };
    };
  }>({
    organization: {
      $: { id: client.organizationId },
      units: { $: { size: 5, where: ['name', '=', CONTINGENCY_NAMES.unit] }, nodes: { id: {}, name: {} } },
      costTypes: { $: { size: 5, where: ['name', '=', CONTINGENCY_NAMES.costType] }, nodes: { id: {}, name: {} } },
      costCodes: { $: { size: 5, where: ['name', '=', CONTINGENCY_NAMES.costCode] }, nodes: { id: {}, name: {} } },
      costItems: {
        $: {
          size: 5,
          where: {
            and: [[['job', 'id'], '=', null], [['document', 'id'], '=', null], ['name', '=', CONTINGENCY_LINE]],
          },
        },
        nodes: { id: {}, name: {}, unitCost: {}, unitPrice: {} },
      },
    },
  });
  const o = res.organization;
  const one = (what: string, nodes: { id: string }[]): string => {
    if (nodes.length !== 1) throw new Error(`expected exactly one ${what} in the organization, found ${nodes.length}`);
    return nodes[0]!.id;
  };
  // The price of record must be the $1.00 item; a homonym priced differently would silently change every budget.
  const items = o.costItems.nodes.filter((i) => i.unitCost === 1 && i.unitPrice === 1);
  return {
    unitId: one(`unit "${CONTINGENCY_NAMES.unit}"`, o.units.nodes),
    costTypeId: one(`cost type "${CONTINGENCY_NAMES.costType}"`, o.costTypes.nodes),
    costCodeId: one(`cost code "${CONTINGENCY_NAMES.costCode}"`, o.costCodes.nodes),
    organizationCostItemId: items.length === 1 ? items[0]!.id : null,
  };
}

export interface ContingencyPlan {
  templateId: string;
  templateName: string;
  /** The group Phase 4 sits in — where the new group goes. */
  parentGroupId: string | null;
  phase4: TemplateGroup | null;
  /** Already there: the group, or a line, by name. */
  existing: { group: TemplateGroup | null; line: TemplateLine | null };
  action: 'create' | 'skip';
  reason: string;
}

/**
 * What one template needs. A template with no Phase 4 is not a construction
 * template in the sense Carl meant ("below Phase 4") and is skipped; one that
 * already has the group or the line is skipped so the script can be run twice.
 */
export function planContingency(t: Template): ContingencyPlan {
  const phase4 = t.groups.find((g) => PHASE_4.test(g.name)) ?? null;
  const group = t.groups.find((g) => isContingencyGroup(g.name)) ?? null;
  const line = contingencyLine(t);
  const base = {
    templateId: t.id, templateName: t.name,
    parentGroupId: phase4 ? phase4.parentId ?? t.id : null,
    phase4, existing: { group, line },
  };
  if (group || line) {
    return { ...base, action: 'skip', reason: group ? `already has "${group.name}"` : `already has a "${line!.name}" line` };
  }
  if (!phase4) return { ...base, action: 'skip', reason: 'no Phase 4 group: not a phased construction template' };
  return { ...base, action: 'create', reason: `after "${phase4.name}"` };
}

/** The exact `createCostGroup` for a plan whose action is create. */
export function contingencyMutation(plan: ContingencyPlan, ids: ContingencyIds): Record<string, unknown> {
  if (plan.action !== 'create' || !plan.phase4) throw new Error(`${plan.templateName}: nothing to create (${plan.reason})`);
  return {
    createCostGroup: {
      $: {
        parentCostGroupId: plan.parentGroupId,
        positionAfter: { type: 'costGroup', id: plan.phase4.id },
        name: CONTINGENCY_GROUP,
        description: CONTINGENCY_GROUP_DESCRIPTION,
        lineItems: [
          {
            _type: 'costItem',
            name: CONTINGENCY_LINE,
            organizationCostItemId: ids.organizationCostItemId,
            unitId: ids.unitId,
            costTypeId: ids.costTypeId,
            costCodeId: ids.costCodeId,
            quantityFormula: CONTINGENCY_FORMULA,
            description: CONTINGENCY_DESCRIPTION,
          },
        ],
      },
      createdCostGroup: {
        id: {},
        name: {},
        position: {},
        parentCostGroup: { id: {} },
        descendentCostItems: {
          $: { size: 5 },
          nodes: { id: {}, name: {}, quantityFormula: {}, organizationCostItem: { id: {} } },
        },
      },
    },
  };
}

/** The `createCostItem` for the price-of-record catalog item, when the organization has none. */
export function contingencyItemMutation(
  organizationId: string,
  ids: Omit<ContingencyIds, 'organizationCostItemId'>,
): Record<string, unknown> {
  return {
    createCostItem: {
      $: {
        organizationId,
        name: CONTINGENCY_LINE,
        unitId: ids.unitId,
        costTypeId: ids.costTypeId,
        costCodeId: ids.costCodeId,
        unitCost: 1,
        unitPrice: 1,
        description: CONTINGENCY_DESCRIPTION,
      },
      createdCostItem: { id: {}, name: {}, unitCost: {}, unitPrice: {} },
    },
  };
}

/** One option's share: what the customer's taking it adds to the contingency. */
export interface ContingencyOption {
  group: string;
  name: string;
  /** true for one of several choices ("Flooring — LVP"); false for a yes-or-no add-on. */
  required: boolean;
  cost: Money;
  /** contingency(base + this option) − contingency(base), so the shares add up to the cent. */
  amount: Money;
  /** Open items in the choice are not priced yet, so its share grows once they are. */
  open: number;
}

/** What the recipe tells the rep, given the template's state and the amount. */
export interface ContingencyStep {
  rate: ContingencyRate;
  /** The policy conditions the evidence shows; the rate is the highest they call for. */
  conditions: ContingencyCondition[];
  why: string;
  /** The base-scope cost the rate applies to. */
  base: Money;
  amount: Money;
  /** Each option the customer may take, with what it adds. The floor choice is usually the biggest cost on the job. */
  options: ContingencyOption[];
  /** Set when the primary template already carries the line: keep it, set the parameters. */
  line: { templateId: string; templateName: string; lineId: string; group: string[] } | null;
}
