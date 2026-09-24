/**
 * TIDECLOAK IMPLEMENTATION
 *
 * The pricing surface that REPLACES the old bare "Request License" button on
 * the licensing tab.
 *
 * The free plan and paid capacity are two separate selections, not one track.
 * The free plan is its own card (a distinct choice, $0, no card required); the
 * Enterprise card is the paid capacity chooser, a slider over the PAID packages
 * only whose first stop is the smallest paid package (the 100-user/$50 one).
 * Picking the free card is standalone: its users are not carried into any paid
 * total, and a free realm upgrades by choosing paid capacity instead.
 *
 * Nothing in this file computes a price. The total, the breakdown and the
 * inputs to the effective per-user rate all come from the server's quote. The
 * component does not know that packages combine, does not know which
 * combination is cheapest, and cannot propose one — that logic lives once, on
 * the server, next to the Stripe credentials. Consequently there is also no
 * fallback price list: if Stripe cannot be reached the card says so rather
 * than showing a number the billing system would not honour.
 */
import {
  Alert,
  Button,
  Divider,
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Label,
  Skeleton,
  Slider,
  Text,
  TextContent,
  Title,
} from "@patternfly/react-core";
import { FC, ReactNode, useEffect, useId, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  capacityRange,
  capacityStops,
  positionToUsers,
  usersToPosition,
  type CapacityRange,
} from "./capacity";
import styles from "./package-stops.module.css";
import {
  formatCompactCount,
  formatCount,
  formatInterval,
  formatMoney,
  formatPerUser,
} from "./format";
import type { PricingQuote, PricingTier, QuoteLineItem } from "./pricingApi";
import {
  useDebouncedValue,
  useFreePlan,
  usePricingQuote,
  usePricingTiers,
} from "./usePricing";

export type EnterprisePricingProps = {
  /** Keycloak's server root (`environment.serverBaseUrl`); the pricing
   *  endpoints are same-origin with it. */
  serverBaseUrl: string;
  realm: string;
  /** Invoked with the server's quote when the operator commits. */
  onChoose: (quote: PricingQuote) => void;
  /** Invoked when the operator picks the FREE plan (its own subscription). */
  onChooseFree?: (plan: PricingTier) => void;
  ctaLabel?: string;
  isCtaDisabled?: boolean;
  /**
   * Whether the free plan is offered as its own card. False where the surface
   * is used to CHANGE capacity on an existing subscription: free is not an
   * upgrade target there, and its call to action would have nothing to do.
   */
  showFreePlan?: boolean;
  /**
   * Rendered INSTEAD of the card when the server build has no pricing
   * endpoints. The console and the tidecloak-key-provider jar ship as separate
   * artifacts, so a console that knows about pricing can be pointed at an older
   * Keycloak. Pass the pre-pricing affordance here — the operator keeps a
   * working way to request a license rather than being shown a failure.
   */
  unsupportedFallback?: ReactNode;
};

