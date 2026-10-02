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
 * pricing, so it stays out of git. Carl, 2026-10-02: one book for the work
 * computer and the laptop, in his OneDrive (draft-cli.ts). So a save reads
 * the file again first and keeps what the other computer saved meanwhile,
 * the newer answer winning, and writes through a temporary file so OneDrive
 * never syncs half a book.
 *
 * It also keeps what each past quote said once it has been read. Carl,
 * 2026-10-01: the Myers epoxy quote gives the square footage, and a second
 * run still said "the square footage isn't in what was shown". The quote had
 * lost its turn to a change-order scan. So each file is read once, on its own,
 * and its reading is kept by file id. A file does not change, so a reading
 * never goes stale and --relearn leaves it alone; --reread ignores readings.
 *
 * A finding that matched past work but could not put it per unit is not served
 * from the book. It is searched again, so a quote read since can price it.
 *
 * An answer belongs to the line it was found for. 25-0000, 2026-10-02: the
 * book kept one answer per search word, so "Drywall Brd- Labor" (hanging)
 * was handed the answer learned for "Drywall Mud Labor" (taping), and with
 * it that run's remark "24 hrs for 606 SF is on the high side" on a line of
 * 16 hours. Now an answer is kept per word AND line: a template line reuses
 * only what was learned for a line of the same name; a gap, which has no
 * fixed name, takes the newest answer for its word. And only what is true of
 * the past work is kept (`thisJob` is dropped). Answers kept before this
 * (no `format`) are set aside on load and searched again.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import type { HistoryFinding } from './prompt.ts';
import type { FileReading } from './readings.ts';

export interface LearnedEntry {
  term: string;
  /** ISO datetime. */
  learnedAt: string;
  fromJob: string;
  targetName: string;
  /** The unit the finding's suggestedUnitCost is per; null when it gave none. */
  unit: string | null;
  finding: HistoryFinding;
  /** 2: kept per line, past-work facts only. Entries without it are from before and are not used. */
  format?: 2;
}

/** What one past file said, read once and kept. */
export interface ReadFile {
  fileId: string;
  name: string;
  size: number;
  jobName: string;
  /** ISO datetime. */
  readAt: string;
  reading: FileReading;
}

export interface LearnedFile {
  version: 1;
  entries: Record<string, LearnedEntry>;
  /** By file id. */
  files?: Record<string, ReadFile>;
}

export interface LearnedOptions {
  /** How long a finding with a price stays fresh. Carl: a year. */
  relearnAfterDays?: number;
  /** How long "nothing found" stays fresh. Shorter: the next job may be the first of its kind. */
  relearnNoneAfterDays?: number;
  /** Ignore what is stored for this run; still remember what is found. File readings are kept. */
  ignore?: boolean;
  /** Ignore stored file readings for this run and read the files again. */
  reread?: boolean;
  now?: () => Date;
}

export const DEFAULT_RELEARN_DAYS = 365;
export const DEFAULT_RELEARN_NONE_DAYS = 30;
const DAY = 24 * 60 * 60 * 1000;

export const normalizeTerm = (t: string): string => t.trim().toLowerCase();
const normalizeName = (n: string): string => n.trim().toLowerCase().replace(/\s+/g, ' ');
const kindOf = (e: LearnedEntry): 'line' | 'gap' => e.finding.target.kind;
/** One answer per search word and line. */
export const entryKey = (e: Pick<LearnedEntry, 'term' | 'targetName' | 'finding'>): string =>
  `${normalizeTerm(e.term)}|${kindOf(e as LearnedEntry)}|${normalizeName(e.targetName)}`;

/**
 * Past work was found but not put per unit: "$5,712 lump sum; the square
 * footage isn't in what was shown". Kept on record, never used in place of
 * a search, because the next search may read the quote that settles it.
 */
export const unpriced = (e: LearnedEntry): boolean => e.finding.match !== 'none' && e.finding.suggestedUnitCost === null;

/** The store, in memory. `load`/`save` move it to and from disk. */
export class LearnedStore {
  readonly entries: Map<string, LearnedEntry>;
  readonly files: Map<string, ReadFile>;
  /** Answers set aside on load because they were kept the old way (one per word, with that job's remarks). */
  readonly dropped: number;
  readonly relearnAfterDays: number;
  readonly relearnNoneAfterDays: number;
  readonly ignore: boolean;
  readonly reread: boolean;
  readonly #now: () => Date;

  constructor(entries: LearnedEntry[] = [], opts: LearnedOptions = {}, files: ReadFile[] = []) {
    const current = entries.filter((e) => e.format === 2);
    this.dropped = entries.length - current.length;
    this.entries = new Map(current.map((e) => [entryKey(e), e]));
    this.files = new Map(files.map((f) => [f.fileId, f]));
    this.relearnAfterDays = opts.relearnAfterDays ?? DEFAULT_RELEARN_DAYS;
    this.relearnNoneAfterDays = opts.relearnNoneAfterDays ?? DEFAULT_RELEARN_NONE_DAYS;
    this.ignore = opts.ignore ?? false;
    this.reread = opts.reread ?? false;
    this.#now = opts.now ?? (() => new Date());
  }

