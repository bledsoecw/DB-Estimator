/**
 * The catalog audited against the cost types — the whole price book at once.
 *
 * The per-estimate check judges lines against the catalog, because the catalog
 * is the intent. This is the other half: is the catalog itself what the cost
 * types say it should be? Without it, a catalog item priced wrong passes every
 * line that comes off it, forever, and the only way anyone finds out is by
 * stumbling on it — which is how three fasteners at x1.667 turned up.
 *
 * Two things it reports, both org-level and neither an estimate's problem:
 *
 *   OFF POLICY   items whose price is not their cost type's margin, grouped by
 *                cost type and then by the rate they actually sit at, so
 *                "eleven warranties all at x2.40" reads as one decision rather
 *                than eleven mistakes. Approved exceptions are set aside and
 *                listed, not flagged.
 *
 *   DUPLICATES   two or more catalog items with the same name. A template that
 *                pulls "6\\" Gutters" can get either, and they may not agree.
 *                Identical duplicates are clutter; differing ones are a trap.
 *
 * Read-only, like everything else here. It reads the whole priced catalog
 * (718 items at last count, 8 pages) and writes one page.
 */

import {
  type Money, type Rate, ZERO,
  abs, formatMoney, formatMultiplier, formatPercent, marginFromMultiplier,
  moneyEquals, priceFromCostAtMargin, sub,
} from './money.ts';
import { toCatalog, toPolicy, type CatalogItem, type Policy } from './domain.ts';
import { exceptionFor } from './rules/exceptions.ts';
import type { CatalogFixture } from './jobtread/types.ts';

export interface OffPolicyItem {
  item: CatalogItem;
  policyName: string;
  policyMultiplier: Rate;
  expectedUnitPrice: Money;
  /** expected - actual, per unit. Positive means the item is priced low. */
  perUnit: Money;
}

export interface Cluster {
  /** Two decimals, e.g. "×2.40". Finer than that and cent rounding splits one rate into many. */
  rate: string;
  multiplier: Rate;
  items: OffPolicyItem[];
}

export interface CostTypeSection {
  costType: string;
  policyMultiplier: Rate;
  policyMargin: Rate;
  checked: number;
  atPolicy: number;
  approved: { item: CatalogItem; reason: string; decidedBy: string }[];
  clusters: Cluster[];
}

export interface DuplicateName {
  name: string;
  items: CatalogItem[];
  /** Same cost, price and cost type on every copy — clutter rather than a trap. */
  identical: boolean;
}

export interface CatalogAudit {
  capturedAt: string;
  checked: number;
  atPolicy: number;
  offPolicy: number;
  approved: number;
  sections: CostTypeSection[];
  duplicates: DuplicateName[];
  skipped: { noCost: number; noCostType: number; passThrough: number };
}

/** A unit price within a cent of policy is at policy — same rule as the estimate check. */
const CENT = 1;