export const EnterprisePricing: FC<EnterprisePricingProps> = ({
  serverBaseUrl,
  realm,
  onChoose,
  onChooseFree,
  ctaLabel,
  isCtaDisabled = false,
  showFreePlan = true,
  unsupportedFallback = null,
}) => {
  const { t } = useTranslation();
  const packages = usePricingTiers(serverBaseUrl, realm);
  const fetchedFreePlan = useFreePlan(serverBaseUrl, realm);
  const freePlan = showFreePlan ? fetchedFreePlan : null;
  const [users, setUsers] = useState<number | null>(null);

  // Paid packages only: the free plan is its own card, not part of the track.
  const range = packages.tiers ? capacityRange(packages.tiers) : null;

  // Open on the smallest paid package once the catalogue lands, so the card
  // starts on a real, quotable capacity rather than an invented default.
  useEffect(() => {
    if (users !== null || !range) return;
    setUsers(range.min);
  }, [range, users]);

  // The control updates immediately; only the quote request is debounced.
  const debouncedUsers = useDebouncedValue(users, 200);
  const quoting = usePricingQuote(serverBaseUrl, realm, debouncedUsers);

  // A failure at either step means we cannot state a price. Both collapse to
  // the same message — never to a fallback number.
  const isError = packages.isError || quoting.isError;

  // Older key-provider jar: no pricing endpoints at all. Hand back the
  // pre-pricing affordance rather than an error the operator cannot act on.
  if (packages.isUnsupported) {
    return unsupportedFallback;
  }

  const enterpriseCard = (
    <Card isPlain isCompact>
      <CardTitle>
        <Title headingLevel="h2" size="xl">
          {t("Enterprise")}
        </Title>
        <TextContent>
          <Text component="small">
            {t(
              "Capacity is sold in packages that combine. Tell us how many users you need and we work out the cheapest mix.",
            )}
          </Text>
        </TextContent>
      </CardTitle>
      <CardBody>
        {packages.isLoading ? (
          <PricingSkeleton />
        ) : isError ? (
          <Alert
            variant="danger"
            isInline
            title={t("Pricing is temporarily unavailable.")}
            data-testid="pricing-error"
          >
            {t("Please try again shortly.")}
          </Alert>
        ) : !range ? (
          <Alert
            variant="info"
            isInline
            title={t("No plans are available right now.")}
            data-testid="pricing-empty"
          >
            {t(
              "No active Stripe price on the configured product carries a valid user_limit.",
            )}
          </Alert>
        ) : (
          <CapacityChooser
            range={range}
            packages={packages.tiers ?? []}
            users={users ?? range.min}
            onUsersChange={setUsers}
            quote={quoting.quote}
            isQuoting={quoting.isQuoting}
            onChoose={onChoose}
            ctaLabel={ctaLabel ?? t("Request License")}
            isCtaDisabled={isCtaDisabled}
          />
        )}
      </CardBody>
    </Card>
  );

  if (!freePlan) {
    return enterpriseCard;
  }

  return (
    <div className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-lg">
      <FreePlanCard
        plan={freePlan}
        ctaLabel={ctaLabel ?? t("Request License")}
        isCtaDisabled={isCtaDisabled}
        onChoose={() => onChooseFree?.(freePlan)}
      />
      {enterpriseCard}
    </div>
  );
};

/**
 * The free plan as its own selection.
 *
 * It stands apart from the paid capacity chooser: $0, no card required, a fixed
 * capacity, and one per subscription. Above that capacity the operator picks a
 * paid package on the Enterprise card instead — the free users are not an
 * allowance carried into a paid total.
 */
const FreePlanCard: FC<{
  plan: PricingTier;
  ctaLabel: string;
  isCtaDisabled: boolean;
  onChoose: () => void;
}> = ({ plan, ctaLabel, isCtaDisabled, onChoose }) => {
  const { t } = useTranslation();
  return (
    <Card isPlain isCompact data-testid="pricing-free-card">
      <CardTitle>
        <Title headingLevel="h2" size="xl">
          {t("Free")}
        </Title>
        <TextContent>
          <Text component="small">
            {t(
              "Run a realm at no cost, up to the free plan's capacity. No card required.",
            )}
          </Text>
        </TextContent>
      </CardTitle>
      <CardBody>
        <div className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
          <Title headingLevel="h3" size="3xl" data-testid="pricing-free-amount">
            {formatMoney(plan.unitAmount, plan.currency)}{" "}
            <Text component="small">{formatInterval(plan.interval)}</Text>{" "}
            <Label color="green" data-testid="pricing-free-badge">
              {t("Free plan")}
            </Label>
          </Title>

          <DescriptionList isHorizontal isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>{t("Capacity")}</DescriptionListTerm>
              <DescriptionListDescription data-testid="pricing-free-capacity">
                {t("Up to {{limit}} users", {
                  limit: formatCount(plan.userLimit),
                })}
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>

          <TextContent data-testid="pricing-free-bundle">
            <Text component="small">
              {t(
                "One free plan per subscription. Above {{limit}} users, choose a paid package on the Enterprise card.",
                { limit: formatCount(plan.userLimit) },
              )}
            </Text>
          </TextContent>

          <Button
            variant="secondary"
            isDisabled={isCtaDisabled}
            onClick={onChoose}
            data-testid="pricing-free-choose"
          >
            {ctaLabel}
          </Button>
        </div>
      </CardBody>
    </Card>
  );
};

