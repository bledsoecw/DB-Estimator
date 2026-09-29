/**
 * Where a reviewer's marks live between pages.
 *
 * The batch writes an index and one page per estimate, all static files.
 * Kristen marks a finding Real or Not real on whichever page she is looking
 * at, follows a link to the next one, comes back — and the marks have to still
 * be there, on both pages, or the shadow run is being scored on paper after
 * all. The first version kept them in a variable, which the browser threw away
 * on every navigation; a reviewer who lost her marks once stopped marking.
 *
 * localStorage is the only thing a file:// page has that outlives it, and on
 * file:// every page shares one origin, so the index and the estimate pages
 * read one store. Two maps, both keyed by finding: `verdicts` (real | false —
 * is the auditor right?) and `choices` (what to do about it). The key is built
 * here, once, so the two pages cannot disagree about which finding is which.
 *
 * The store lives in that browser on that computer and nowhere else. Nothing
 * here reaches JobTread.
 */

import type { Finding } from './rules/types.ts';

/** The one name both pages use for a finding. Stable across re-runs. */
export function findingKey(documentId: string, f: Pick<Finding, 'rule' | 'title'>): string {
  return `${documentId}|${f.rule}|${f.title}`;
}

/**
 * Inline ES5 defining a global `DBE`, emitted into both pages' script blocks.
 *
 * Deliberately contains no `<`: the estimate page's script block is tested to
 * contain none, so that a job name can never close it early.
 */
export const STORE_SCRIPT = `
var DBE = (function () {
  var names = { verdicts: 'db-estimator.verdicts', choices: 'db-estimator.choices' };
  var mem = {};
  function load(kind) {
    try {
      var raw = window.localStorage.getItem(names[kind]);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch (e) { /* private window, blocked storage: fall through to memory */ }
    return mem[kind] || {};
  }
  function set(kind, key, value) {
    var m = load(kind);
    if (value) m[key] = value; else delete m[key];
    mem[kind] = m;
    try { window.localStorage.setItem(names[kind], JSON.stringify(m)); } catch (e) {}
    return m;
  }
  function clear(kind) {
    mem[kind] = {};
    try { window.localStorage.removeItem(names[kind]); } catch (e) {}
  }
  return { load: load, set: set, clear: clear };
})();
`;
