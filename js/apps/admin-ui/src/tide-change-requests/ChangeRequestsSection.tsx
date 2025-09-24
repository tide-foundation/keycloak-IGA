import React, { useState, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import {
  TextContent,
  Text,
  EmptyState,
  PageSection,
  Tab,
  TabTitleText,
  ClipboardCopy,
  ClipboardCopyVariant,
  Label,
  Button,
  ToolbarItem,
  AlertVariant,
  ButtonVariant,
} from "@patternfly/react-core";
import { KeycloakDataTable } from "@keycloak/keycloak-ui-shared";
import RoleChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/RoleChangeRequest";
import RequestChangesUserRecord from "@keycloak/keycloak-admin-client/lib/defs/RequestChangesUserRecord";
import { ViewHeader } from "../components/view-header/ViewHeader";
import { useAdminClient } from "../admin-client";
import "../events/events.css";
import helpUrls from "../help-urls";
import { RoutableTabs, useRoutableTab } from "../components/routable-tabs/RoutableTabs";
import { ChangeRequestsTab, toChangeRequests } from "./routes/ChangeRequests";
import { useRealm } from "../context/realm-context/RealmContext";
import { RolesChangeRequestsList } from "./RolesChangeRequestsList";
import { ClientChangeRequestsList } from "./ClientChangeRequestsList";
// import { RealmSettingsChangeRequestsList } from './RealmSettingsChangeRequestsList';
// import { SettingsChangeRequestsList } from './SettingsChangeRequestsList';
import { groupRequestsByDraftId } from "./utils/bundleUtils";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { useAccess } from "../context/access/Access";
import DraftChangeSetRequest from "@keycloak/keycloak-admin-client/lib/defs/DraftChangeSetRequest";
import { useEnvironment, useAlerts } from "@keycloak/keycloak-ui-shared";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { findTideComponent } from "../identity-providers/utils/SignSettingsUtil";
import { ApprovalEnclave } from "heimdall-tide";

/** ---------------------------
 * Utilities for bulk merge
 * --------------------------*/

type ActionType = "ADD" | "REMOVE" | "UPDATE" | string;

type ChangeSetRef = {
  changeSetId: string;
  changeSetType: string;
  actionType: ActionType;
  // optional metadata to help merging
  role?: string;
  requestType?: string;
  clientId?: string;
  userId?: string;
};

type MergedContext = {
  key: string; // `${userId}|${clientId}`
  userId?: string;
  clientId?: string;
  actions: ChangeSetRef[]; // normalized actions that survived cancellation/dedup
  source: RoleChangeRequest[]; // original selected rows that fed this group
};

// Build a stable key per user-context
const userClientKey = (userId?: string, clientId?: string) => `${userId ?? ""}|${clientId ?? ""}`;

// Normalize actions within a user-context: cancel out opposing actions on same target
const normalizeActions = (items: ChangeSetRef[]): ChangeSetRef[] => {
  const map = new Map<string, ChangeSetRef>();
  for (const it of items) {
    // Build target key using the most stable fields we have
    const target = `${it.changeSetType}|${it.role ?? ""}|${it.clientId ?? ""}`;
    const existing = map.get(target);
    if (!existing) {
      map.set(target, it);
      continue;
    }
    const pair = `${existing.actionType}>${it.actionType}`;
    if (pair === "ADD>REMOVE" || pair === "REMOVE>ADD") {
      // Opposing actions cancel to no-op
      map.delete(target);
    } else {
      // UPDATE or duplicate: last write wins
      map.set(target, it);
    }
  }
  return Array.from(map.values());
};

// Extract per-request (possibly multiple userRecords) into ChangeSetRefs with user/client
const expandSelectedToRefs = (reqs: RoleChangeRequest[]): ChangeSetRef[] => {
  const out: ChangeSetRef[] = [];
  for (const r of reqs) {
    // Some payloads carry userRecord array; fall back to request-level client/user if needed
    const uRecords: any[] = Array.isArray((r as any).userRecord) ? (r as any).userRecord : [];
    if (uRecords.length === 0) {
      out.push({
        changeSetId: (r as any).draftRecordId || (r as any).changeSetId,
        changeSetType: (r as any).changeSetType,
        actionType: (r as any).actionType,
        role: (r as any).role,
        requestType: (r as any).requestType,
        clientId: (r as any).clientId,
        userId: (r as any).userId,
      });
    } else {
      for (const u of uRecords) {
        out.push({
          changeSetId: (r as any).draftRecordId || (r as any).changeSetId,
          changeSetType: (r as any).changeSetType,
          actionType: (r as any).actionType,
          role: (r as any).role,
          requestType: (r as any).requestType,
          clientId: u.clientId ?? (r as any).clientId,
          userId: u.userId ?? u.username ?? (r as any).userId,
        });
      }
    }
  }
  return out;
};

// Merge selected rows into user-context groups
const mergeByUserClient = (selected: RoleChangeRequest[]): MergedContext[] => {
  const refs = expandSelectedToRefs(selected);
  const buckets = new Map<string, ChangeSetRef[]>();

  for (const ref of refs) {
    const k = userClientKey(ref.userId, ref.clientId);
    if (!buckets.has(k)) buckets.set(k, []);
    buckets.get(k)!.push(ref);
  }

  const merged: MergedContext[] = [];
  for (const [key, items] of buckets.entries()) {
    const norm = normalizeActions(items);
    if (norm.length === 0) continue; // nothing left after cancellation
    merged.push({
      key,
      userId: items[0]?.userId,
      clientId: items[0]?.clientId,
      actions: norm,
      source: selected.filter((r) =>
        items.some((i) => (r as any).draftRecordId === i.changeSetId)
      ),
    });
  }
  return merged;
};

/** ---------------------------
 * Component
 * --------------------------*/

export interface changeSetApprovalRequest {
  message: string;
  uri: string;
  changeSetRequests: string;
  requiresApprovalPopup: string;
  expiry: string;
}

export default function ChangeRequestsSection() {
  const { adminClient } = useAdminClient();
  const { keycloak } = useEnvironment();
  const { addAlert, addError } = useAlerts();
  const { t } = useTranslation();
  const { realm } = useRealm();
  const [key, setKey] = useState<number>(0);
  const refresh = () => {
    setSelectedRow([]);
    setKey((prev: number) => prev + 1);
  };

  const [selectedRow, setSelectedRow] = useState<RoleChangeRequest[]>([]);
  const [commitRecord, setCommitRecord] = useState<boolean>(false);
  const [approveRecord, setApproveRecord] = useState<boolean>(false);
  const [userRequestCount, setUserRequestCount] = useState(0);
  const [roleRequestCount, setRoleRequestCount] = useState(0);
  const [clientRequestCount, setClientRequestCount] = useState(0);
  const [realmSettingsRequestCount, setRealmSettingsRequestCount] = useState(0);
  const [isTideEnabled, setIsTideEnabled] = useState<boolean>(true);

  useEffect(() => {
    const checkTide = async () => {
      const isTideKeyEnabled =
        (await findTideComponent(adminClient, realm)) === undefined ? false : true;
      setIsTideEnabled(isTideKeyEnabled);
    };
    checkTide();
  }, [adminClient, realm]);

  // Enable/disable toolbar buttons based on FIRST selected request (kept from your logic)
  useEffect(() => {
    if (!selectedRow || !selectedRow[0]) {
      setApproveRecord(false);
      setCommitRecord(false);
      return;
    }

    const { status, deleteStatus } = selectedRow[0] as any;

    if (status === "DENIED" || deleteStatus === "DENIED") {
      setApproveRecord(false);
      setCommitRecord(false);
      return;
    }

    if (
      status === "PENDING" ||
      status === "DRAFT" ||
      (status === "ACTIVE" &&
        (deleteStatus === "DRAFT" || deleteStatus === "PENDING"))
    ) {
      setApproveRecord(true);
      setCommitRecord(false);
      return;
    }

    if (status === "APPROVED" || deleteStatus === "APPROVED") {
      setCommitRecord(true);
      setApproveRecord(false);
      return;
    }

    setApproveRecord(false);
    setCommitRecord(false);
  }, [selectedRow]);

  /** ---------------------------
   * Toolbar (approve / commit / cancel)
   * --------------------------*/
  const ToolbarItemsComponent = () => {
    const { t } = useTranslation();
    const { hasAccess } = useAccess();
    const isManager = hasAccess("manage-clients");

    if (!isManager) return <span />;

    return (
      <>
        <ToolbarItem>
          <Button
            variant="primary"
            isDisabled={!approveRecord || selectedRow.length === 0}
            onClick={() => handleApproveButtonClick(selectedRow)}
          >
            {isTideEnabled ? t("Review Draft") : t("Approve Draft")}
          </Button>
        </ToolbarItem>
        <ToolbarItem>
          <Button
            variant="secondary"
            isDisabled={!commitRecord || selectedRow.length === 0}
            onClick={() => handleCommitButtonClick(selectedRow)}
          >
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

  /** ---------------------------
   * Approve (bulk, with merge)
   * - Tide IGA: sign per merged user-context (no commit here).
   * - Non-Tide: try approve API if present; otherwise no-op (keeps 2-step UX).
   * --------------------------*/
  const handleApproveButtonClick = async (selected: RoleChangeRequest[]) => {
    try {
      const merged = mergeByUserClient(selected);

      // @ts-ignore tideUserExt is attached at runtime
      const tide = adminClient.tideUserExt;

      if (!isTideEnabled) {
        // Non-Tide: if backend exposes approve endpoint, use it; otherwise keep as a no-op (approval recorded elsewhere)
        for (const mc of merged) {
          const changeSets = mc.actions.map((a) => ({
            changeSetId: a.changeSetId,
            changeSetType: a.changeSetType,
            actionType: a.actionType,
          }));
          if (typeof tide.approveDraftChangeSet === "function") {
            await tide.approveDraftChangeSet({ changeSets });
          }
        }
        refresh();
        return;
      }

      // Tide IGA: Approval Enclave route (sign only)
      // If server returns a signed flow/voucher requirement, call signChangeSet per merged context.
      for (const mc of merged) {
        const changeSets = mc.actions.map((a) => ({
          changeSetId: a.changeSetId,
          changeSetType: a.changeSetType,
          actionType: a.actionType,
        }));

        // Option A: backend handles enclave inside sign/batch
        await tide.signChangeSet({ changeSets });

        // Option B (if you need user-interactive popup, preserved from your code):
        // If your backend returns a JSON message that requires browser approval flow,
        // you can integrate it here (left out for brevity since signChangeSet handles batch).
      }

      refresh();
    } catch (error: any) {
      addAlert(error?.responseData ?? String(error), AlertVariant.danger);
    }
  };

  /** ---------------------------
   * Commit (bulk, with merge)
   * - Commit per merged user-context after signing (Tide) or directly (non-Tide).
   * --------------------------*/
  const handleCommitButtonClick = async (selected: RoleChangeRequest[]) => {
    try {
      const merged = mergeByUserClient(selected);

      // @ts-ignore tideUserExt is attached at runtime
      const tide = adminClient.tideUserExt;

      for (const mc of merged) {
        const changeSets = mc.actions.map((a) => ({
          changeSetId: a.changeSetId,
          changeSetType: a.changeSetType,
          actionType: a.actionType,
        }));
        await tide.commitDraftChangeSet({ changeSets });
      }
      refresh();
    } catch (error: any) {
      addAlert(error?.responseData ?? String(error), AlertVariant.danger);
    }
  };

  /** ---------------------------
   * Cancel (bulk)
   * --------------------------*/
  const [toggleCancelDialog, CancelConfirm] = useConfirmDialog({
    titleKey: "Cancel Change Request",
    children: <>{"Are you sure you want to cancel this change request?"}</>,
    continueButtonLabel: "cancel",
    cancelButtonLabel: "back",
    continueButtonVariant: ButtonVariant.danger,
    onConfirm: async () => {
      try {
        // @ts-ignore tideUserExt is attached at runtime
        const tide = adminClient.tideUserExt;
        const changeSetArray = selectedRow.map((row: any) => ({
          changeSetId: row.draftRecordId ?? row.changeSetId,
          changeSetType: row.changeSetType,
          actionType: row.actionType,
        }));
        await tide.cancelDraftChangeSet({ changeSets: changeSetArray });
        addAlert(t("Change request cancelled"), AlertVariant.success);
        refresh();
      } catch (error) {
        addError("Error cancelling change request", error);
      }
    },
  });

  /** ---------------------------
   * Columns and render helpers
   * --------------------------*/
  const columns = [
    {
      name: "Summary",
      displayKey: "Summary",
      cellRenderer: (bundle: any) => {
        if (bundle.requests.length === 1) {
          const request = bundle.requests[0];
          return (
            <div>
              <div className="pf-v5-u-font-weight-bold">{request.action}</div>
              <div className="pf-v5-u-color-200">
                {request.role ? `Role: ${request.role}` : ""}{" "}
                {request.clientId ? `• Client: ${request.clientId}` : ""}
              </div>
            </div>
          );
        } else {
          const actions = [...new Set(bundle.requests.map((r: any) => r.action))];
          const types = [...new Set(bundle.requests.map((r: any) => r.requestType))];
          return (
            <div>
              <div className="pf-v5-u-font-weight-bold">
                {bundle.requests.length} changes: {actions.join(", ")}
              </div>
              <div className="pf-v5-u-color-200">{types.join(", ")}</div>
            </div>
          );
        }
      },
    },
    {
      name: "Status",
      displayKey: "Status",
      cellRenderer: (bundle: any) => bundleStatusLabel(bundle),
    },
  ];

  const bundleStatusLabel = (bundle: any) => {
    const statuses = [
      ...new Set(
        bundle.requests.map((r: any) => (r.status === "ACTIVE" ? r.deleteStatus || r.status : r.status))
      ),
    ];

    if (statuses.length === 1) {
      const status = statuses[0] as string;
      return (
        <Label
          color={
            status === "PENDING"
              ? "orange"
              : status === "APPROVED"
              ? "blue"
              : status === "DENIED"
              ? "red"
              : "grey"
          }
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
        color={status === "PENDING" ? "orange" : status === "APPROVED" ? "blue" : status === "DENIED" ? "red" : "grey"}
        className="keycloak-admin--role-mapping__client-name"
      >
        {status}
      </Label>
    );
  };

  const parseAndFormatJson = (str: string) => {
    try {
      const jsonObject = JSON.parse(str);
      return JSON.stringify(jsonObject, null, 2);
    } catch (e) {
      return "Invalid JSON";
    }
  };

  const columnNames = {
    username: "Affected User",
    clientId: "Affected Client",
    accessDraft: "Access Draft",
  };

  const DetailCell = (bundle: any) => (
    <Table aria-label="Bundle details" variant={"compact"} borders={false} isStriped>
      <Thead>
        <Tr>
          <Th width={10}>Action</Th>
          <Th width={10}>Role</Th>
          <Th width={10}>Client ID</Th>
          <Th width={10}>Type</Th>
          <Th width={10}>Status</Th>
          <Th width={15} modifier="wrap">
            Affected User
          </Th>
          <Th width={15} modifier="wrap">
            Affected Client
          </Th>
          <Th width={40}>Access Draft</Th>
        </Tr>
      </Thead>
      <Tbody>
        {bundle.requests.map((request: any, index: number) =>
          request.userRecord.map((userRecord: any, userIndex: number) => (
            <Tr key={`${index}-${userIndex}`}>
              <Td dataLabel="Action">{request.action}</Td>
              <Td dataLabel="Role">{request.role}</Td>
              <Td dataLabel="Client ID">{request.clientId}</Td>
              <Td dataLabel="Type">{request.requestType}</Td>
              <Td dataLabel="Status">{statusLabel(request)}</Td>
              <Td dataLabel="Affected User">{userRecord.username}</Td>
              <Td dataLabel="Affected Client">{userRecord.clientId}</Td>
              <Td dataLabel={columnNames.accessDraft}>
                <ClipboardCopy
                  isCode
                  isReadOnly
                  hoverTip="Copy"
                  clickTip="Copied"
                  variant={ClipboardCopyVariant.expansion}
                >
                  {parseAndFormatJson(userRecord.accessDraft)}
                </ClipboardCopy>
              </Td>
            </Tr>
          ))
        )}
      </Tbody>
    </Table>
  );

  /** ---------------------------
   * Counters & loaders
   * --------------------------*/
  const updateClientCounter = (counter: number) => {
    if (counter !== clientRequestCount) {
      setClientRequestCount(counter);
    }
  };
  const updateRoleCounter = (counter: number) => {
    if (counter !== roleRequestCount) {
      setRoleRequestCount(counter);
    }
  };
  const updateRealmSettingsCounter = (counter: number) => {
    if (counter !== realmSettingsRequestCount) {
      setRealmSettingsRequestCount(counter);
    }
  };

  const loadUserRequests = async () => {
    try {
      // @ts-ignore tideUserExt is attached at runtime
      const tide = adminClient.tideUserExt;
      // New backend list call; fall back to old shape if needed
      const raw = await (tide.getUserChangeRequests
        ? tide.getUserChangeRequests({ status: "ALL", first: 0, max: 200 })
        : []);
      // If your backend already returns bundles, you can skip this:
      const bundledRequests = groupRequestsByDraftId(raw);
      setUserRequestCount(bundledRequests.length);
      return bundledRequests;
    } catch (error) {
      return [];
    }
  };

  const loader = async () => {
    return loadUserRequests();
  };

  /** ---------------------------
   * Tabs
   * --------------------------*/
  const useTab = (tab: ChangeRequestsTab) => {
    return useRoutableTab(toChangeRequests({ realm, tab }));
  };

  const userRequestsTab = useTab("users");
  const roleRequestsTab = useTab("roles");
  const clientRequestsTab = useTab("clients");
  const settingsRequestsTab = useTab("settings");

  // const updateSettingsCounter = (counter: number) => {
  //   if (counter !== realmSettingsRequestCount) {
  //     setRealmSettingsRequestCount(counter);
  //   }
  // };

  return (
    <>
      <ViewHeader
        titleKey="Change Requests"
        subKey="Change requests are change requests that require approval from administrators"
        helpUrl={helpUrls.changeRequests}
        divider={false}
      />
      <PageSection data-testid="change-request-page" variant="light" className="pf-v5-u-p-0">
        <RoutableTabs mountOnEnter isBox defaultLocation={toChangeRequests({ realm, tab: "users" })}>
          <Tab
            title={
              <>
                <TabTitleText>Users</TabTitleText>
                {userRequestCount > 0 && (
                  <Label className="keycloak-admin--role-mapping__client-name pf-v5-u-ml-sm">
                    {userRequestCount}
                  </Label>
                )}
              </>
            }
            {...userRequestsTab}
          >
            <div className="keycloak__events_table">
              <KeycloakDataTable
                key={key}
                toolbarItem={<ToolbarItemsComponent />}
                isRadio={isTideEnabled}
                loader={loader}
                ariaLabelKey="Requested Changes"
                detailColumns={[
                  {
                    name: "details",
                    enabled: (bundle) => bundle.requests.length > 0,
                    cellRenderer: DetailCell,
                  },
                ]}
                columns={columns}
                isPaginated
                onSelect={(value: any[]) => {
                  // Flatten selected bundles into individual requests for the toolbar
                  const flattenedRequests = value.flatMap((bundle) => bundle.requests);
                  setSelectedRow(flattenedRequests);
                }}
                emptyState={
                  <EmptyState variant="lg">
                    <TextContent>
                      <Text>No requested changes found.</Text>
                    </TextContent>
                  </EmptyState>
                }
              />
            </div>
          </Tab>
          <Tab
            title={
              <>
                <TabTitleText>Roles</TabTitleText>
                {roleRequestCount > 0 && (
                  <Label className="keycloak-admin--role-mapping__client-name pf-v5-u-ml-sm">
                    {roleRequestCount}
                  </Label>
                )}
              </>
            }
            {...roleRequestsTab}
          >
            <RolesChangeRequestsList updateCounter={updateRoleCounter} />
          </Tab>
          <Tab
            title={
              <>
                <TabTitleText>Clients</TabTitleText>
                {clientRequestCount > 0 && (
                  <Label className="keycloak-admin--role-mapping__client-name pf-v5-u-ml-sm">
                    {clientRequestCount}
                  </Label>
                )}
              </>
            }
            {...clientRequestsTab}
          >
            <ClientChangeRequestsList updateCounter={updateClientCounter} />
          </Tab>
          {/* <Tab
            title={
              <>
                <TabTitleText>Settings</TabTitleText>
                {realmSettingsRequestCount > 0 && (
                  <Label className="keycloak-admin--role-mapping__client-name pf-v5-u-ml-sm">
                    {realmSettingsRequestCount}
                  </Label>
                )}
              </>
            }
            {...settingsRequestsTab}
          >
            <SettingsChangeRequestsList updateCounter={updateSettingsCounter} />
          </Tab> */}
        </RoutableTabs>
      </PageSection>
    </>
  );
}
