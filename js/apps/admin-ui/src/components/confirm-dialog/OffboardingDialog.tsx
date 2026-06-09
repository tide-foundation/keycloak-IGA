/** TIDECLOAK IMPLEMENTATION */
import { ReactElement, useState } from "react";
import {
  Button,
  ButtonVariant,
  Modal,
  ModalVariant,
  TextInput,
  FormGroup,
  Alert,
} from "@patternfly/react-core";
import { useTranslation } from "react-i18next";

export const useOffboardingDialog = (
  props: OffboardingDialogProps,
): [() => void, () => ReactElement] => {
  const [show, setShow] = useState(false);

  function toggleDialog() {
    setShow((show) => !show);
  }

  const Dialog = () => (
    <OffboardingDialogModal
      key="offboardingDialog"
      {...props}
      open={show}
      toggleDialog={toggleDialog}
    />
  );
  return [toggleDialog, Dialog];
};

export interface OffboardingDialogModalProps extends OffboardingDialogProps {
  open: boolean;
  toggleDialog: () => void;
}

export type OffboardingDialogProps = {
  titleKey: string;
  messageKey: string;
  confirmationText: string;
  onConfirm: () => void;
  onCancel?: () => void;
  // TIDECLOAK IMPLEMENTATION — pre-flight offboarding checklist
  // Whether an SMTP server is configured on the realm. Drives the WARN
  // (not-configured) vs INFO (configured) guidance shown before the
  // typed-confirmation gate. This is advisory only — it NEVER disables the
  // Offboard button (the typed-confirm remains the sole gate).
  smtpConfigured?: boolean;
  // Navigate the admin to the realm-settings Email tab so they can configure
  // SMTP. Shown as an inline link when SMTP is not configured.
  onConfigureEmail?: () => void;
};

export const OffboardingDialogModal = ({
  titleKey,
  messageKey,
  confirmationText,
  onConfirm,
  onCancel,
  smtpConfigured = false,
  onConfigureEmail,
  open = true,
  toggleDialog,
}: OffboardingDialogModalProps) => {
  const { t } = useTranslation();
  const [inputValue, setInputValue] = useState("");

  const isConfirmationValid = inputValue === confirmationText;

  const handleConfirm = () => {
    if (isConfirmationValid) {
      onConfirm();
      toggleDialog();
    }
  };

  const handleClose = () => {
    setInputValue("");
    toggleDialog();
  };

  return (
    <Modal
      title={t(titleKey, "Offboard Provider")}
      isOpen={open}
      onClose={handleClose}
      variant={ModalVariant.small}
      actions={[
        <Button
          id="modal-confirm"
          data-testid="confirm"
          key="confirm"
          isDisabled={!isConfirmationValid}
          variant={ButtonVariant.danger}
          onClick={handleConfirm}
        >
          {t("offboard", "Offboard")}
        </Button>,
        <Button
          id="modal-cancel"
          data-testid="cancel"
          key="cancel"
          variant={ButtonVariant.link}
          onClick={() => {
            if (onCancel) onCancel();
            handleClose();
          }}
        >
          {t("cancel")}
        </Button>,
      ]}
    >
      <div className="pf-v5-u-mb-md">
        {t(
          messageKey,
          "Are you sure you want to offboard this provider? This action cannot be undone.",
        )}
      </div>
      {/* TIDECLOAK IMPLEMENTATION — pre-flight offboarding checklist.
          WARN-only: nothing here disables the Offboard button. */}
      {smtpConfigured ? (
        <Alert
          variant="info"
          isInline
          isPlain
          title={t("offboardingSmtpConfiguredInfo")}
          className="pf-v5-u-mb-md"
        />
      ) : (
        <Alert
          variant="warning"
          isInline
          title={t("offboardingSmtpMissingWarning")}
          className="pf-v5-u-mb-md"
        >
          {onConfigureEmail && (
            <Button
              variant={ButtonVariant.link}
              isInline
              data-testid="offboarding-configure-email"
              onClick={onConfigureEmail}
            >
              {t("offboardingConfigureEmailLink")}
            </Button>
          )}
        </Alert>
      )}
      <Alert
        variant="warning"
        isInline
        title={t("offboardingAdminPasswordWarning")}
        className="pf-v5-u-mb-md"
      />
      <FormGroup
        label={t(
          "offboardingConfirmationLabel",
          `Type "${confirmationText}" to confirm:`,
          { text: confirmationText },
        )}
        fieldId="offboarding-confirmation"
        isRequired
      >
        <TextInput
          id="offboarding-confirmation"
          data-testid="offboarding-confirmation"
          value={inputValue}
          onChange={(_event, value) => setInputValue(value)}
          placeholder={confirmationText}
        />
      </FormGroup>
    </Modal>
  );
};
