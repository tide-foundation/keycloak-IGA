/**
 * TIDECLOAK IMPLEMENTATION
 *
 * The Enterprise pricing card that REPLACES the old bare "Request License"
 * button on the licensing tab.
 *
 * That button stood for one fixed plan (`LicensingTiers.Free`) and told the
 * operator nothing about capacity or cost. Here the operator states how many
 * users they need and the SERVER answers with the cheapest bundle of Stripe
 * packages that covers it, itemised, before they commit.
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
  Card,
  CardBody,
  CardTitle,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Skeleton,
  Slider,
  Text,
  TextContent,
  Title,
} from "@patternfly/react-core";
import { FC, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { capacityRange, snapCapacity, type CapacityRange } from "./capacity";
import {
  formatCount,
  formatInterval,
  formatMoney,
  formatPerUser,
} from "./format";
import type { PricingQuote, PricingTier, QuoteLineItem } from "./pricingApi";
import {
  usePricingQuote,
  usePricingTiers,
  useDebouncedValue,
} from "./usePricing";

export type EnterprisePricingProps = {
  /** Keycloak's server root (`environment.serverBaseUrl`); the pricing
   *  endpoints are same-origin with it. */
  serverBaseUrl: string;
  realm: string;
  /** Invoked with the server's quote when the operator commits. */
  onChoose: (quote: PricingQuote) => void;
  ctaLabel?: string;
  isCtaDisabled?: boolean;
};

export const EnterprisePricing: FC<EnterprisePricingProps> = ({
  serverBaseUrl,
  realm,
  onChoose,
  ctaLabel,
  isCtaDisabled = false,
}) => {
  const { t } = useTranslation();
  const packages = usePricingTiers(serverBaseUrl, realm);
  const [users, setUsers] = useState<number | null>(null);

  const range = packages.tiers ? capacityRange(packages.tiers) : null;

  // Open on the smallest package once the catalogue lands, so the card starts
  // on a real, quotable capacity rather than an invented default.
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

  return (
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
              "No active Stripe price on the configured Enterprise product carries a valid user_limit.",
            )}
          </Alert>
        ) : (
          <CapacityChooser
            range={range}
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
};

/**
 * How many packages the track spans when Stripe offers only ONE package size.
 * Not a price: it is the width of a convenience control, and any count beyond
 * it stays reachable through the numeric input.
 */
const MULTI_BUY_STOPS = 10;

type ChooserProps = {
  range: CapacityRange;
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
  users,
  onUsersChange,
  quote,
  isQuoting,
  onChoose,
  ctaLabel,
  isCtaDisabled,
}) => {
  const { t } = useTranslation();

  // With a single package size in Stripe, min === max, so the packages give no
  // range to slide over. Capacity still varies — you can buy several of the one
  // package — so the track spans multiples of that package instead, and the
  // label below says so rather than implying a choice of sizes.
  const hasMultiplePackageSizes = range.max > range.min;
  const sliderMax = hasMultiplePackageSizes
    ? range.max
    : range.min * MULTI_BUY_STOPS;
  const sliderStep = hasMultiplePackageSizes ? range.step : range.min;

  // A count typed above the track's top is still quotable (packages combine);
  // it just pins the thumb at the end.
  const sliderValue = Math.min(Math.max(users, range.min), sliderMax);
  const overshoot = quote ? quote.includedUsers - quote.requestedUsers : 0;

  return (
    <div className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-lg">
      {/* Headline: the quoted total, straight from the server. */}
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

      <TextContent>
        <Text component="h4">{t("How many users do you need?")}</Text>
      </TextContent>

      <Slider
        min={range.min}
        max={sliderMax}
        step={sliderStep}
        value={sliderValue}
        inputValue={users}
        isInputVisible
        inputLabel={t("users")}
        inputAriaLabel={t("Exact number of users")}
        showBoundaries
        // PatternFly reports the typed value as `inputValue` and the dragged one
        // as `value`; both are snapped onto a capacity the packages can express
        // exactly, so we never ask the server to quote 1,234 when the packages
        // step in hundreds.
        onChange={(_event, value, inputValue) =>
          onUsersChange(snapCapacity(inputValue ?? value, range))
        }
        data-testid="pricing-slider"
      />

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

          {/* A customer will ask what makes up the total, so a mix is itemised.
              When the answer is a single package, a one-row list restating the
              headline is noise — say it in a line instead. */}
          {quote.lineItems.length === 1 ? (
            <TextContent data-testid="pricing-bundle">
              <Text component="small">
                {describeSingle(quote.lineItems[0]!)} &middot;{" "}
                {quote.lineItems[0]!.priceId}
              </Text>
            </TextContent>
          ) : (
            <div data-testid="pricing-bundle">
              <TextContent>
                <Text component="h4">{t("Your packages")}</Text>
              </TextContent>
              <DescriptionList isHorizontal isCompact>
                {quote.lineItems.map((line) => (
                  <DescriptionListGroup key={line.priceId}>
                    <DescriptionListTerm>
                      {line.packages} &times;{" "}
                      {t("{{size}}-user package", {
                        size: formatCount(line.userLimit),
                      })}
                    </DescriptionListTerm>
                    <DescriptionListDescription>
                      {formatMoney(line.subtotal, quote.currency)}{" "}
                      <Text component="small">{line.priceId}</Text>
                    </DescriptionListDescription>
                  </DescriptionListGroup>
                ))}
              </DescriptionList>
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
