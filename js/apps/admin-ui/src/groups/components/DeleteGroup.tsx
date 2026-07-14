import type GroupRepresentation from "@keycloak/keycloak-admin-client/lib/defs/groupRepresentation";
import { ButtonVariant } from "@patternfly/react-core";
import { useTranslation } from "react-i18next";
import { useGroupResource } from "../../context/group-resource/GroupResourceContext";
import { useNavigate } from "react-router-dom"; // TIDECLOAK IMPLEMENTATION
import { useAlerts } from "@keycloak/keycloak-ui-shared";
import { ConfirmDialogModal } from "../../components/confirm-dialog/ConfirmDialog";
import { useRealm } from "../../context/realm-context/RealmContext";
import { notifyIfPendingChangeRequest } from "../../utils/pendingChangeRequest"; // TIDECLOAK IMPLEMENTATION

type DeleteConfirmProps = {
  selectedRows: GroupRepresentation[];
  show: boolean;
  toggleDialog: () => void;
  refresh: () => void;
};

export const DeleteGroup = ({
  selectedRows,
  show,
  toggleDialog,
  refresh,
}: DeleteConfirmProps) => {
  const groups = useGroupResource();

  const { t } = useTranslation();
  const { addAlert, addError } = useAlerts();
  const { realm } = useRealm();
  const navigate = useNavigate();

  const multiDelete = async () => {
    try {
      // TIDECLOAK IMPLEMENTATION: a governed DELETE returns 202 + a pending
      // change-request envelope (the agent unwraps it; `del` is typed void but
      // resolves with the parsed body). Detect it with the established helper;
      // pending groups still exist, so we surface the notice and never report
      // them as deleted. Count how many actually deleted vs went pending.
      let deletedCount = 0;
      for (const group of selectedRows) {
        // TIDECLOAK IMPLEMENTATION: 26.7.0 routes group ops through
        // useGroupResource(); capture the result so the IGA envelope survives.
        const result = await groups.del({
          id: group.id!,
        });
        const pending = notifyIfPendingChangeRequest(
          result,
          t,
          addAlert,
          { realm, navigate },
          {
            titleKey: "deletePendingChangeRequestCreated",
            useEnvelopeMessage: true,
          },
        );
        if (!pending) {
          deletedCount++;
        }
      }
      refresh();
      if (deletedCount > 0) {
        addAlert(t("groupDeleted", { count: deletedCount }));
      }
    } catch (error) {
      addError("groupDeleteError", error);
    }
  };

  return (
    <ConfirmDialogModal
      titleKey={t("deleteConfirmTitle", { count: selectedRows.length })}
      messageKey={t("deleteConfirmGroup", {
        count: selectedRows.length,
        groupName: selectedRows[0]?.name,
      })}
      continueButtonLabel="delete"
      continueButtonVariant={ButtonVariant.danger}
      onConfirm={multiDelete}
      open={show}
      toggleDialog={toggleDialog}
    />
  );
};
