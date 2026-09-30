/**
 * The learned price book: what history already answered, so the next job
 * does not search all of JobTread again.
 *
 * Carl's rule, 2026-09-30: once a past price has been found for a kind of
 * work, keep it, and only look again after a long time — a year — in case
 * the sub's pricing moved. So each history finding is stored under the
 * search terms that produced it, with when it was learned and on which job.
 * A later target whose terms hit a fresh entry gets the finding without a
 * search or a model call. An entry that found nothing is kept for a short
 * time only, because "DB has never done this" is the fact most likely to
 * change.
 *
 * The store is one JSON file, readable and editable by hand. It holds DB's
 * pricing, so it stays on the machine that runs the drafter and out of git.
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HistoryFinding } from './prompt.ts';

export interface LearnedEntry {
  term: string;
  /** ISO datetime. */
  learnedAt: string;
  fromJob: string;
  targetName: string;
  /** The unit the finding's suggestedUnitCost is per; null when it gave none. */
  unit: string | null;
  finding: HistoryFinding;
}

export interface LearnedFile {
  version: 1;
  entries: Record<string, LearnedEntry>;
}

export interface LearnedOptions {
  /** How long a finding with a price stays fresh. Carl: a year. */
  relearnAfterDays?: number;
  /** How long "nothing found" stays fresh. Shorter: the next job may be the first of its kind. */
  relearnNoneAfterDays?: number;
  /** Ignore what is stored for this run; still remember what is found. */
  ignore?: boolean;
  now?: () => Date;
}

export const DEFAULT_RELEARN_DAYS = 365;
export const DEFAULT_RELEARN_NONE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export const normalizeTerm = (t: string): string => t.trim().toLowerCase();

/** The store, in memory. `load`/`save` move it to and from disk. */
export class LearnedStore {
  readonly entries: Map<string, LearnedEntry>;
  readonly relearnAfterDays: number;
  readonly relearnNoneAfterDays: number;
  readonly ignore: boolean;
  readonly #now: () => Date;

  constructor(entries: LearnedEntry[] = [], opts: LearnedOptions = {}) {
    this.entries = new Map(entries.map((e) => [normalizeTerm(e.term), e]));
    this.relearnAfterDays = opts.relearnAfterDays ?? DEFAULT_RELEARN_DAYS;
    this.relearnNoneAfterDays = opts.relearnNoneAfterDays ?? DEFAULT_RELEARN_NONE_DAYS;
    this.ignore = opts.ignore ?? false;
    this.#now = opts.now ?? (() => new Date());
  }

  static load(path: string, opts: LearnedOptions = {}): LearnedStore {
    if (!existsSync(path)) return new LearnedStore([], opts);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LearnedFile>;
    const entries = raw.entries ? Object.values(raw.entries) : [];
    return new LearnedStore(entries, opts);
  }

  save(path: string): void {
    mkdirSync(dirname(path), { recursive: true });
    const file: LearnedFile = { version: 1, entries: {} };
    for (const [k, v] of [...this.entries.entries()].sort(([a], [b]) => a.localeCompare(b))) file.entries[k] = v;
    writeFileSync(path, JSON.stringify(file, null, 2) + '\n');
  }

  /** When an entry stops being fresh, by what it found. */
  expiresAt(e: LearnedEntry): Date {
    const days = e.finding.match === 'none' ? this.relearnNoneAfterDays : this.relearnAfterDays;
    return new Date(Date.parse(e.learnedAt) + days * DAY);
  }

  isFresh(e: LearnedEntry): boolean {
    return this.expiresAt(e).getTime() > this.#now().getTime();
  }

  /** The first fresh entry among the terms, in the order given. Null when the run ignores the store. */
  lookup(terms: string[]): LearnedEntry | null {
    if (this.ignore) return null;
    for (const t of terms) {
      const e = this.entries.get(normalizeTerm(t));
      if (e && this.isFresh(e)) return e;
    }
    return null;
  }

  /** Remember one finding under every term that led to it. */
  remember(terms: string[], entry: Omit<LearnedEntry, 'term' | 'learnedAt'>): void {
    const learnedAt = this.#now().toISOString();
    for (const t of terms) {
      const term = normalizeTerm(t);
      if (!term) continue;
      this.entries.set(term, { ...entry, term, learnedAt });
    }
  }
}
