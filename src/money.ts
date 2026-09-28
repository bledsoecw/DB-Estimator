/**
 * Money and rate arithmetic.
 *
 * JobTread returns prices as IEEE floats — real values off the wire include
 * 8.206999999999999, 121.78549999999998 and 869.9999999999999. Nothing in this
 * auditor may compare those with `===`, and nothing may accumulate them.
 *
 * Money is an integer count of ten-thousandths of a dollar (scale 4), held as a
 * bigint. Scale 4 rather than cents because real unit costs are genuinely
 * sub-cent — the CANVAS report line is $0.40/SF and an electrical materials line
 * is $2.6093/SF — and a 2dp unit cost multiplied by 2,700 SF throws away dollars.
 *
 * Rates (markup multipliers, margins, tax) are integer millionths (scale 6).
 * That bounds rate error at 5e-7, which on a $65/hr line is well under a cent
 * per unit. Going finer would be false rigor: the Labor margin JobTread stores
 * is 0.45000549994500055, itself a float artifact of a $55 -> $100 rate, so the
 * input carries more noise than the representation does.
 *
 * See docs/ROADMAP.md 8.2.
 */

const MONEY_SCALE = 4n;
const MONEY_UNIT = 10_000n; // ten-thousandths per dollar
const RATE_UNIT = 1_000_000n; // millionths per 1.0

/** An amount of money in ten-thousandths of a dollar. */
export type Money = bigint & { readonly __brand: 'Money' };

/** A dimensionless rate in millionths. 1.45 is 1_450_000n. */
export type Rate = bigint & { readonly __brand: 'Rate' };

export const ZERO = 0n as Money;

/**
 * Convert a number that arrived from JobTread into exact Money.
 *
 * The input is a float and may be 869.9999999999999 when it means 870. Rounding
 * at scale 4 absorbs that: 869.9999999999999 * 10000 = 8699999.999999999, which
 * rounds to 8700000. Anything whose true precision exceeds 4dp is a value we
 * could not have represented anyway.
 */
export function moneyFromApi(n: number | null | undefined): Money {
  if (n === null || n === undefined || !Number.isFinite(n)) return ZERO;
  return BigInt(Math.round(n * Number(MONEY_UNIT))) as Money;
}

/** Convert a decimal string ("55.00", "0.4") into exact Money without float math. */
export function moneyFromString(s: string): Money {
  const m = /^(-)?(\d+)(?:\.(\d+))?$/.exec(s.trim());
  if (!m) throw new Error(`not a decimal number: ${s}`);
  const [, sign, whole, frac = ''] = m;
  const padded = (frac + '0000').slice(0, Number(MONEY_SCALE));
  const v = BigInt(whole!) * MONEY_UNIT + BigInt(padded || '0');
  return (sign ? -v : v) as Money;
}

/** Rate from a float that arrived from JobTread (costType.margin is 0.3103448275862069). */
export function rateFromApi(n: number | null | undefined): Rate {
  if (n === null || n === undefined || !Number.isFinite(n)) return 0n as Rate;
  return BigInt(Math.round(n * Number(RATE_UNIT))) as Rate;
}

export function rateFromNumber(n: number): Rate {
  return BigInt(Math.round(n * Number(RATE_UNIT))) as Rate;
}

export const add = (a: Money, b: Money): Money => (a + b) as Money;
export const sub = (a: Money, b: Money): Money => (a - b) as Money;
export const neg = (a: Money): Money => -a as Money;
export const abs = (a: Money): Money => (a < 0n ? -a : a) as Money;

/** Multiply money by a quantity expressed in millionths (scale 6). */
export function mulQty(m: Money, qtyMillionths: bigint): Money {
  return divRoundHalfUp(m * qtyMillionths, RATE_UNIT) as Money;
}

/** Multiply money by a rate. 55.00 * 1.8182 -> 100.0010 */
export function mulRate(m: Money, r: Rate): Money {
  return divRoundHalfUp(m * r, RATE_UNIT) as Money;
}

/**
 * Integer division rounding half away from zero — the rounding a contractor
 * expects, and the one JobTread's own numbers are consistent with.
 */
function divRoundHalfUp(numerator: bigint, denominator: bigint): bigint {
  const negative = numerator < 0n !== denominator < 0n;
  const n = numerator < 0n ? -numerator : numerator;
  const d = denominator < 0n ? -denominator : denominator;
  const q = n / d;
  const rem = n % d;
  const rounded = rem * 2n >= d ? q + 1n : q;
  return negative ? -rounded : rounded;
}

/** Round Money to whole cents, half away from zero. */
export function roundToCents(m: Money): Money {
  return (divRoundHalfUp(m, 100n) * 100n) as Money;
}

