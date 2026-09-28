/**
 * The rule registry and the audit runner.
 *
 * Rules are pure and independent. A rule that throws is reported as a finding
 * rather than aborting the audit — a broken rule must never make an estimate
 * look clean.
 */

import { type Money, ZERO, add } from '../money.ts';
import type { AuditInput } from '../domain.ts';
import { markupRule } from './markup.ts';
import {
  catalogLinkRule,
  displayRule,
  duplicateRule,
  emptyLineRule,
  taxReconcileRule,
  taxRule,
  totalsRule,
} from './integrity.ts';
import { comparablesRule } from './comparables.ts';
import type { AuditResult, Finding, Rule, Severity } from './types.ts';

export const RULES: Rule[] = [
  markupRule,
  emptyLineRule,
  totalsRule,
  taxRule,
  taxReconcileRule,
  duplicateRule,
  catalogLinkRule,
  displayRule,
  comparablesRule,
];

const SEVERITY_ORDER: Record<Severity, number> = {
  pricing: 0,
  data: 1,
  display: 2,
  info: 3,
};

export function audit(input: AuditInput, rules: Rule[] = RULES): AuditResult {
  const findings: Finding[] = [];
  const passed: { rule: string; message: string }[] = [];
  const notes: { rule: string; message: string }[] = [];

  for (const rule of rules) {
    let produced: Finding[];
    try {
      produced = rule.run(input);
    } catch (err) {
      findings.push({
        rule: rule.id,
        severity: 'data',
        title: `Check "${rule.id}" could not run`,
        detail:
          `This rule failed with: ${err instanceof Error ? err.message : String(err)}. ` +
          'Treat the estimate as unchecked for whatever this rule covers.',
      });
      continue;
    }

    if (produced.length > 0) {
      findings.push(...produced);
    } else {
      const msg = rule.passMessage?.(input) ?? rule.describes;
      if (msg) passed.push({ rule: rule.id, message: msg });
    }

    // Evaluated whether or not the rule found anything: suppression has to be
    // visible on a noisy estimate, which is exactly where it is easiest to hide.
    try {
      const note = rule.suppressed?.(input);
      if (note) notes.push({ rule: rule.id, message: note });
    } catch {
      // A broken note must not cost the findings that ran fine.
    }
  }

  findings.sort((a, b) => {
    const s = SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity];
    if (s !== 0) return s;
    const ai = a.impact ? absBig(a.impact) : 0n;
    const bi = b.impact ? absBig(b.impact) : 0n;
    return Number(bi - ai);
  });

  const totalUnderpriced = findings.reduce(
    (acc, f) => (f.impact && f.impact > ZERO ? add(acc, f.impact) : acc),
    ZERO,
  ) as Money;

  return { findings, passed, notes, totalUnderpriced };
}

const absBig = (v: bigint): bigint => (v < 0n ? -v : v);

export type { AuditResult, Finding, Rule, Severity } from './types.ts';