export function auditCatalog(fixture: CatalogFixture): CatalogAudit {
  const policy: Policy = toPolicy(fixture.costTypes);
  const items = [...toCatalog(fixture.items).values()];

  const skipped = { noCost: 0, noCostType: 0, passThrough: 0 };
  const byType = new Map<string, CostTypeSection>();

  const section = (id: string, p: { name: string; margin: Rate; multiplier: Rate }) => {
    let s = byType.get(id);
    if (!s) {
      s = {
        costType: p.name,
        policyMultiplier: p.multiplier,
        policyMargin: p.margin,
        checked: 0,
        atPolicy: 0,
        approved: [],
        clusters: [],
      };
      byType.set(id, s);
    }
    return s;
  };

  const off: { section: CostTypeSection; entry: OffPolicyItem }[] = [];

  for (const item of items) {
    if (item.unitCost === ZERO || item.multiplier === null) {
      skipped.noCost++;
      continue;
    }
    const p = item.costTypeId ? policy.byCostTypeId.get(item.costTypeId) : undefined;
    if (!p) {
      skipped.noCostType++;
      continue;
    }
    if (p.margin === 0n) {
      skipped.passThrough++; // Clock In: cost passes through at cost, by policy
      continue;
    }
    const s = section(item.costTypeId!, p);
    s.checked++;

    const expected = priceFromCostAtMargin(item.unitCost, p.margin);
    if (moneyEquals(item.unitPrice, expected, CENT)) {
      s.atPolicy++;
      continue;
    }

    const e = exceptionFor({ catalogItemId: item.id, name: item.name, multiplier: item.multiplier });
    if (e) {
      s.approved.push({ item, reason: e.reason, decidedBy: e.decidedBy });
      continue;
    }

    off.push({
      section: s,
      entry: {
        item,
        policyName: p.name,
        policyMultiplier: p.multiplier,
        expectedUnitPrice: expected,
        perUnit: sub(expected, item.unitPrice) as Money,
      },
    });
  }

  // Cluster off-policy items by the rate they actually sit at.
  for (const { section: s, entry } of off) {
    const rate = '×' + (Number(entry.item.multiplier!) / 1e6).toFixed(2);
    let c = s.clusters.find((x) => x.rate === rate);
    if (!c) {
      c = { rate, multiplier: entry.item.multiplier!, items: [] };
      s.clusters.push(c);
    }
    c.items.push(entry);
  }
  for (const s of byType.values()) {
    s.clusters.sort((a, b) => b.items.length - a.items.length);
    for (const c of s.clusters) {
      c.items.sort((a, b) => Number(abs(b.perUnit) - abs(a.perUnit)));
    }
  }

  const sections = [...byType.values()].sort((a, b) => {
    const ao = a.clusters.reduce((n, c) => n + c.items.length, 0);
    const bo = b.clusters.reduce((n, c) => n + c.items.length, 0);
    return bo - ao || a.costType.localeCompare(b.costType);
  });

  return {
    capturedAt: fixture.capturedAt,
    checked: sections.reduce((n, s) => n + s.checked, 0),
    atPolicy: sections.reduce((n, s) => n + s.atPolicy, 0),
    offPolicy: off.length,
    approved: sections.reduce((n, s) => n + s.approved.length, 0),
    sections,
    duplicates: findDuplicates(items),
    skipped,
  };
}

/**
 * Names that appear on more than one catalog item.
 *
 * Compared case-insensitively with whitespace collapsed, because "6\\" Gutters"
 * and "6\\"  gutters" are the same mistake. Identity is still the id: two items
 * with one name are two items, and this only says so.
 */
export function findDuplicates(items: CatalogItem[]): DuplicateName[] {
  const groups = new Map<string, CatalogItem[]>();
  for (const item of items) {
    const key = item.name.trim().replace(/\s+/g, ' ').toLowerCase();
    const g = groups.get(key) ?? [];
    g.push(item);
    groups.set(key, g);
  }
  const out: DuplicateName[] = [];
  for (const g of groups.values()) {
    if (g.length < 2) continue;
    const first = g[0]!;
    const identical = g.every(
      (x) =>
        x.unitCost === first.unitCost &&
        x.unitPrice === first.unitPrice &&
        x.costTypeId === first.costTypeId,
    );
    out.push({ name: first.name, items: g, identical });
  }
  return out.sort((a, b) => Number(a.identical) - Number(b.identical) || b.items.length - a.items.length);
}