/**
 * Price from cost at a given margin, computed in ONE exact division.
 *
 * Do not route this through a multiplier. Quantizing 1/(1-g) to scale 6 first
 * loses money: Subcontractor at 30% margin gives multiplier 1.428571, and
 * $8,088 x 1.428571 is $11,554.2822 against a true $11,554.2857 — three and a
 * half cents adrift on one line, in the direction of underpricing.
 *
 * The result stays at scale 4, matching how JobTread stores unitPrice (real
 * values include 19550.0745 and 2536.0935). The extension rounds to cents once,
 * at the line, per docs/ROADMAP.md 8.2.
 */
export function priceFromCostAtMargin(cost: Money, margin: Rate): Money {
  const denom = RATE_UNIT - margin;
  if (denom <= 0n) throw new Error(`margin must be below 100%: ${margin}`);
  return divRoundHalfUp(cost * RATE_UNIT, denom) as Money;
}

/**
 * The margin -> multiplier identity. k = 1 / (1 - g).
 *
 * For DISPLAY and for cheap comparison only. Never multiply money by this to
 * get a price — use priceFromCostAtMargin, which does not quantize.
 *
 * Materials carry margin 0.3103448275862069, which is exactly x1.45.
 * Subcontractor carries 0.3, which is x1.428571 — not the x1.30 that half the
 * catalog is priced at. See docs/ROADMAP.md 19.3.
 */
export function multiplierFromMargin(margin: Rate): Rate {
  const denom = RATE_UNIT - margin;
  if (denom <= 0n) throw new Error(`margin must be below 100%: ${margin}`);
  return divRoundHalfUp(RATE_UNIT * RATE_UNIT, denom) as Rate;
}

/** The markup that corresponds to a margin. m = g / (1 - g). */
export function markupFromMargin(margin: Rate): Rate {
  return (multiplierFromMargin(margin) - RATE_UNIT) as Rate;
}

/** The margin that corresponds to a multiplier. g = (k - 1) / k. */
export function marginFromMultiplier(mult: Rate): Rate {
  if (mult === 0n) return 0n as Rate;
  return divRoundHalfUp((mult - RATE_UNIT) * RATE_UNIT, mult) as Rate;
}

/**
 * The observed multiplier for a priced line, or null when cost is zero.
 * Deliberately returns null rather than Infinity so callers must handle the
 * zero-cost case — which is itself a finding.
 */
export function observedMultiplier(unitCost: Money, unitPrice: Money): Rate | null {
  if (unitCost === 0n) return null;
  return divRoundHalfUp(unitPrice * RATE_UNIT, unitCost) as Rate;
}

/**
 * Compare two Money values with a tolerance.
 *
 * Default tolerance is one cent. JobTread's stored totals are float sums of
 * float extensions, so an exact match is not achievable and demanding one would
 * make every reconciliation fail.
 */
export function moneyEquals(a: Money, b: Money, toleranceCents = 1): boolean {
  const tol = BigInt(toleranceCents) * 100n;
  return abs(sub(a, b)) <= tol;
}

/** Compare two rates with a tolerance, default 0.0005 (5 parts in 10,000). */
export function rateEquals(a: Rate, b: Rate, tolerance = 500n): boolean {
  const d = a - b;
  return (d < 0n ? -d : d) <= tolerance;
}

// ---- formatting -------------------------------------------------------------

export function formatMoney(m: Money, opts: { cents?: boolean } = {}): string {
  const negative = m < 0n;
  const v = negative ? -m : m;
  const dollars = v / MONEY_UNIT;
  const frac = v % MONEY_UNIT;
  const places = opts.cents === false ? 0 : frac % 100n === 0n ? 2 : 4;
  const fracStr = places === 0 ? '' : '.' + frac.toString().padStart(4, '0').slice(0, places);
  const whole = dollars.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return `${negative ? '-' : ''}$${whole}${fracStr}`;
}

export function formatMultiplier(r: Rate): string {
  return '×' + (Number(r) / Number(RATE_UNIT)).toFixed(4);
}

export function formatPercent(r: Rate, places = 2): string {
  return (Number(r) / Number(RATE_UNIT) * 100).toFixed(places) + '%';
}

export function toNumber(m: Money): number {
  return Number(m) / Number(MONEY_UNIT);
}

export function rateToNumber(r: Rate): number {
  return Number(r) / Number(RATE_UNIT);
}

/** Quantity as millionths, from a JobTread float. */
export function qtyFromApi(n: number | null | undefined): bigint {
  if (n === null || n === undefined || !Number.isFinite(n)) return 0n;
  return BigInt(Math.round(n * Number(RATE_UNIT)));
}

export function qtyToNumber(q: bigint): number {
  return Number(q) / Number(RATE_UNIT);
}