/**
 * How many packages the track spans when Stripe offers only ONE package size.
 * Not a price: it is the width of a convenience control, and any count beyond
 * it stays reachable through the numeric input.
 */
const MULTI_BUY_STOPS = 10;

type ChooserProps = {
  range: CapacityRange;
  packages: PricingTier[];
  users: number;
  onUsersChange: (users: number) => void;
  quote: PricingQuote | undefined;
  isQuoting: boolean;
  onChoose: (quote: PricingQuote) => void;
  ctaLabel: string;
  isCtaDisabled: boolean;
};

const CapacityChooser: FC<ChooserProps> = ({
  range,
  packages,
  users,
  onUsersChange,
  quote,
  isQuoting,
  onChoose,
  ctaLabel,
  isCtaDisabled,
}) => {
  const { t } = useTranslation();
  const capacityLiveId = useId();

  // Nothing to choose between: a single paid package. The capacity control
  // would imply a choice that is not there, so this degrades to a plain price
  // and a button — the shape the old "Request License" affordance had.
  const isSingleOption = packages.length <= 1;

  const hasMultiplePackageSizes = range.max > range.min;

  // One package size gives nothing to slide between, so the track spans
  // multiples of it. Those are real boundaries (you buy several of the one
  // package) rather than an invented scale.
  const packageSizes = capacityStops(packages);
  const stops =
    packageSizes.length > 1
      ? packageSizes
      : Array.from(
          { length: MULTI_BUY_STOPS },
          (_, i) => (packageSizes[0] ?? range.min) * (i + 1),
        );

  // The track runs in POSITION space, not user counts: see capacity.ts. This is
  // also what suppresses two PatternFly defects that only fire without
  // customSteps — a thumb positioned by raw value, and a per-render loop over
  // every step from min to max.
  const lastStop = stops.length - 1;
  const sliderPosition = usersToPosition(users, stops);
  const customSteps = stops.map((size, index) => ({
    value: index,
    label: formatCompactCount(size),
  }));

  const overshoot = quote ? quote.includedUsers - quote.requestedUsers : 0;

  return (
    <div className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-lg">
      {/* Headline: the server's quoted total. */}
      {quote ? (
        <Title
          headingLevel="h3"
          size="3xl"
          className={isQuoting ? "pf-v5-u-color-200" : undefined}
          data-testid="pricing-amount"
        >
          {formatMoney(quote.totalAmount, quote.currency)}{" "}
          <Text component="small">{formatInterval(quote.interval)}</Text>
        </Title>
      ) : (
        <Skeleton
          width="40%"
          height="2.5rem"
          screenreaderText={t("Loading pricing")}
        />
      )}

      {isSingleOption ? null : (
        <TextContent>
          <Text component="h4">{t("How many users do you need?")}</Text>
        </TextContent>
      )}

      {isSingleOption ? null : (
        <>
          <Slider
            min={0}
            max={lastStop}
            step={1}
            value={sliderPosition}
            customSteps={customSteps}
            areCustomStepsContinuous
            inputValue={users}
            isInputVisible
            inputLabel={t("users")}
            inputAriaLabel={t("Exact number of users")}
            aria-describedby={capacityLiveId}
            // PatternFly reports the typed count as `inputValue` and the dragged
            // POSITION as `value`, so only the drag path is converted. Neither
            // is snapped to a package size: the operator states how many users
            // they have and the server answers with the cheapest packages
            // covering it.
            onChange={(_event, value, inputValue) =>
              onUsersChange(
                Math.max(1, inputValue ?? positionToUsers(value, stops)),
              )
            }
            data-testid="pricing-slider"
          />
          {/* The thumb's own aria-valuenow is a position, and PatternFly offers
              no way to override it, so the real count is announced here. */}
          <span
            id={capacityLiveId}
            className="pf-v5-screen-reader"
            aria-live="polite"
          >
            {t("{{count}} users", {
              count: users,
              replace: { count: formatCount(users) },
            })}
          </span>
        </>
      )}

      {isSingleOption ? null : (
        <PackageStops
          packages={packages}
          quote={quote}
          users={users}
          onUsersChange={onUsersChange}
        />
      )}

      {!hasMultiplePackageSizes ? (
        <TextContent data-testid="pricing-single-package">
          <Text component="small">
            {t("Sold in packages of {{size}} users.", {
              size: formatCount(range.min),
            })}
          </Text>
        </TextContent>
      ) : null}

      {quote ? (
        <>
          <Divider className="pf-v5-u-my-md" />
          <DescriptionList isHorizontal isCompact>
            <DescriptionListGroup>
              <DescriptionListTerm>{t("Capacity")}</DescriptionListTerm>
              <DescriptionListDescription data-testid="pricing-capacity-value">
                {t("Up to {{count}} users", {
                  count: quote.includedUsers,
                  replace: { count: formatCount(quote.includedUsers) },
                })}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t("Price")}</DescriptionListTerm>
              <DescriptionListDescription>
                {formatMoney(quote.totalAmount, quote.currency)}{" "}
                {formatInterval(quote.interval)}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t("Effective")}</DescriptionListTerm>
              <DescriptionListDescription data-testid="pricing-per-user">
                {formatPerUser(
                  quote.totalAmount,
                  quote.includedUsers,
                  quote.currency,
                )}{" "}
                / {t("user")}
              </DescriptionListDescription>
            </DescriptionListGroup>
            <DescriptionListGroup>
              <DescriptionListTerm>{t("Currency")}</DescriptionListTerm>
              <DescriptionListDescription>
                {quote.currency.toUpperCase()}
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>

          {overshoot > 0 ? (
            <TextContent data-testid="pricing-overshoot">
              <Text component="small">
                {t(
                  "Packages come in fixed sizes, so this covers {{extra}} more than the {{requested}} users requested.",
                  {
                    extra: formatCount(overshoot),
                    requested: formatCount(quote.requestedUsers),
                  },
                )}
              </Text>
            </TextContent>
          ) : null}

          <Divider className="pf-v5-u-my-md" />

          {/* A customer will ask what makes up the total, so a mix is itemised.
              When the answer is a single package, a one-row list restating the
              headline is noise — say it in a line instead. */}
          {quote.lineItems.length === 1 ? (
            <TextContent data-testid="pricing-bundle">
              <Text component="small">
                {describeSingle(quote.lineItems[0]!)}
              </Text>
              <Text component="small" className="pf-v5-u-color-200">
                {quote.lineItems[0]!.priceId}
              </Text>
            </TextContent>
          ) : (
            <div data-testid="pricing-bundle">
              <Title headingLevel="h4" size="md" className="pf-v5-u-mb-sm">
                {t("Your packages")}
              </Title>
              {quote.lineItems.map((line) => (
                <PackageLine
                  key={line.priceId}
                  line={line}
                  currency={quote.currency}
                />
              ))}
              <Divider className="pf-v5-u-my-sm" />
              <div className="pf-v5-u-display-flex pf-v5-u-justify-content-space-between pf-v5-u-font-weight-bold">
                <span>{t("Total")}</span>
                <span>
                  {formatMoney(quote.totalAmount, quote.currency)}{" "}
                  {formatInterval(quote.interval)}
                </span>
              </div>
            </div>
          )}

          <Button
            variant="primary"
            isDisabled={isCtaDisabled || isQuoting}
            onClick={() => onChoose(quote)}
            data-testid="pricing-choose"
          >
            {ctaLabel}
          </Button>
        </>
      ) : (
        <Skeleton height="12rem" screenreaderText={t("Loading pricing")} />
      )}
    </div>
  );
};

