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
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
} from "@patternfly/react-table";
import { CogIcon } from "@patternfly/react-icons";
import { useAdminClient } from "../admin-client";
import RequestedChanges from "@keycloak/keycloak-admin-client/lib/defs/RequestedChanges";
import { KeycloakDataTable } from "@keycloak/keycloak-ui-shared";
import { useAccess } from '../context/access/Access';
import { useAlerts, useEnvironment } from '@keycloak/keycloak-ui-shared';
import { useRealm } from "../context/realm-context/RealmContext";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { groupRequestsByDraftId, BundledRequest } from './utils/bundleUtils';
import { useCurrentUser } from '../utils/useCurrentUser';
import { ApprovalEnclave } from "heimdall-tide";
import { Modal, ModalVariant } from "@patternfly/react-core";


interface SettingsChangeRequestsListProps {
  updateCounter: (count: number) => void;
}

export const SettingsChangeRequestsList = ({ updateCounter }: SettingsChangeRequestsListProps) => {
  const { t } = useTranslation();
  const { adminClient } = useAdminClient();
  const { addAlert } = useAlerts();
  const currentUser = useCurrentUser();
  const [selectedRow, setSelectedRow] = useState<BundledRequest[]>([]);
  const [key, setKey] = useState<number>(0);
  const [approveRecord, setApproveRecord] = useState<boolean>(false);
  const [commitRecord, setCommitRecord] = useState<boolean>(false);
  const [showEmailConfirmModal, setShowEmailConfirmModal] = useState<boolean>(false);
  const [userCount, setUserCount] = useState<number>(0);
  const { keycloak } = useEnvironment();
  const { realmRepresentation } = useRealm();


  const refresh = () => {
    setSelectedRow([]);
    setKey((prev: number) => prev + 1);
  };

  const loader = async () => {
    try {
      const requests = await adminClient.tideUsersExt.getRequestedChangesForRagnarokSettings();
      const bundledRequests = groupRequestsByDraftId(requests);
      updateCounter(bundledRequests.length);
      return bundledRequests;
    } catch (error) {
      console.error("Failed to load settings requests:", error);
      updateCounter(0);
      return [];
    }
  };

  useEffect(() => {
    if (!selectedRow || !selectedRow[0]) {
      setApproveRecord(false);
      setCommitRecord(false);
      return;
    }

    const firstBundle = selectedRow[0];
    const allRequests = firstBundle.requests;

    if (!allRequests || !allRequests[0]) {
      setApproveRecord(false);
      setCommitRecord(false);
      return;
    }

    const { status, deleteStatus } = allRequests[0];

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
  }, [selectedRow]);

  const handleApprove = async () => {
    try {
      const allRequests = selectedRow.flatMap(bundle => bundle.requests);
      const changeRequests = allRequests.map(x => ({
        changeSetId: x.draftRecordId,
        changeSetType: x.changeSetType,
        actionType: x.actionType,
      }));

      const response: string[] = await adminClient.tideUsersExt.approveDraftChangeSet({ changeSets: changeRequests });

      if (response.length === 1) {
        const respObj = JSON.parse(response[0]);
        if (respObj.requiresApprovalPopup === "true") {
          const orkURL = new URL(respObj.uri);
          const heimdall = new ApprovalEnclave({
            homeOrkOrigin: orkURL.origin,
            voucherURL: "",
            signed_client_origin: "",
            vendorId: ""
          }).init([keycloak.tokenParsed!['vuid']], respObj.uri);
          const authApproval = await heimdall.getAuthorizerApproval(respObj.changeSetRequests, "Offboard:1", respObj.expiry, "base64url");

          if (authApproval.draft === respObj.changeSetRequests) {
            if (authApproval.accepted === false) {
              const formData = new FormData();
              formData.append("changeSetId", allRequests[0].draftRecordId)
              formData.append("actionType", allRequests[0].actionType);
              formData.append("changeSetType", allRequests[0].changeSetType);
              await adminClient.tideAdmin.addRejection(formData)
            }
            else {
              const authzAuthn = await heimdall.getAuthorizerAuthentication();
              const formData = new FormData();
              formData.append("changeSetId", allRequests[0].draftRecordId)
              formData.append("actionType", allRequests[0].actionType);
              formData.append("changeSetType", allRequests[0].changeSetType);
              formData.append("authorizerApproval", authApproval.data);
              formData.append("authorizerAuthentication", authzAuthn);
              await adminClient.tideAdmin.addAuthorization(formData)
            }
          }
          heimdall.close();
        }
        refresh();
      }
    } catch (error: any) {
      addAlert(error.responseData || "Failed to approve request", AlertVariant.danger);
    }
  };

  const handleCommit = async () => {
    try {
      const allRequests = selectedRow.flatMap(bundle => bundle.requests);
      const hasRagnarokRequest = allRequests.some(req => req.changeSetType.toLowerCase() === "ragnarok");
      
      if (hasRagnarokRequest) {
        // Get user count and show modal BEFORE committing
        const users = await adminClient.users.find();
        setUserCount(users.length);
        setShowEmailConfirmModal(true);
        return; // Wait for user decision
      }

      // No Ragnarok request, proceed with normal commit
      const changeRequests = allRequests.map(x => ({
        changeSetId: x.draftRecordId,
        changeSetType: x.changeSetType,
        actionType: x.actionType,
      }));

      await adminClient.tideUsersExt.commitDraftChangeSet({ changeSets: changeRequests });
      addAlert(t("Settings change request committed"), AlertVariant.success);
      refresh();
    } catch (error: any) {
      addAlert(error.responseData || "Failed to commit request", AlertVariant.danger);
    }
  };

  const handleSendEmails = async () => {
    try {
      // First commit the changeset
      const allRequests = selectedRow.flatMap(bundle => bundle.requests);
      const changeRequests = allRequests.map(x => ({
        changeSetId: x.draftRecordId,
        changeSetType: x.changeSetType,
        actionType: x.actionType,
      }));

      
      // Then send emails
      const users = await adminClient.users.find();
      await Promise.all(
        users.map(user =>
          adminClient.users.executeActionsEmail({
            id: user.id!,
            actions: ["UPDATE_PASSWORD"],
            lifespan: 43200,
          })
        )
      );
      
      await adminClient.tideUsersExt.commitDraftChangeSet({ changeSets: changeRequests });
      addAlert(t(`Settings committed and emails sent to ${userCount} users`), AlertVariant.success);
      setShowEmailConfirmModal(false);
      refresh();
    } catch (error: any) {
      addAlert(error.responseData || "Failed to send emails", AlertVariant.danger);
      setShowEmailConfirmModal(false);
    }
  };

  const handleSkipEmails = async () => {
    try {
      // Commit the changeset without sending emails
      const allRequests = selectedRow.flatMap(bundle => bundle.requests);
      const changeRequests = allRequests.map(x => ({
        changeSetId: x.draftRecordId,
        changeSetType: x.changeSetType,
        actionType: x.actionType,
      }));

      await adminClient.tideUsersExt.commitDraftChangeSet({ changeSets: changeRequests });
      addAlert(t("Settings change request committed"), AlertVariant.success);
      setShowEmailConfirmModal(false);
      refresh();
    } catch (error: any) {
      addAlert(error.responseData || "Failed to commit request", AlertVariant.danger);
      setShowEmailConfirmModal(false);
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
        const allRequests = selectedRow.flatMap(bundle => bundle.requests);
        const changeSetArray = allRequests.map((row) => ({
          changeSetId: row.draftRecordId,
          changeSetType: row.changeSetType || "RAGNAROK",
          actionType: row.actionType
        }));

        await adminClient.tideUsersExt.cancelDraftChangeSet({ changeSets: changeSetArray });
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

  const bundleStatusLabel = (bundle: BundledRequest) => {
    const statuses = [...new Set(bundle.requests.map((r: any) => r.status === "ACTIVE" ? r.deleteStatus || r.status : r.status))];

    if (statuses.length === 1) {
      const status = statuses[0] as string;
      return (
        <Label
          color={status === 'PENDING' ? 'orange' : status === 'APPROVED' ? 'blue' : status === 'DENIED' ? 'red' : 'grey'}
          className="keycloak-admin--role-mapping__client-name"
        >
          {status}
        </Label>
      );
    } else {
      return (
        <Label color="purple" className="keycloak-admin--role-mapping__client-name">
          MIXED
        </Label>
      );
    }
  };

  const statusLabel = (row: any) => {
    const status = row.status === "ACTIVE" ? row.deleteStatus || row.status : row.status;
    return (
      <Label
        color={status === 'PENDING' ? 'orange' : status === 'APPROVED' ? 'blue' : status === 'DENIED' ? 'red' : 'grey'}
        className="keycloak-admin--role-mapping__client-name"
      >
        {status}
      </Label>
    );
  };

  const DetailCell = (bundle: BundledRequest) => (
    <Table
      aria-label="Bundle details"
      variant={'compact'}
      borders={false}
      isStriped
    >
      <Thead>
        <Tr>
          <Th width={15}>Action</Th>
          <Th width={15}>Request Type</Th>
          <Th width={15}>Change Set Type</Th>
          <Th width={15}>Action Type</Th>
          <Th width={10}>Status</Th>
          <Th width={15}>Realm ID</Th>
        </Tr>
      </Thead>
      <Tbody>
        {bundle.requests.map((request: any, index: number) => (
          <Tr key={index}>
            <Td dataLabel="Action">{request.action}</Td>
            <Td dataLabel="Request Type">{request.requestType}</Td>
            <Td dataLabel="Change Set Type">{request.changeSetType}</Td>
            <Td dataLabel="Action Type">{request.actionType}</Td>
            <Td dataLabel="Status">{statusLabel(request)}</Td>
            <Td dataLabel="Realm ID">{request.realmId}</Td>
          </Tr>
        ))}
      </Tbody>
    </Table>
  );

  const columns = [
    {
      name: 'Summary',
      displayKey: 'Summary',
      cellRenderer: (bundle: BundledRequest) => {
        if (bundle.requests.length === 1) {
          const request = bundle.requests[0];
          return (
            <div>
              <div className="pf-v5-u-font-weight-bold">
                {request.action}
              </div>
              <div className="pf-v5-u-color-200">
                {request.requestType} • {request.changeSetType}
              </div>
            </div>
          );
        } else {
          const actions = [...new Set(bundle.requests.map((r: any) => r.action))];
          const types = [...new Set(bundle.requests.map((r: any) => r.requestType))];
          return (
            <div>
              <div className="pf-v5-u-font-weight-bold">
                {bundle.requests.length} changes: {actions.join(', ')}
              </div>
              <div className="pf-v5-u-color-200">
                {types.join(', ')}
              </div>
            </div>
          );
        }
      }
    },
    {
      name: 'Requested By',
      displayKey: 'Requested By',
      cellRenderer: (bundle: BundledRequest) => bundle.requestedBy || currentUser?.username || t("unknown")
    },
    {
      name: 'Status',
      displayKey: 'Status',
      cellRenderer: (bundle: BundledRequest) => bundleStatusLabel(bundle)
    },
  ];

  return (
    <>
      <div className="keycloak__events_table">
        <KeycloakDataTable
          key={key}
          toolbarItem={<ToolbarItemsComponent />}
          isRadio={true}
          loader={loader}
          ariaLabelKey="Settings Change Requests"
          detailColumns={[
            {
              name: "details",
              cellRenderer: DetailCell,
            },
          ]}
          columns={columns}
          isPaginated
          onSelect={(value: BundledRequest[]) => setSelectedRow([...value])}
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
      <CancelConfirm />
      
      <Modal
        variant={ModalVariant.small}
        title="Send Password Reset Emails"
        isOpen={showEmailConfirmModal}
        onClose={() => setShowEmailConfirmModal(false)}
        actions={
          !realmRepresentation?.smtpServer || Object.keys(realmRepresentation.smtpServer).length === 0 
            ? [
                <Button key="send" variant="primary" onClick={handleSkipEmails}>
                  Continue with offboarding
                </Button>,
                <Button key="close" variant="primary" onClick={() => setShowEmailConfirmModal(false)}>
                  Close
                </Button>
              ]
            : [
                <Button key="send" variant="primary" onClick={handleSendEmails}>
                  Send Emails to {userCount} Users and Offboard
                </Button>,
                <Button key="skip" variant="secondary" onClick={handleSkipEmails}>
                  Skip Email Notification
                </Button>,
              ]
        }
      >
        <TextContent>
          {!realmRepresentation?.smtpServer || Object.keys(realmRepresentation.smtpServer).length === 0 ? (
            <>
              <Text>
                A Ragnarok (offboarding) request is ready to be committed, which will affect <strong>{userCount}</strong> user/s in the realm.
              </Text>
              <Text className="pf-v5-u-mt-md pf-v5-u-color-danger">
                <strong>No SMTP server is configured for this realm.</strong> You will need to manually email user/s to reset their passwords.
                <br>
                <br>
                <strong>ENSURE YOU HAVE SET A PASSWORD FOR YOUR OWN ADMIN ACCOUNT BEFORE CONTINUING.</strong>

              </Text>
            </>
          ) : (
            <>
              <Text>
                A Ragnarok (offboarding) request has been committed. Would you like to send password reset emails to all {userCount} user/s in the realm?
              </Text>
              <Text className="pf-v5-u-mt-md pf-v5-u-color-200">
                This will require all users to reset their passwords within 12 hours.
                <br>
                <br>
                <strong>ENSURE YOU HAVE SET A PASSWORD FOR YOUR OWN ADMIN ACCOUNT BEFORE CONTINUING.</strong>
              </Text>
            </>
          )}
        </TextContent>
      </Modal>
    </>
  );
};