// ---- rendering ----------------------------------------------------------------

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function renderCatalogReport(a: CatalogAudit): string {
  const pct = a.checked ? Math.round((a.atPolicy / a.checked) * 100) : 0;
  const trap = a.duplicates.filter((d) => !d.identical).length;

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Catalog audit</title>
<style>
:root { --bg:#fbfaf8; --card:#fff; --ink:#1a1a1a; --dim:#6b6b6b; --line:#e4e1dc;
  --red:#b3261e; --amber:#8a6100; --green:#1f6b3a; }
@media (prefers-color-scheme: dark) { :root:not([data-theme="light"]) {
  --bg:#17171a; --card:#202024; --ink:#ececec; --dim:#9a9a9a; --line:#34343a;
  --red:#f2857c; --amber:#e0b055; --green:#77c894; } }
* { box-sizing:border-box; }
body { margin:0; background:var(--bg); color:var(--ink);
  font:15px/1.55 -apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif; }
main { max-width:960px; margin:0 auto; padding:40px 16px 64px; }
h1 { margin:0 0 4px; font-size:22px; letter-spacing:-.01em; }
.meta { margin:0 0 24px; color:var(--dim); font-size:13px; }
.tiles { display:flex; flex-wrap:wrap; gap:26px; padding:18px 0; border-top:1px solid var(--line);
  border-bottom:1px solid var(--line); margin-bottom:8px; }
.tile .k { display:block; font-size:11px; text-transform:uppercase; letter-spacing:.07em; color:var(--dim); }
.tile .v { font-size:22px; font-weight:600; font-variant-numeric:tabular-nums; }
.tile .v.bad { color:var(--red); }
.tile .v.ok { color:var(--green); }
h2 { font-size:12px; text-transform:uppercase; letter-spacing:.09em; color:var(--dim); margin:34px 0 10px; }
.ct { background:var(--card); border:1px solid var(--line); border-radius:8px; padding:14px 18px; margin-bottom:12px; }
.ct > header { display:flex; justify-content:space-between; align-items:baseline; gap:12px; flex-wrap:wrap; }
.ct h3 { margin:0; font-size:16px; }
.ct .pol { font-size:12.5px; color:var(--dim); font-variant-numeric:tabular-nums; }
.cluster { margin-top:12px; }
.cluster > .rate { font-size:13px; font-weight:600; margin:0 0 4px; }
.cluster > .rate .n { color:var(--dim); font-weight:400; }
table { width:100%; border-collapse:collapse; font-size:13.5px; }
th { text-align:left; font-size:10.5px; text-transform:uppercase; letter-spacing:.07em; color:var(--dim);
  font-weight:600; padding:0 10px 6px 0; border-bottom:1px solid var(--line); }
td { padding:7px 10px 7px 0; border-bottom:1px solid var(--line); vertical-align:baseline; }
td.num, th.num { text-align:right; font-variant-numeric:tabular-nums; white-space:nowrap; }
td .code { color:var(--dim); font-size:12px; }
td .low { color:var(--red); } td .high { color:var(--amber); }
.approved { margin-top:12px; font-size:13px; color:var(--dim); }
.approved li { margin:3px 0; }
.dup.trap td:first-child { border-left:3px solid var(--red); padding-left:8px; }
.dup.same td:first-child { border-left:3px solid var(--line); padding-left:8px; }
.notes { margin-top:26px; font-size:13px; color:var(--dim); }
footer { margin-top:36px; padding-top:16px; border-top:1px solid var(--line); color:var(--dim); font-size:12.5px; }
.tw { overflow-x:auto; }
</style>
</head>
<body>
<main>
  <h1>Catalog audit</h1>
  <p class="meta">${a.checked} priced catalog items against the cost-type margins · read ${esc(a.capturedAt)}</p>

  <div class="tiles">
    <div class="tile"><span class="k">Checked</span><span class="v">${a.checked}</span></div>
    <div class="tile"><span class="k">At policy</span><span class="v ok">${a.atPolicy} <small style="font-size:13px;font-weight:400">(${pct}%)</small></span></div>
    <div class="tile"><span class="k">Off policy</span><span class="v ${a.offPolicy ? 'bad' : 'ok'}">${a.offPolicy}</span></div>
    <div class="tile"><span class="k">Approved exceptions</span><span class="v">${a.approved}</span></div>
    <div class="tile"><span class="k">Duplicate names</span><span class="v ${trap ? 'bad' : ''}">${a.duplicates.length}${trap ? ` <small style="font-size:13px;font-weight:400">(${trap} disagree)</small>` : ''}</span></div>
  </div>

  ${a.sections.map(renderSection).join('\n')}

  ${a.duplicates.length > 0 ? renderDuplicates(a.duplicates) : ''}

  <p class="notes">Not checked: ${a.skipped.noCost} items with no cost, ${a.skipped.noCostType} with no cost type,
  ${a.skipped.passThrough} at cost by policy (Clock In).</p>

  <footer>
    <p><strong>Read-only.</strong> Nothing was written to JobTread.</p>
    <p>Contains your price book — keep it local.</p>
  </footer>
</main>
</body>
</html>
`;
}

function renderSection(s: CostTypeSection): string {
  const off = s.clusters.reduce((n, c) => n + c.items.length, 0);
  return `  <div class="ct">
    <header>
      <h3>${esc(s.costType)}</h3>
      <span class="pol">policy ${formatPercent(s.policyMargin)} margin (${formatMultiplier(s.policyMultiplier)}) ·
        ${s.atPolicy} of ${s.checked} at policy${off ? ` · <strong style="color:var(--red)">${off} off</strong>` : ''}</span>
    </header>
${s.clusters.map((c) => renderCluster(c)).join('\n')}
${
  s.approved.length > 0
    ? `    <ul class="approved">${s.approved
        .map((x) => `<li>${esc(x.item.name)} — ${formatMultiplier(x.item.multiplier!)}, approved: ${esc(x.reason)} (${esc(x.decidedBy)})</li>`)
        .join('')}</ul>`
    : ''
}
  </div>`;
}

function renderCluster(c: Cluster): string {
  const margin = marginFromMultiplier(c.multiplier);
  return `    <div class="cluster">
      <p class="rate">${esc(c.rate)} <span class="n">(${formatPercent(margin)} margin) — ${c.items.length} item${c.items.length === 1 ? '' : 's'}</span></p>
      <div class="tw"><table>
        <thead><tr><th>Item</th><th class="num">Cost</th><th class="num">Price</th><th class="num">At policy</th><th class="num">Per unit</th></tr></thead>
        <tbody>
${c.items
  .map(
    (o) => `          <tr>
            <td>${esc(o.item.name)}${o.item.costCodeName ? ` <span class="code">· ${esc(o.item.costCodeName)}</span>` : ''}</td>
            <td class="num">${formatMoney(o.item.unitCost)}</td>
            <td class="num">${formatMoney(o.item.unitPrice)}</td>
            <td class="num">${formatMoney(o.expectedUnitPrice)}</td>
            <td class="num"><span class="${o.perUnit > ZERO ? 'low' : 'high'}">${o.perUnit > ZERO ? '−' : '+'}${formatMoney(abs(o.perUnit))}</span></td>
          </tr>`,
  )
  .join('\n')}
        </tbody>
      </table></div>
    </div>`;
}

function renderDuplicates(d: DuplicateName[]): string {
  return `  <h2>Duplicate names — ${d.length}</h2>
  <div class="tw"><table>
    <thead><tr><th>Name</th><th>Copies</th><th class="num">Cost → Price</th><th>Cost type</th><th></th></tr></thead>
    <tbody>
${d
  .map((x) =>
    x.items
      .map(
        (it, i) => `      <tr class="dup ${x.identical ? 'same' : 'trap'}">
        <td>${i === 0 ? esc(x.name) : ''}</td>
        <td>${i === 0 ? `${x.items.length}` : ''}</td>
        <td class="num">${formatMoney(it.unitCost)} → ${formatMoney(it.unitPrice)}</td>
        <td>${esc(it.costTypeName ?? '—')}${it.costCodeName ? ` <span class="code">· ${esc(it.costCodeName)}</span>` : ''}</td>
        <td>${i === 0 ? (x.identical ? '<span class="code">identical</span>' : '<span style="color:var(--red)">differ</span>') : ''}</td>
      </tr>`,
      )
      .join('\n'),
  )
  .join('\n')}
    </tbody>
  </table></div>`;
}

/** Terminal summary. */
export function summarizeCatalog(a: CatalogAudit): string[] {
  const lines: string[] = [];
  lines.push(`${a.checked} priced catalog items checked — ${a.atPolicy} at policy, ${a.offPolicy} off, ${a.approved} approved`);
  for (const s of a.sections) {
    const off = s.clusters.reduce((n, c) => n + c.items.length, 0);
    lines.push(`  ${s.costType.padEnd(14)} ${String(s.atPolicy).padStart(4)}/${String(s.checked).padEnd(4)} at ${formatMultiplier(s.policyMultiplier)}` + (off ? `   ${off} off` : ''));
    for (const c of s.clusters) {
      const names = c.items.slice(0, 3).map((o) => o.item.name).join(', ');
      lines.push(`      ${c.rate}  ${String(c.items.length).padStart(3)}  ${names}${c.items.length > 3 ? ` +${c.items.length - 3} more` : ''}`);
    }
  }
  if (a.duplicates.length) {
    const trap = a.duplicates.filter((d) => !d.identical).length;
    lines.push(`  ${a.duplicates.length} duplicate name${a.duplicates.length === 1 ? '' : 's'}${trap ? `, ${trap} of which disagree on price or cost type` : ''}`);
  }
  return lines;
}