/**
 * The paid package stops under the capacity slider.
 *
 * The slider moved and the total changed, but nothing on screen tied the two
 * together: the capacity below it ("Up to 200 users") is the SERVER's answer,
 * not the number under the thumb, so the two read as unrelated. Here every
 * buyable package is a box, and the boxes the current quote is actually made of
 * are highlighted — dragging the slider lights up what is being bought, and the
 * itemised total below is then just the same boxes written out.
 *
 * The highlight comes from the quote's line items. Nothing here decides which
 * packages cover a capacity; that stays on the server with the Stripe
 * credentials, like every other figure on this card.
 */
const PackageStops: FC<{
  packages: PricingTier[];
  quote: PricingQuote | undefined;
  users: number;
  onUsersChange: (users: number) => void;
}> = ({ packages, quote, users, onUsersChange }) => {
  const { t } = useTranslation();
  const lines = new Map(
    quote?.lineItems.map((line) => [line.priceId, line] as const),
  );

  return (
    <div>
      <TextContent className="pf-v5-u-mb-sm">
        <Text component="small">
          {quote
            ? t("Covering your {{users}} users with:", {
                users: formatCount(users),
              })
            : t("Available packages")}
        </Text>
      </TextContent>

      <div className={styles.stops} data-testid="pricing-package-stops">
        {packages.map((pkg) => {
          const line = lines.get(pkg.priceId);
          const price = formatMoney(pkg.unitAmount, pkg.currency);
          return (
            <PackageStop
              key={pkg.priceId}
              label={formatCount(pkg.userLimit)}
              // How many of this package the quote takes, when it takes more
              // than one — otherwise the box just states what the package costs.
              detail={
                line && line.packages > 1
                  ? `${line.packages} × ${price}`
                  : price
              }
              ariaLabel={t("{{size}}-user package", {
                size: formatCount(pkg.userLimit),
              })}
              isSelected={line !== undefined}
              onSelect={() => onUsersChange(pkg.userLimit)}
            />
          );
        })}
      </div>
    </div>
  );
};

