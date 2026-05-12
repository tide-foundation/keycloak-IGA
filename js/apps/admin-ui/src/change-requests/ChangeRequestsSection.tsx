/** TIDECLOAK IMPLEMENTATION */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertVariant,
  Button,
  ButtonVariant,
  EmptyState,
  Label,
  Modal,
  ModalVariant,
  PageSection,
  Switch,
  Tab,
  TabTitleText,
  Tabs,
  Text,
  TextContent,
  ToolbarItem,
} from "@patternfly/react-core";
import { useAlerts, KeycloakDataTable } from "@keycloak/keycloak-ui-shared";

import { useAdminClient } from "../admin-client";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { ViewHeader } from "../components/view-header/ViewHeader";

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type { IgaChangeRequestStatus } from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

import { canApprove } from "./canApprove";
import { useCurrentUserRoles } from "./useCurrentUserRoles";
import { actionTypeLabel, entityTypeLabel, formatTime } from "./formatters";
import { ChangeRequestsDetail } from "./ChangeRequestsDetail";

const TAB_KEYS: IgaChangeRequestStatus[] = ["PENDING", "APPROVED", "DENIED"];
const POLL_INTERVAL_MS = 5000;

type AuthorizeResult = {
  id: string;
  ok: boolean;
  error?: string;
};

function RequiredRolesCell({ cr }: { cr: IgaChangeRequest }) {
  const roles = cr.requiredApproverRoles ?? [];
  if (roles.length === 0) {
    return (
      <span className="pf-v5-u-color-200 pf-v5-u-font-size-sm">
        (no roles required)
      </span>
    );
  }
  return (
    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
      {roles.map((r) => (
        <Label key={r} isCompact color="blue">
          {r}
        </Label>
      ))}
    </div>
  );
}

type ToolbarProps = {
  activeStatus: IgaChangeRequestStatus;
  onlyMine: boolean;
  setOnlyMine: (v: boolean) => void;
  approvableCount: number;
  isProcessing: boolean;
  onAuthorizeBulk: () => void;
};

function ChangeRequestsToolbar({
  activeStatus,
  onlyMine,
  setOnlyMine,
  approvableCount,
  isProcessing,
  onAuthorizeBulk,
}: ToolbarProps) {
  if (activeStatus !== "PENDING") return null;
  return (
    <>
      <ToolbarItem>
        <Switch
          id="change-requests-only-mine"
          label="Only show CRs I can approve"
          isChecked={onlyMine}
          onChange={(_e, v) => setOnlyMine(v)}
        />
      </ToolbarItem>
      <ToolbarItem>
        <Button
          variant="primary"
          isDisabled={approvableCount === 0 || isProcessing}
          isLoading={isProcessing}
          onClick={onAuthorizeBulk}
        >
          {`Authorize selected${
            approvableCount > 0 ? ` (${approvableCount})` : ""
          }`}
        </Button>
      </ToolbarItem>
    </>
  );
}

