/**
 * TIDECLOAK IMPLEMENTATION
 *
 * The subscription page, opened from "Manage".
 *
 * Everything an operator does to a live subscription in one place: see what
 * they have, change how much of it they get, and leave for Stripe when the
 * thing they want is Stripe's to own.
 *
 * The split is deliberate. CAPACITY is ours: it is priced from the Stripe
 * packages by the server's optimizer, applied against the existing billing
 * anchor, and has to agree with what the license provisions. PAYMENT DETAILS,
 * INVOICES AND CANCELLATION are Stripe's: they are its hosted flows, they carry
 * their own compliance surface, and rebuilding them here would mean holding
 * card data we have no reason to touch.
 *
 * So this page owns the first and links out for the second, rather than
 * dropping the operator straight into the Stripe portal — where capacity is
 * either absent or, if the portal were configured to allow it, a list of raw
 * prices with no cheapest-mix calculation behind it.
 */
import {
  Alert,
  Button,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  Modal,
  ModalVariant,
  Text,
  TextContent,
  Title,
} from "@patternfly/react-core";
import { ExternalLinkAltIcon } from "@patternfly/react-icons";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { EnterprisePricing } from "./EnterprisePricing";
import type { PricingQuote } from "./pricingApi";

export type ManageSubscriptionModalProps = {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  realm: string;
  /** Capacity the realm holds today. */
  currentUsers?: string;
  /** Users actually in the realm — the floor a downgrade cannot go below. */
  usersInUse?: string;
  expiry?: string;
  /** Receives the server's quote. Success means ACCEPTED, not yet applied. */
  onChangeCapacity: (quote: PricingQuote) => void;
  isSubmitting?: boolean;
  /** Opens Stripe's hosted portal: payment method, invoices, cancellation. */
  onOpenStripePortal: () => void;
  /** Shown when the payer refuses for want of a card. */
  needsCard?: boolean;
  /**
   * Whether a card is on file. Null while unknown. When false the capacity
   * change is disabled with an explanation, so the operator is not invited to
   * pick a plan that will be refused.
   */
  hasPaymentMethod?: boolean | null;
  /**
   * Whether the payer supports package-based capacity at all. False on an
   * older payer, where the page shows only the Stripe portal link — offering a
   * capacity control it would silently mishandle is worse than not offering it.
   */
  canChangeCapacity?: boolean;
  onAddPaymentMethod?: () => void;
};

export const ManageSubscriptionModal: FC<ManageSubscriptionModalProps> = ({
  isOpen,
  onClose,
  serverBaseUrl,
  realm,
  currentUsers,
  usersInUse,
  expiry,
  onChangeCapacity,
  isSubmitting = false,
  onOpenStripePortal,
  needsCard = false,
  hasPaymentMethod = null,
  canChangeCapacity = true,
  onAddPaymentMethod,
}) => {
  const { t } = useTranslation();

  // Only block on a definite "no". While it is unknown the change stays
  // available and the server's own guard remains the backstop — better than
  // disabling a working control because a status call was slow.
  const blockedOnCard = hasPaymentMethod === false;

  return (
    <Modal
      variant={ModalVariant.large}
      title={t("Manage subscription")}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="close" variant="link" onClick={onClose}>
          {t("Close")}
        </Button>,
      ]}
    >
      <DescriptionList isHorizontal isCompact>
        <DescriptionListGroup>
          <DescriptionListTerm>{t("Capacity")}</DescriptionListTerm>
          <DescriptionListDescription>
            {currentUsers ? t("Up to {{n}} users", { n: currentUsers }) : "-"}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>{t("In use")}</DescriptionListTerm>
          <DescriptionListDescription>
            {usersInUse ?? "-"}
          </DescriptionListDescription>
        </DescriptionListGroup>
        <DescriptionListGroup>
          <DescriptionListTerm>{t("Renews")}</DescriptionListTerm>
          <DescriptionListDescription>
            {expiry ?? "-"}
          </DescriptionListDescription>
        </DescriptionListGroup>
      </DescriptionList>

      {needsCard || blockedOnCard ? (
        <Alert
          variant="warning"
          isInline
          className="pf-v5-u-mt-md"
          title={t("Add a payment method to change capacity.")}
        >
          <p>
            {t(
              "There is no card on file — the free plan never needed one. Paid capacity is charged as soon as it is applied, so a card has to be saved first.",
            )}
          </p>
          <Button variant="link" isInline onClick={onAddPaymentMethod}>
            {t("Add a payment method")}
          </Button>
        </Alert>
      ) : null}

      {canChangeCapacity ? (
        <>
          <Divider className="pf-v5-u-my-lg" />

          <Title headingLevel="h3" size="md" className="pf-v5-u-mb-sm">
            {t("Change capacity")}
          </Title>
          <TextContent className="pf-v5-u-mb-md">
            <Text component="small">
              {t(
                "You are charged the difference for the rest of this billing period, and your renewal date does not change.",
              )}
            </Text>
          </TextContent>

          {/* The free plan is not a choice here: picking it would be a downgrade to
          a different plan rather than a capacity change. */}
          <EnterprisePricing
            serverBaseUrl={serverBaseUrl}
            realm={realm}
            showFreePlan={false}
            onChoose={onChangeCapacity}
            ctaLabel={isSubmitting ? t("Submitting…") : t("Apply change")}
            isCtaDisabled={isSubmitting || blockedOnCard}
          />
        </>
      ) : null}

      <Divider className="pf-v5-u-my-lg" />

      <Title headingLevel="h3" size="md" className="pf-v5-u-mb-sm">
        {t("Billing and cancellation")}
      </Title>
      <TextContent className="pf-v5-u-mb-md">
        <Text component="small">
          {t(
            "Payment details, invoices and cancelling are handled by Stripe on its own hosted pages.",
          )}
        </Text>
      </TextContent>
      <Button
        variant="secondary"
        onClick={onOpenStripePortal}
        icon={<ExternalLinkAltIcon />}
      >
        {t("Open Stripe portal")}
      </Button>
    </Modal>
  );
};
