/**
 * TIDECLOAK IMPLEMENTATION
 *
 * Browser half of the Stripe-backed pricing endpoints served by
 * tidecloak-idp-extensions (`PublicResource`):
 *
 *   GET /realms/{realm}/public/pricing              -> the packages
 *   GET /realms/{realm}/public/pricing/quote?users= -> the cheapest bundle
 *
 * Both are unauthenticated by design — the pricing UI has to render for an
 * operator who has no license yet, which is exactly the state in which there
 * is no license-scoped token. They are same-origin with the admin console
 * (both served by Keycloak), which matters because `PublicResource` emits no
 * CORS headers.
 *
 * Plain `fetch`, not `adminClient`: keycloak-admin-client attaches a bearer
 * token and targets admin paths, neither of which applies here.
 *
 * NOTE: this deliberately mirrors the same module in the tide-console SPA
 * (`frontend/packages/api-client/src/pricing`). The two consoles live in
 * separate repositories with no shared package, so the client is duplicated —
 * but the pricing RULES (which Prices qualify, and which combination is
 * cheapest) exist only once, on the server. Nothing here decides a price.
 */

/** One Stripe Price, projected server-side. A package of user capacity. */
export type PricingTier = {
  priceId: string;
  userLimit: number;
  /** MINOR units of `currency`, verbatim from Stripe. Never assume 2 decimals. */
  unitAmount: number;
  currency: string;
  interval: string;
  displayOrder: number;
};

/** One package within a quoted bundle. */
export type QuoteLineItem = {
  priceId: string;
  userLimit: number;
  unitAmount: number;
  /** How many of this package the bundle contains. */
  packages: number;
  /** Capacity this line contributes (packages x userLimit). */
  users: number;
  subtotal: number;
  /**
   * What Checkout must send as this line item's `quantity`. NOT always
   * `packages` — a Price with `transform_quantity` expects seats and divides
   * internally. The server resolves it; pass it through, never recompute it.
   */
  stripeQuantity: number;
};

/** The server's answer: the cheapest bundle covering a requested capacity. */
export type PricingQuote = {
  requestedUsers: number;
  /** May EXCEED requestedUsers — capacity is sold in whole packages. */
  includedUsers: number;
  totalAmount: number;
  currency: string;
  interval: string;
  lineItems: QuoteLineItem[];
};

function pricingBase(serverBaseUrl: string, realm: string): string {
  return `${serverBaseUrl.replace(/\/$/, "")}/realms/${encodeURIComponent(
    realm,
  )}/public/pricing`;
}

/**
 * Non-2xx handling shared by both calls. The server replies `{error, message}`
 * — surfacing `message` makes an unconfigured deployment distinguishable from
 * a Stripe outage in the console log.
 */
async function throwForStatus(res: Response): Promise<never> {
  const raw = await res.text().catch(() => "");
  let message: string | undefined;
  try {
    const parsed = JSON.parse(raw) as { message?: unknown };
    if (typeof parsed.message === "string") message = parsed.message;
  } catch {
    /* not JSON — fall through to the status line */
  }
  throw new Error(message ?? `Pricing request failed: HTTP ${res.status}`);
}

function isTier(value: unknown): value is PricingTier {
  if (typeof value !== "object" || value === null) return false;
  const t = value as Record<string, unknown>;
  return (
    typeof t.priceId === "string" &&
    typeof t.userLimit === "number" &&
    typeof t.unitAmount === "number" &&
    typeof t.currency === "string" &&
    typeof t.interval === "string"
  );
}

function isQuote(value: unknown): value is PricingQuote {
  if (typeof value !== "object" || value === null) return false;
  const q = value as Record<string, unknown>;
  return (
    typeof q.totalAmount === "number" &&
    typeof q.currency === "string" &&
    typeof q.interval === "string" &&
    typeof q.requestedUsers === "number" &&
    typeof q.includedUsers === "number" &&
    Array.isArray(q.lineItems)
  );
}

/**
 * The active packages, already ordered by `display_order`.
 *
 * Returns `[]` when Stripe has no qualifying Price — the caller renders an
 * empty state. THROWS on any failure to obtain live pricing; there is
 * deliberately no fallback list, because a wrong price is worse than a
 * visible outage.
 */
export async function fetchPricingTiers(
  serverBaseUrl: string,
  realm: string,
  signal?: AbortSignal,
): Promise<PricingTier[]> {
  const res = await fetch(pricingBase(serverBaseUrl, realm), { signal });
  if (!res.ok) await throwForStatus(res);

  const raw: unknown = await res.json();
  if (!Array.isArray(raw) || !raw.every(isTier)) {
    // A malformed package is an outage, not something to silently drop:
    // showing 4 of 6 packages with no warning would look like a real catalogue.
    throw new Error("The pricing service returned an unexpected shape.");
  }
  return raw;
}

/**
 * The free plan, or null when none is on offer.
 *
 * A STANDALONE plan — its own Stripe Product, its own subscription, a fixed
 * capacity per month at no charge. It is NOT an allowance deducted from a paid
 * quote: buying 500 paid users gets you 500, not 600. That is why it has its
 * own endpoint and never appears inside a quote's line items.
 *
 * Every failure path returns null rather than throwing: the server answers 204
 * when no free plan is configured, and the paid packages are a complete offer
 * on their own, so a missing free plan must not blank the pricing card.
 */
export async function fetchFreePlan(
  serverBaseUrl: string,
  realm: string,
  signal?: AbortSignal,
): Promise<PricingTier | null> {
  let res: Response;
  try {
    res = await fetch(`${pricingBase(serverBaseUrl, realm)}/free`, { signal });
  } catch {
    return null;
  }
  if (res.status === 204 || !res.ok) return null;

  try {
    const raw: unknown = await res.json();
    return isTier(raw) ? raw : null;
  } catch {
    return null;
  }
}

/**
 * Ask the SERVER for the cheapest bundle of packages covering `users`.
 *
 * The bundle is never assembled here. Beyond the security argument (a
 * client-proposed bundle is a client-proposed price), the optimal combination
 * is not the obvious one — on the live price list 1,200 users is 1x1,000 +
 * 2x100 = $550, while the smallest single package that fits is $1,100.
 */
export async function fetchPricingQuote(
  serverBaseUrl: string,
  realm: string,
  users: number,
  signal?: AbortSignal,
): Promise<PricingQuote> {
  const url = `${pricingBase(serverBaseUrl, realm)}/quote?users=${encodeURIComponent(
    String(users),
  )}`;
  const res = await fetch(url, { signal });
  if (!res.ok) await throwForStatus(res);

  const raw: unknown = await res.json();
  if (!isQuote(raw)) {
    throw new Error("The pricing service returned an unexpected quote shape.");
  }
  return raw;
}
