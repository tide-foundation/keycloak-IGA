/**
 * TIDECLOAK IMPLEMENTATION
 *
 * The slider's bounds and granularity, DERIVED from the Stripe packages rather
 * than declared here.
 *
 * There is no "the slider goes from 100 to 100,000 in steps of 100" constant
 * anywhere: that would be pricing information duplicated in source, and it
 * would go stale the moment someone adds a 50-user package in Stripe. Instead:
 *
 *   min  = the smallest package (nothing smaller can be bought)
 *   max  = the largest package (a sensible top of the slider; larger counts
 *          remain quotable by typing, since packages combine)
 *   step = the GCD of every package size, so every stop is a count the
 *          packages can express exactly.
 */
import type { PricingTier } from "./pricingApi";

export type CapacityRange = {
  min: number;
  max: number;
  step: number;
};

export function capacityRange(tiers: PricingTier[]): CapacityRange | null {
  if (tiers.length === 0) return null;

  const limits = tiers.map((t) => t.userLimit);
  const step = limits.reduce((a, b) => gcd(a, b));

  return {
    min: Math.min(...limits),
    max: Math.max(...limits),
    step: step > 0 ? step : 1,
  };
}

/** Snap an arbitrary count onto the nearest expressible capacity, clamped to min. */
export function snapCapacity(value: number, range: CapacityRange): number {
  if (!Number.isFinite(value)) return range.min;
  const snapped = Math.round(value / range.step) * range.step;
  return Math.max(range.min, snapped);
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}
