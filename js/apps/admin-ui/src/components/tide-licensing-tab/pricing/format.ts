/**
 * TIDECLOAK IMPLEMENTATION
 *
 * Currency + count formatting for the pricing surfaces.
 *
 * The one rule these exist to enforce: NOTHING here assumes USD, and nothing
 * assumes two decimal places. Stripe reports amounts in a currency's MINOR
 * units, and how many minor units make a major one is a property of the
 * currency — 100 for USD/AUD/EUR, but 1 for JPY and KRW, and 1000 for KWD.
 * Hardcoding `/ 100` would render 4000 JPY as "¥40.00". So the exponent is
 * resolved from `Intl.NumberFormat` itself, which already knows it.
 *
 * Mirrors `apps/admin/src/features/tide/pricing/format.ts` in the tide-console
 * SPA; the two consoles are separate repos with no shared package.
 */

/** Cache: building an Intl.NumberFormat is not free and the currency set is tiny. */
const digitsCache = new Map<string, number>();

/**
 * Minor-unit exponent for a currency (USD -> 2, JPY -> 0, KWD -> 3). Falls back
 * to 2 for a code Intl does not recognise, matching Stripe's own default.
 */
function minorUnitDigits(currency: string): number {
  const key = currency.toUpperCase();
  const cached = digitsCache.get(key);
  if (cached !== undefined) return cached;

  let digits = 2;
  try {
    digits =
      new Intl.NumberFormat(undefined, {
        style: "currency",
        currency: key,
      }).resolvedOptions().maximumFractionDigits ?? 2;
  } catch {
    // Unknown ISO code — Intl throws RangeError. Keep the 2-decimal default.
  }
  digitsCache.set(key, digits);
  return digits;
}

function toMajorUnits(minorUnits: number, currency: string): number {
  return minorUnits / 10 ** minorUnitDigits(currency);
}

/**
 * A Stripe amount as currency text: `formatMoney(24000, "usd")` -> `"$240"`.
 * Whole amounts drop the decimals; fractional ones keep the currency's full
 * precision.
 */
export function formatMoney(minorUnits: number, currency: string): string {
  const value = toMajorUnits(minorUnits, currency);
  const digits = minorUnitDigits(currency);
  const isWhole = Number.isInteger(value);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: isWhole ? 0 : digits,
      maximumFractionDigits: digits,
    }).format(value);
  } catch {
    // Never throw out of a formatter, and never drop the code — "240 XYZ" is
    // honest where "$240" would be a lie.
    return `${value} ${currency.toUpperCase()}`;
  }
}

/**
 * Effective price per user: `formatPerUser(110000, 2500, "usd")` -> `"$0.44"`.
 * Allows one digit more precision than the currency normally carries, because
 * per-user rates are routinely sub-minor-unit ($0.375, not $0.38). One extra
 * digit, not two: $0.3964 is more precision than anyone acts on and made the
 * figure harder to read at a glance.
 */
export function formatPerUser(
  minorUnits: number,
  userLimit: number,
  currency: string,
): string {
  if (!Number.isFinite(userLimit) || userLimit <= 0) return "-";
  const value = toMajorUnits(minorUnits / userLimit, currency);
  const digits = minorUnitDigits(currency);
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency.toUpperCase(),
      minimumFractionDigits: digits,
      maximumFractionDigits: digits + 1,
    }).format(value);
  } catch {
    return `${value} ${currency.toUpperCase()}`;
  }
}

/** Group a user count for display: `2500` -> `"2,500"` (locale-aware). */
export function formatCount(value: number): string {
  return new Intl.NumberFormat().format(value);
}

/**
 * Billing interval as a suffix: `"month"` -> `"/ month"`. Passed through from
 * Stripe rather than assumed, so a yearly Price renders correctly too.
 */
export function formatInterval(interval: string): string {
  return `/ ${interval}`;
}