const PackageStop: FC<{
  label: string;
  detail: string;
  ariaLabel: string;
  isSelected: boolean;
  onSelect: () => void;
}> = ({ label, detail, ariaLabel, isSelected, onSelect }) => {
  const { t } = useTranslation();
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={isSelected}
      aria-label={ariaLabel}
      className={isSelected ? `${styles.stop} ${styles.selected}` : styles.stop}
      data-testid="pricing-package-stop"
      data-selected={isSelected}
    >
      <span className={styles.size}>
        {label} {t("users")}
      </span>
      <span className={styles.detail}>{detail}</span>
    </button>
  );
};

/**
 * One package line: what it is and what it costs, with the Stripe price id
 * demoted to a small muted line underneath.
 *
 * The id has to stay — it is the handle an operator quotes to support, and the
 * value the eventual Checkout call uses — but on the same line as the amount it
 * was the widest thing on the card and read as the important part.
 */
const PackageLine: FC<{ line: QuoteLineItem; currency: string }> = ({
  line,
  currency,
}) => {
  const { t } = useTranslation();
  return (
    <div className="pf-v5-u-display-flex pf-v5-u-justify-content-space-between pf-v5-u-align-items-flex-start pf-v5-u-mb-sm">
      <div>
        <div>
          {line.packages} &times;{" "}
          {t("{{size}}-user package", { size: formatCount(line.userLimit) })}
        </div>
        <small className="pf-v5-u-color-200 pf-v5-u-font-size-xs">
          {line.priceId}
        </small>
      </div>
      <div className="pf-v5-u-text-nowrap pf-v5-u-ml-md">
        {formatMoney(line.subtotal, currency)}
      </div>
    </div>
  );
};

/**
 * One-line description of a single-package bundle: "One 2,500-user package" or
 * "3 x 500-user packages". Used instead of a one-row itemised table.
 */
function describeSingle(line: QuoteLineItem): string {
  const size = `${formatCount(line.userLimit)}-user package`;
  return line.packages === 1 ? `One ${size}` : `${line.packages} x ${size}s`;
}

/** Shaped like the loaded card so nothing jumps when the data lands. */
const PricingSkeleton: FC = () => (
  <div
    className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-lg"
    data-testid="pricing-loading"
  >
    <Skeleton width="40%" height="2.5rem" screenreaderText="Loading pricing" />
    <Skeleton width="60%" height="1rem" />
    <Skeleton height="1rem" />
    <Skeleton height="8rem" />
    <Skeleton width="30%" height="2.25rem" />
  </div>
);

export type { PricingTier };
