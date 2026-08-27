/**
 * TIDECLOAK IMPLEMENTATION
 *
 * Data hooks behind the Enterprise pricing card.
 *
 * These use plain `useEffect` rather than the shared `useFetch` helper on
 * purpose: `useFetch` routes any failure to `showBoundary()`, which replaces
 * the whole page with the error boundary. A pricing outage must degrade to an
 * inline "temporarily unavailable" card inside the licensing tab, not take the
 * tab down — so the error is kept local and returned as state.
 */
import { useEffect, useState } from "react";
import {
  fetchFreePlan,
  fetchPricingQuote,
  fetchPricingTiers,
  type PricingQuote,
  type PricingTier,
} from "./pricingApi";

/** Trailing-edge debounce, so a dragged slider asks for one quote, not fifty. */
export function useDebouncedValue<T>(value: T, delayMs: number): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export type PricingTiersState = {
  tiers: PricingTier[] | undefined;
  isLoading: boolean;
  isError: boolean;
};

/** The active Stripe packages. Refetched only on realm/server change. */
export function usePricingTiers(
  serverBaseUrl: string,
  realm: string,
): PricingTiersState {
  const [tiers, setTiers] = useState<PricingTier[] | undefined>(undefined);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setIsLoading(true);
    setIsError(false);

    fetchPricingTiers(serverBaseUrl, realm, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setTiers(result);
        setIsLoading(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        // Logged, not shown: the operator gets the generic unavailable copy,
        // the diagnostic stays in the console.
        console.error("Failed to load Tide pricing", error);
        setIsError(true);
        setIsLoading(false);
      });

    return () => controller.abort();
  }, [serverBaseUrl, realm]);

  return { tiers, isLoading, isError };
}

export type PricingQuoteState = {
  quote: PricingQuote | undefined;
  isQuoting: boolean;
  isError: boolean;
};

/**
 * The cheapest bundle covering `users`, decided BY THE SERVER.
 *
 * The previous quote is deliberately kept on screen while a new one is in
 * flight (`quote` is not cleared) — otherwise every slider nudge would blank
 * the price and the card would strobe.
 */
export function usePricingQuote(
  serverBaseUrl: string,
  realm: string,
  users: number | null,
): PricingQuoteState {
  const [quote, setQuote] = useState<PricingQuote | undefined>(undefined);
  const [isQuoting, setIsQuoting] = useState(false);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (users === null || users <= 0) return;

    const controller = new AbortController();
    setIsQuoting(true);
    setIsError(false);

    fetchPricingQuote(serverBaseUrl, realm, users, controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return;
        setQuote(result);
        setIsQuoting(false);
      })
      .catch((error) => {
        if (controller.signal.aborted) return;
        console.error("Failed to quote Tide pricing", error);
        setIsError(true);
        setIsQuoting(false);
      });

    return () => controller.abort();
  }, [serverBaseUrl, realm, users]);

  return { quote, isQuoting, isError };
}

/**
 * The free plan, or null when none is on offer.
 *
 * Standalone plan, never a discount on paid capacity. Failures resolve to null
 * (see `fetchFreePlan`), so a missing free plan shows no free option rather
 * than pushing the card into its error state.
 */
export function useFreePlan(
  serverBaseUrl: string,
  realm: string,
): PricingTier | null {
  const [plan, setPlan] = useState<PricingTier | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    // fetchFreePlan never rejects (every failure path resolves to null), so
    // there is nothing to catch — void marks the promise as deliberately
    // unawaited.
    void fetchFreePlan(serverBaseUrl, realm, controller.signal).then(
      (result) => {
        if (!controller.signal.aborted) setPlan(result);
      },
    );
    return () => controller.abort();
  }, [serverBaseUrl, realm]);

  return plan;
}
