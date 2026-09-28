/**
 * Findings and the rule contract.
 *
 * A rule is a pure function of (AuditInput) -> Finding[]. No I/O, no clock, no
 * randomness — so the same estimate always produces the same findings, and a
 * frozen fixture is a complete test.
 */

import type { AuditInput } from '../domain.ts';
import type { Money } from '../money.ts';

export type Severity = 'pricing' | 'data' | 'display' | 'info';

export interface Finding {
  /** Stable id for this rule, e.g. "markup.off-policy". */
  rule: string;
  severity: Severity;
  /** One line, written for Kristen rather than for a developer. */
  title: string;
  /** Why it matters and what the policy says. */
  detail: string;
  /** Dollar impact where one can be computed. Negative means underpriced. */
  impact?: Money;
  /** The lines this finding is about. */
  lineIds?: string[];
  /** Arithmetic shown to the reviewer, label/value pairs. */
  math?: { label: string; value: string; emphasis?: boolean }[];
  /** What the reviewer can do about it. First is the recommended action. */
  actions?: string[];
}

export interface Rule {
  id: string;
  /** What this rule checks, in one sentence. Shown in the "checked and clean" list. */
  describes: string;
  run(input: AuditInput): Finding[];
  /** Rendered in the passed-checks list when the rule finds nothing. */
  passMessage?(input: AuditInput): string | null;
}

export interface AuditResult {
  findings: Finding[];
  passed: { rule: string; message: string }[];
  /** Sum of negative impacts — what the estimate is underpriced by. */
  totalUnderpriced: Money;
}
