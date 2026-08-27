/**
 * TIDECLOAK IMPLEMENTATION
 *
 * "Buy more units" for a realm that already holds a subscription.
 *
 * A modal rather than an inline field because choosing capacity is the same
 * decision as the initial purchase — a slider over the Stripe packages, the
 * server's quote, and the itemised bundle behind it. The bare number box this
 * replaces gave a figure to type with nothing to type it against: no price
 * until after submitting, and no sense of where the cheaper steps are.
 *
 * The card is the same one the no-licence state uses, so the two paths cannot
 * drift apart.
 */
import { Button, Modal, ModalVariant } from "@patternfly/react-core";
import { FC } from "react";
import { useTranslation } from "react-i18next";
import { EnterprisePricing } from "./EnterprisePricing";
import type { PricingQuote } from "./pricingApi";

export type ChangeCapacityModalProps = {
  isOpen: boolean;
  onClose: () => void;
  serverBaseUrl: string;
  realm: string;
  /** Capacity the realm holds today, shown so the change has a reference. */
  currentUsers?: string;
  /** Receives the server's quote. Success means ACCEPTED, not yet applied. */
  onConfirm: (quote: PricingQuote) => void;
  isSubmitting?: boolean;
};

export const ChangeCapacityModal: FC<ChangeCapacityModalProps> = ({
  isOpen,
  onClose,
  serverBaseUrl,
  realm,
  currentUsers,
  onConfirm,
  isSubmitting = false,
}) => {
  const { t } = useTranslation();

  return (
    <Modal
      variant={ModalVariant.medium}
      title={t("Change capacity")}
      description={t(
        "You currently have {{current}} users. You are charged the difference for the rest of this billing period, and your renewal date does not change.",
        { current: currentUsers ?? t("an unknown number of") },
      )}
      isOpen={isOpen}
      onClose={onClose}
      actions={[
        <Button key="cancel" variant="link" onClick={onClose}>
          {t("Cancel")}
        </Button>,
      ]}
    >
      {/* The confirm button lives INSIDE the card: it is the card that knows
          which quote is on screen, and a footer button would have to reach back
          in for it. */}
      <EnterprisePricing
        serverBaseUrl={serverBaseUrl}
        realm={realm}
        onChoose={onConfirm}
        ctaLabel={isSubmitting ? t("Submitting…") : t("Confirm change")}
        isCtaDisabled={isSubmitting}
      />
    </Modal>
  );
};
