import type { RequiredActionAlias } from "@keycloak/keycloak-admin-client/lib/defs/requiredActionProviderRepresentation";
import { AlertVariant, Form, ModalVariant } from "@patternfly/react-core";
import { isEmpty } from "lodash-es";
import { useEffect, useState } from "react";
import { FormProvider, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAdminClient } from "../../admin-client";
import { getErrorMessage, useAlerts } from "@keycloak/keycloak-ui-shared";
import { ConfirmDialogModal } from "../../components/confirm-dialog/ConfirmDialog";
import { LifespanField } from "./LifespanField";
import { RequiredActionMultiSelect } from "./RequiredActionMultiSelect";
import { useRealm } from "../../context/realm-context/RealmContext";
import { useIsIgaEnabled } from "../../utils/useIsIgaEnabled";

type ResetCredentialDialogProps = {
  userId: string;
  onClose: () => void;
};

type CredentialResetForm = {
  actions: RequiredActionAlias[];
  lifespan: number | undefined;
};

export const ResetCredentialDialog = ({
  userId,
  onClose,
}: ResetCredentialDialogProps) => {
  const { adminClient } = useAdminClient();
  const { realmRepresentation: realm } = useRealm();
  const { t } = useTranslation();
  const form = useForm<CredentialResetForm>({
    defaultValues: {
      actions: [],
      lifespan: realm.actionTokenGeneratedByAdminLifespan,
    },
  });
  const { handleSubmit, control } = form;

  const resetActionWatcher = useWatch({
    control,
    name: "actions",
  });
  const resetIsNotDisabled = !isEmpty(resetActionWatcher);

  const { addAlert, addError } = useAlerts();

  /* TIDECLOAK IMPLEMENTATION */
  const igaEnabled = useIsIgaEnabled();
  const [committed, setCommitted] = useState<boolean | undefined>(undefined);

  useEffect(() => {
    let cancelled = false;
    if (!igaEnabled) {
      setCommitted(undefined);
      return;
    }
    const loadCommitted = async () => {
      try {
        const result = await adminClient.tideAdmin.getUserCommitted({
          id: userId,
        });
        if (!cancelled) setCommitted(result.committed);
      } catch {
        // fail-open: leave committed unknown so the link stays enabled and the
        // backend RFC-9457 block is the hard gate.
        if (!cancelled) setCommitted(undefined);
      }
    };
    void loadCommitted();
    return () => {
      cancelled = true;
    };
  }, [adminClient, igaEnabled, userId]);

  // Press-guard for the Send Email handler. (Copy Link no longer uses this:
  // the backend getRequiredActionLink endpoint owns its own eligibility check
  // and returns a reason message.) Returns true if the Tide invite action is
  // allowed to proceed; otherwise surfaces an info notice and returns false so
  // the caller bails BEFORE any side effect (email send).
  const ensureTideInviteAllowed = async (
    actions: RequiredActionAlias[],
  ): Promise<boolean> => {
    if (!igaEnabled) return true;
    // Only gate the Tide link action; other reset actions flow normally.
    if (!actions.includes("link-tide-account-action" as RequiredActionAlias)) {
      return true;
    }
    // Resolve committed reliably AT PRESS TIME; don't trust a possibly
    // unresolved proactive fetch.
    let c = committed;
    if (c === undefined) {
      try {
        c = (await adminClient.tideAdmin.getUserCommitted({ id: userId }))
          .committed;
        setCommitted(c);
      } catch {
        // Fetch failed -> fall through; the backend RFC-9457 block on the
        // Copy Link / email path is the backstop.
        c = undefined;
      }
    }
    if (c === false) {
      addAlert(t("tideInviteBlockedUncommittedUser"), AlertVariant.info);
      return false;
    }
    return true;
  };

  const sendCredentialsResetEmail = async ({
    actions,
    lifespan,
  }: CredentialResetForm) => {
    if (isEmpty(actions)) {
      return;
    }

    if (!(await ensureTideInviteAllowed(actions))) {
      return;
    }

    try {
      await adminClient.users.executeActionsEmail({
        id: userId,
        actions,
        lifespan,
      });
      addAlert(t("credentialResetEmailSuccess"), AlertVariant.success);
      onClose();
    } catch (error) {
      addError("credentialResetEmailError", error);
    }
  };

  /* TIDECLOAK IMPLEMENTATION */
  const getLinkTideAccountBtn = async () => {
    const actions = form.getValues("actions");
    const lifespan = form.getValues("lifespan");
    if (isEmpty(actions)) {
      return;
    }

    // The backend getRequiredActionLink endpoint now owns ALL eligibility
    // logic (committed + tideInvitable). We no longer pre-check here; we just
    // call it and, on a 400, surface the backend's specific reason message as
    // an info notice without copying anything.
    try {
      const response = await adminClient.tideAdmin.getRequiredActionLink({
        userId,
        actions,
        lifespan,
      });

      await navigator.clipboard.writeText(response);
      addAlert(t("Link copied to clipboard"), AlertVariant.success);
      onClose();
    } catch (error) {
      // Extract the backend's RFC-9457 reason (problem.detail) via the shared
      // getErrorMessage helper; fall back to a generic key if none is present.
      const reason = getErrorMessage(error);
      addAlert(
        reason || t("tideInviteBlockedUncommittedUser"),
        AlertVariant.info,
      );
    }
  };

  return (
    <ConfirmDialogModal
      variant={ModalVariant.medium}
      titleKey="credentialReset"
      open
      onCancel={onClose}
      toggleDialog={onClose}
      continueButtonLabel="credentialResetConfirm"
      onConfirm={async () => {
        await handleSubmit(sendCredentialsResetEmail)();
      }}
      confirmButtonDisabled={!resetIsNotDisabled}
    >
      <Form
        id="userCredentialsReset-form"
        isHorizontal
        data-testid="credential-reset-modal"
      >
        <FormProvider {...form}>
          <RequiredActionMultiSelect
            name="actions"
            label="resetAction"
            help="resetActions"
          />
          <LifespanField />
        </FormProvider>
      </Form>

      {/* TIDECLOAK IMPLEMENTATION */}
      <button
        type="button"
        onClick={async () => {
          await getLinkTideAccountBtn();
        }}
        style={{ marginTop: "1rem" }}
      >
        Copy Link
      </button>
    </ConfirmDialogModal>
  );
};
