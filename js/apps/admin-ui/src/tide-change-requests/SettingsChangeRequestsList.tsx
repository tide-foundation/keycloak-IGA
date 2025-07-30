import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Button,
  ToolbarItem,
  PageSection,
  PageSectionVariants,
  EmptyState,
  EmptyStateVariant,
  EmptyStateIcon,
  EmptyStateBody,
  Title,
  Spinner,
  TextContent,
  Text,
  Label,
  ButtonVariant,
  AlertVariant,
} from "@patternfly/react-core";
import { CogIcon } from "@patternfly/react-icons";
import { useAdminClient } from "../admin-client";
import RequestedChanges from "@keycloak/keycloak-admin-client/lib/defs/RequestedChanges";
import { KeycloakDataTable } from "@keycloak/keycloak-ui-shared";
import { useAccess } from '../context/access/Access';
import { useAlerts } from '@keycloak/keycloak-ui-shared';
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";

interface SettingsChangeRequestsListProps {
  updateCounter: (count: number) => void;
}

export const SettingsChangeRequestsList = ({ updateCounter }: SettingsChangeRequestsListProps) => {
  const { t } = useTranslation();
  const { adminClient } = useAdminClient();
  const { addAlert } = useAlerts();
  const [requests, setRequests] = useState<RequestedChanges[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedRequests, setSelectedRequests] = useState<RequestedChanges[]>([]);
  const [key, setKey] = useState<number>(0);
  const [approveRecord, setApproveRecord] = useState<boolean>(false);
  const [commitRecord, setCommitRecord] = useState<boolean>(false);

  const refresh = () => {
    setSelectedRequests([]);
    setKey((prev: number) => prev + 1);
  };

  const loadRequests = async () => {
    try {
      const data = await adminClient.tideUsersExt.getRequestedChangesForRealmSettings();
      setRequests(data);
      updateCounter(data.length);
      return data;
    } catch (error) {
      console.error("Failed to load settings requests:", error);
      setRequests([]);
      updateCounter(0);
      return [];
    }
  };

  useEffect(() => {
    if (!selectedRequests || !selectedRequests[0]) {
      setApproveRecord(false);
      setCommitRecord(false);
      return;
    }

    const { status, deleteStatus } = selectedRequests[0];

    // Disable both buttons if status is DENIED
    if (status === "DENIED" || deleteStatus === "DENIED") {
      setApproveRecord(false);
      setCommitRecord(false);
      return;
    }

    // Enable Approve button if the record is PENDING or DRAFT
    if (
      status === "PENDING" ||
      status === "DRAFT" ||
      (status === "ACTIVE" && (deleteStatus === "DRAFT" || deleteStatus === "PENDING"))
    ) {
      setApproveRecord(true);
      setCommitRecord(false);
      return;
    }

    // Enable Commit button if status or deleteStatus is APPROVED
    if (status === "APPROVED" || deleteStatus === "APPROVED") {
      setCommitRecord(true);
      setApproveRecord(false);
      return;
    }

    // Default: Disable both buttons
    setApproveRecord(false);
    setCommitRecord(false);
  }, [selectedRequests]);

  const handleApprove = async () => {
    try {
      const changeRequests = selectedRequests.map(x => ({
        changeSetId: x.draftRecordId,
        changeSetType: x.changeSetType || "REALM_SETTINGS",
        actionType: x.actionType,
      }));
      
      await adminClient.tideUsersExt.approveDraftChangeSet({ changeSets: changeRequests });
      addAlert(t("Settings change request approved"), AlertVariant.success);
      refresh();
    } catch (error: any) {
      addAlert(error.responseData || "Failed to approve request", AlertVariant.danger);
    }
  };

  const handleCommit = async () => {
    try {
      const changeRequests = selectedRequests.map(x => ({
        changeSetId: x.draftRecordId,
        changeSetType: x.changeSetType || "REALM_SETTINGS",
        actionType: x.actionType,
      }));
      
      await adminClient.tideUsersExt.commitDraftChangeSet({ changeSets: changeRequests });
      addAlert(t("Settings change request committed"), AlertVariant.success);
      refresh();
    } catch (error: any) {
      addAlert(error.responseData || "Failed to commit request", AlertVariant.danger);
    }
  };

  const [toggleCancelDialog, CancelConfirm] = useConfirmDialog({
    titleKey: "Cancel Settings Change Request",
    children: (
      <>
        {"Are you sure you want to cancel this settings change request?"}
      </>
    ),
    continueButtonLabel: "cancel",
    cancelButtonLabel: "back",
    continueButtonVariant: ButtonVariant.danger,
    onConfirm: async () => {
      try {
        const changeSetArray = selectedRequests.map((row) => ({
          changeSetId: row.draftRecordId,
          changeSetType: row.changeSetType || "REALM_SETTINGS",
          actionType: row.actionType
        }));

        await adminClient.tideUsersExt.cancelDraftChangeSet({changeSets: changeSetArray});
        addAlert(t("Settings change request cancelled"), AlertVariant.success);
        refresh();
      } catch (error) {
        addAlert("Error cancelling settings change request", AlertVariant.danger);
      }
    },
  });

  const ToolbarItemsComponent = () => {
    const { hasAccess } = useAccess();
    const isManager = hasAccess("manage-clients");

    if (!isManager) return <span />;

    return (
      <>
        <ToolbarItem>
          <Button variant="primary" isDisabled={!approveRecord} onClick={handleApprove}>
            {t("Review Draft")}
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="secondary" isDisabled={!commitRecord} onClick={handleCommit}>
            {t("Commit Draft")}
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button variant="secondary" isDanger onClick={() => toggleCancelDialog()}>
            {t("Cancel Draft")}
          </Button>
        </ToolbarItem>
        <CancelConfirm />
      </>
    );
  };

  const statusLabel = (row: RequestedChanges) => {
    return (
      <>
        {(row.status === "DRAFT" || row.deleteStatus === "DRAFT") && (
          <Label className="keycloak-admin--role-mapping__client-name">
            {"DRAFT"}
          </Label>
        )}
        {(row.status === "PENDING" || row.deleteStatus === "PENDING") && (
          <Label color="orange" className="keycloak-admin--role-mapping__client-name">
            {"PENDING"}
          </Label>
        )}
        {(row.status === "APPROVED" || row.deleteStatus === "APPROVED") && (
          <Label color="blue" className="keycloak-admin--role-mapping__client-name">
            {"APPROVED"}
          </Label>
        )}
        {(row.status === "DENIED" || row.deleteStatus === "DENIED") && (
          <Label color="red" className="keycloak-admin--role-mapping__client-name">
            {"DENIED"}
          </Label>
        )}
      </>
    );
  };

  const columns = [
    {
      name: 'Request Type',
      displayKey: 'Request Type',
      cellRenderer: (row: RequestedChanges) => row.requestType
    },
    {
      name: 'Action',
      displayKey: 'Action',
      cellRenderer: (row: RequestedChanges) => row.actionType
    },
    {
      name: 'Status',
      displayKey: 'Status',
      cellRenderer: (row: RequestedChanges) => statusLabel(row)
    },
    {
      name: 'Requested By',
      displayKey: 'Requested By',
      cellRenderer: (row: RequestedChanges) => row.userRecord[0]?.username || t("unknown")
    },
  ];

  return (
    <div className="keycloak__events_table">
      <KeycloakDataTable
        key={key}
        toolbarItem={<ToolbarItemsComponent />}
        isRadio={true}
        loader={loadRequests}
        ariaLabelKey="Settings Change Requests"
        columns={columns}
        isPaginated
        onSelect={(value: RequestedChanges[]) => setSelectedRequests([...value])}
        emptyState={
          <EmptyState variant="lg">
            <EmptyStateIcon icon={CogIcon} />
            <Title headingLevel="h4" size="lg">
              {t("noSettingsChangeRequests")}
            </Title>
            <EmptyStateBody>
              <TextContent>
                <Text>No settings change requests found.</Text>
              </TextContent>
            </EmptyStateBody>
          </EmptyState>
        }
      />
    </div>
  );
};