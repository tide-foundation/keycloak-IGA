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

/**
 * @param freeLimit capacity of the free plan, when one is offered. It becomes
 *        the FIRST stop, so one continuous track reads "free up to here, priced
 *        above it". Its size participates in the step GCD too, so a free plan of
 *        an odd size cannot make paid stops unreachable.
 */
export function capacityRange(
  tiers: PricingTier[],
  freeLimit?: number,
): CapacityRange | null {
  const limits = tiers.map((t) => t.userLimit);
  if (freeLimit && freeLimit > 0) limits.push(freeLimit);
  if (limits.length === 0) return null;

  const step = limits.reduce((a, b) => gcd(a, b));

  return {
    min: Math.min(...limits),
    max: Math.max(...limits),
    step: step > 0 ? step : 1,
  };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    [x, y] = [y, x % y];
  }
  return x;
}

/**
 * The package sizes the track is built from: ascending, de-duplicated, and
 * including the free plan so the axis reads "free up to here, priced above".
 */
export function capacityStops(
  tiers: PricingTier[],
  freeLimit?: number,
): number[] {
  const limits = tiers.map((t) => t.userLimit);
  if (freeLimit && freeLimit > 0) limits.push(freeLimit);
  return [...new Set(limits.filter((n) => Number.isFinite(n) && n > 0))].sort(
    (a, b) => a - b,
  );
}

/**
 * POSITION SPACE. Package sizes span orders of magnitude, so a track that maps
 * value to position linearly puts every small package in the leftmost few
 * percent and makes the label under the thumb a lie. Instead each adjacent pair
 * of package sizes owns one equal segment of the track, interpolated linearly
 * inside it: position `i` is exactly `stops[i]`, and every stop is evenly
 * spaced, so a thumb under a label really does mean that package size.
 */
export function positionToUsers(position: number, stops: number[]): number {
  if (stops.length === 0) return 0;
  const last = stops.length - 1;
  if (last === 0) return stops[0]!;
  const clamped = Math.min(Math.max(position, 0), last);
  const index = Math.min(Math.floor(clamped), last - 1);
  const fraction = clamped - index;
  const from = stops[index]!;
  return Math.round(from + (stops[index + 1]! - from) * fraction);
}

/** Inverse of {@link positionToUsers}; counts outside the track pin to an end. */
export function usersToPosition(users: number, stops: number[]): number {
  const last = stops.length - 1;
  if (last <= 0) return 0;
  if (users <= stops[0]!) return 0;
  if (users >= stops[last]!) return last;
  const next = stops.findIndex((stop) => stop > users);
  const from = stops[next - 1]!;
  return next - 1 + (users - from) / (stops[next]! - from);
}