export default function ChangeRequestsSection() {
  const { adminClient } = useAdminClient();
  const { addAlert, addError } = useAlerts();
  const userRoles = useCurrentUserRoles();

  const [activeStatus, setActiveStatus] =
    useState<IgaChangeRequestStatus>("PENDING");
  const [onlyMine, setOnlyMine] = useState(false);
  const [selected, setSelected] = useState<IgaChangeRequest[]>([]);
  const [tableKey, setTableKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<AuthorizeResult[] | null>(
    null,
  );

  const refresh = useCallback(() => {
    setSelected([]);
    setTableKey((k) => k + 1);
  }, []);

  // Polling refresh while a tab is active.
  useEffect(() => {
    const interval = setInterval(() => {
      setTableKey((k) => k + 1);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [activeStatus]);

  const loader = useCallback(async (): Promise<IgaChangeRequest[]> => {
    try {
      const rows = await adminClient.iga.listChangeRequests({
        status: activeStatus,
      });
      if (activeStatus !== "PENDING" || !onlyMine) return rows;
      return rows.filter((cr) => canApprove(cr, userRoles));
    } catch (err) {
      addError("Failed to load change requests", err);
      return [];
    }
  }, [adminClient, activeStatus, onlyMine, userRoles, addError]);

  const approvableSelection = useMemo(
    () => selected.filter((cr) => canApprove(cr, userRoles)),
    [selected, userRoles],
  );
  const nonApprovableCount = selected.length - approvableSelection.length;

  const [toggleAuthorizeDialog, AuthorizeConfirm] = useConfirmDialog({
    titleKey: "Authorize change requests",
    continueButtonLabel: "Authorize",
    continueButtonVariant: ButtonVariant.primary,
    cancelButtonLabel: "Cancel",
    children: (
      <>
        {`Authorize ${approvableSelection.length} change request${
          approvableSelection.length === 1 ? "" : "s"
        }?`}
        {nonApprovableCount > 0 && (
          <>
            {" "}
            {`(${nonApprovableCount} of ${selected.length} selected cannot be authorized with your current roles and will be skipped.)`}
          </>
        )}
      </>
    ),
    onConfirm: async () => {
      setIsProcessing(true);
      const results: AuthorizeResult[] = [];
      for (const cr of approvableSelection) {
        try {
          await adminClient.iga.authorize({ id: cr.id });
          results.push({ id: cr.id, ok: true });
        } catch (err: any) {
          results.push({
            id: cr.id,
            ok: false,
            error: err?.responseData || err?.message || String(err),
          });
        }
      }
      setIsProcessing(false);
      setBulkResults(results);
      const okCount = results.filter((r) => r.ok).length;
      if (okCount === results.length) {
        addAlert(
          `${okCount} change request${okCount === 1 ? "" : "s"} authorized.`,
          AlertVariant.success,
        );
      } else if (okCount > 0) {
        addAlert(
          `${okCount} of ${results.length} change request${
            results.length === 1 ? "" : "s"
          } authorized.`,
          AlertVariant.warning,
        );
      } else {
        addAlert("No change requests were authorized.", AlertVariant.danger);
      }
      refresh();
    },
  });

  const onAuthorizeBulk = () => {
    if (approvableSelection.length === 0) return;
    toggleAuthorizeDialog();
  };

  const onAuthorizeRow = useCallback(
    async (cr: IgaChangeRequest) => {
      if (!canApprove(cr, userRoles)) return;
      setIsProcessing(true);
      try {
        await adminClient.iga.authorize({ id: cr.id });
        addAlert("Change request authorized.", AlertVariant.success);
        refresh();
      } catch (err) {
        addError("Failed to authorize change request", err);
      } finally {
        setIsProcessing(false);
      }
    },
    [adminClient, userRoles, addAlert, addError, refresh],
  );

  const columns = useMemo(
    () => [
      {
        name: "actionType",
        displayKey: "Action",
        cellRenderer: (cr: IgaChangeRequest) => actionTypeLabel(cr.actionType),
      },
      {
        name: "entityType",
        displayKey: "Entity Type",
        cellRenderer: (cr: IgaChangeRequest) => entityTypeLabel(cr.entityType),
      },
      {
        name: "entityId",
        displayKey: "Entity",
        cellRenderer: (cr: IgaChangeRequest) => cr.entityId ?? "-",
      },
      {
        name: "createdBy",
        displayKey: "Created By",
        cellRenderer: (cr: IgaChangeRequest) => cr.createdBy ?? "-",
      },
      {
        name: "createdAt",
        displayKey: "Created At",
        cellRenderer: (cr: IgaChangeRequest) => formatTime(cr.createdAt),
      },
      {
        name: "authorizations",
        displayKey: "Authorizations",
        cellRenderer: (cr: IgaChangeRequest) => (
          <span>
            {cr.authCount} / {cr.threshold}
          </span>
        ),
      },
      {
        name: "requiredApproverRoles",
        displayKey: "Required Roles",
        cellRenderer: (cr: IgaChangeRequest) => <RequiredRolesCell cr={cr} />,
      },
      {
        name: "scopeMode",
        displayKey: "Scope",
        cellRenderer: (cr: IgaChangeRequest) => (
          <Label isCompact color={cr.scopeMode === "all" ? "orange" : "grey"}>
            {cr.scopeMode === "all" ? "all required" : "any one"}
          </Label>
        ),
      },
    ],
    [],
  );

  const actionResolver = useCallback(
    (rowData: any) => {
      const cr: IgaChangeRequest = rowData.data;
      const actions: {
        title: string;
        onClick: () => void;
        isDisabled?: boolean;
      }[] = [
        {
          title: "Open",
          onClick: () => setDetailId(cr.id),
        },
      ];
      if (activeStatus === "PENDING") {
        actions.push({
          title: "Authorize",
          isDisabled: !canApprove(cr, userRoles) || isProcessing,
          onClick: () => {
            void onAuthorizeRow(cr);
          },
        });
      }
      return actions;
    },
    [activeStatus, userRoles, isProcessing, onAuthorizeRow],
  );

  return (
    <>
      <ViewHeader
        titleKey="Change Requests"
        subKey="Review and authorize change requests that require administrator approval."
        divider={false}
      />
      <PageSection variant="light" className="pf-v5-u-p-0">
        <Tabs
          activeKey={activeStatus}
          onSelect={(_e, key) => {
            setActiveStatus(key as IgaChangeRequestStatus);
            setSelected([]);
          }}
          isBox
        >
          {TAB_KEYS.map((status) => (
            <Tab
              key={status}
              eventKey={status}
              title={<TabTitleText>{actionTypeLabel(status)}</TabTitleText>}
            >
              {activeStatus === status && (
                <div className="keycloak__events_table">
                  <KeycloakDataTable
                    key={`${status}-${tableKey}`}
                    loader={loader}
                    ariaLabelKey="Change Requests"
                    toolbarItem={
                      <ChangeRequestsToolbar
                        activeStatus={activeStatus}
                        onlyMine={onlyMine}
                        setOnlyMine={setOnlyMine}
                        approvableCount={approvableSelection.length}
                        isProcessing={isProcessing}
                        onAuthorizeBulk={onAuthorizeBulk}
                      />
                    }
                    columns={columns}
                    actionResolver={actionResolver}
                    isPaginated
                    canSelectAll={status === "PENDING"}
                    onSelect={
                      status === "PENDING"
                        ? (value: IgaChangeRequest[]) => setSelected([...value])
                        : undefined
                    }
                    emptyState={
                      <EmptyState variant="lg">
                        <TextContent>
                          <Text>{`No ${status.toLowerCase()} change requests.`}</Text>
                        </TextContent>
                      </EmptyState>
                    }
                  />
                </div>
              )}
            </Tab>
          ))}
        </Tabs>
      </PageSection>

      <AuthorizeConfirm />

      {bulkResults && (
        <Modal
          variant={ModalVariant.small}
          title="Bulk authorize results"
          isOpen
          onClose={() => setBulkResults(null)}
          actions={[
            <Button
              key="close"
              variant="primary"
              onClick={() => setBulkResults(null)}
            >
              Close
            </Button>,
          ]}
        >
          <TextContent>
            <Text>
              {`${bulkResults.filter((r) => r.ok).length} succeeded, ${
                bulkResults.filter((r) => !r.ok).length
              } failed.`}
            </Text>
          </TextContent>
          {bulkResults.filter((r) => !r.ok).length > 0 && (
            <ul style={{ marginTop: 8 }}>
              {bulkResults
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.id}>
                    <code>{r.id}</code>: {r.error || "unknown error"}
                  </li>
                ))}
            </ul>
          )}
        </Modal>
      )}

      {detailId && (
        <ChangeRequestsDetail
          id={detailId}
          userRoles={userRoles}
          onClose={() => setDetailId(null)}
          onChanged={() => {
            setDetailId(null);
            refresh();
          }}
        />
      )}
    </>
  );
}