  static load(path: string, opts: LearnedOptions = {}): LearnedStore {
    if (!existsSync(path)) return new LearnedStore([], opts);
    const raw = JSON.parse(readFileSync(path, 'utf8')) as Partial<LearnedFile>;
    const entries = raw.entries ? Object.values(raw.entries) : [];
    const files = raw.files ? Object.values(raw.files) : [];
    return new LearnedStore(entries, opts, files);
  }

  /** Write the book, keeping what another computer saved to the same file since it was read. */
  save(path: string): void {
    if (existsSync(path)) this.merge(LearnedStore.load(path));
    mkdirSync(dirname(path), { recursive: true });
    const file: LearnedFile = { version: 1, entries: {}, files: {} };
    for (const [k, v] of [...this.entries.entries()].sort(([a], [b]) => a.localeCompare(b))) file.entries[k] = v;
    for (const [k, v] of [...this.files.entries()].sort(([a], [b]) => a.localeCompare(b))) file.files![k] = v;
    const text = JSON.stringify(file, null, 2) + '\n';
    const tmp = `${path}.${process.pid}.tmp`;
    writeFileSync(tmp, text);
    try {
      renameSync(tmp, path);
    } catch {
      // OneDrive can hold the file for a moment while it syncs; write it in place instead.
      writeFileSync(path, text);
      rmSync(tmp, { force: true });
    }
  }

  /** Take another book's answers and readings where this one has none or an older one. Returns how many were taken. */
  merge(other: LearnedStore): { entries: number; files: number } {
    let entries = 0;
    let files = 0;
    for (const [k, e] of other.entries) {
      const mine = this.entries.get(k);
      if (!mine || Date.parse(e.learnedAt) > Date.parse(mine.learnedAt)) { this.entries.set(k, e); entries++; }
    }
    for (const [k, f] of other.files) {
      const mine = this.files.get(k);
      if (!mine || Date.parse(f.readAt) > Date.parse(mine.readAt)) { this.files.set(k, f); files++; }
    }
    return { entries, files };
  }

  /**
   * What a file said when it was read before, by its id or, for the same
   * upload under another id, by its name and size. Null when it was never
   * read or the run rereads.
   */
  readingOf(file: { id: string; name: string; size: number }): ReadFile | null {
    if (this.reread) return null;
    const byId = this.files.get(file.id);
    if (byId) return byId;
    const name = file.name.toLowerCase();
    for (const f of this.files.values()) if (f.size === file.size && f.name.toLowerCase() === name) return f;
    return null;
  }

  rememberFile(file: { id: string; name: string; size: number }, jobName: string, reading: FileReading): void {
    this.files.set(file.id, {
      fileId: file.id, name: file.name, size: file.size, jobName, readAt: this.#now().toISOString(), reading,
    });
  }

  /** When an entry stops being fresh, by what it found. */
  expiresAt(e: LearnedEntry): Date {
    const days = e.finding.match === 'none' ? this.relearnNoneAfterDays : this.relearnAfterDays;
    return new Date(Date.parse(e.learnedAt) + days * DAY);
  }

  isFresh(e: LearnedEntry): boolean {
    return this.expiresAt(e).getTime() > this.#now().getTime();
  }

  /** Every answer kept for a search word, newest first, fresh or not. */
  forTerm(term: string): LearnedEntry[] {
    const t = normalizeTerm(term);
    return [...this.entries.values()].filter((e) => e.term === t).sort((a, b) => b.learnedAt.localeCompare(a.learnedAt));
  }

  /**
   * The answer to use without a search: the first of the terms, in order,
   * with a fresh, priced answer for this target. A template line takes only
   * an answer learned for a line of the same name; a gap takes one learned
   * for a gap of the same name, else the newest for the word. With no target,
   * the newest for the word. Null when the run ignores the store.
   */
  lookup(terms: string[], target?: { kind: 'line' | 'gap'; name: string }): LearnedEntry | null {
    if (this.ignore) return null;
    for (const t of terms) {
      const usable = this.forTerm(t).filter((e) => this.isFresh(e) && !unpriced(e));
      if (!usable.length) continue;
      if (!target) return usable[0]!;
      const same = usable.find((e) => kindOf(e) === target.kind && normalizeName(e.targetName) === normalizeName(target.name));
      if (same) return same;
      if (target.kind === 'gap') return usable[0]!;
    }
    return null;
  }

  /** Remember one finding under every term that led to it, for the line or gap it was found for. */
  remember(terms: string[], entry: Omit<LearnedEntry, 'term' | 'learnedAt' | 'format'>): void {
    const learnedAt = this.#now().toISOString();
    for (const t of terms) {
      const term = normalizeTerm(t);
      if (!term) continue;
      const e: LearnedEntry = { ...entry, finding: { ...entry.finding, thisJob: '' }, term, learnedAt, format: 2 };
      this.entries.set(entryKey(e), e);
    }
  }
}
