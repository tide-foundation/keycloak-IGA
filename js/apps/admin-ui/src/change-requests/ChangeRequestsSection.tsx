/** TIDECLOAK IMPLEMENTATION */

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AlertVariant,
  Badge,
  Button,
  ButtonVariant,
  Chip,
  ChipGroup,
  EmptyState,
  Label,
  Modal,
  ModalVariant,
  PageSection,
  Tab,
  TabTitleText,
  Tabs,
  Text,
  TextContent,
  ToolbarItem,
  Tooltip,
} from "@patternfly/react-core";
import { useAlerts, KeycloakDataTable } from "@keycloak/keycloak-ui-shared";

import { useAdminClient } from "../admin-client";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { ViewHeader } from "../components/view-header/ViewHeader";

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type { IgaCrAuthorizerRepresentation } from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

import { canApprove } from "./canApprove";
import { useCurrentUserRoles } from "./useCurrentUserRoles";
import { useCurrentUsername } from "./useCurrentUsername";
import {
  actionTypeLabel,
  entityTypeLabel,
  errorMessage,
  formatRelativeTime,
  formatTime,
  humanReadableSummary,
} from "./formatters";
import { ChangeRequestsDetail } from "./ChangeRequestsDetail";

type InboxTab = "awaiting" | "pending" | "history";
type HistoryFilter = "all" | "approved" | "denied";

const POLL_INTERVAL_MS = 5000;

type BulkResult = {
  id: string;
  ok: boolean;
  message?: string;
};

function hasSigned(cr: IgaChangeRequest, username: string): boolean {
  if (!username) return false;
  const authorizers: IgaCrAuthorizerRepresentation[] = cr.authorizers ?? [];
  return authorizers.some((a) => a.username === username);
}

function isAwaitingMe(
  cr: IgaChangeRequest,
  userRoles: string[],
  username: string,
): boolean {
  return (
    cr.status === "PENDING" &&
    canApprove(cr, userRoles) &&
    !hasSigned(cr, username)
  );
}

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

function AuthorizationsCell({ cr }: { cr: IgaChangeRequest }) {
  const signers: IgaCrAuthorizerRepresentation[] = cr.authorizers ?? [];
  const remaining = Math.max(cr.threshold - cr.authCount, 0);

  const tip = (
    <div style={{ maxWidth: 280 }}>
      {signers.length === 0 ? (
        <div>Not signed yet.</div>
      ) : (
        <div>
          Signed by:{" "}
          {signers
            .map((s) => `${s.username} (${formatRelativeTime(s.timestamp)})`)
            .join(", ")}
          .
        </div>
      )}
      {remaining > 0 && cr.status === "PENDING" && (
        <div>{`Still needed: ${remaining}.`}</div>
      )}
    </div>
  );

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
      <Tooltip content={tip}>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {cr.authCount} / {cr.threshold}
        </span>
      </Tooltip>
      {cr.readyToCommit && (
        <Label isCompact color="green">
          Ready to commit
        </Label>
      )}
    </span>
  );
}

type ToolbarProps = {
  inboxTab: InboxTab;
  authorizableCount: number;
  committableCount: number;
  isProcessing: boolean;
  onAuthorizeBulk: () => void;
  onCommitBulk: () => void;
  historyFilter: HistoryFilter;
  setHistoryFilter: (v: HistoryFilter) => void;
};

function ChangeRequestsToolbar({
  inboxTab,
  authorizableCount,
  committableCount,
  isProcessing,
  onAuthorizeBulk,
  onCommitBulk,
  historyFilter,
  setHistoryFilter,
}: ToolbarProps) {
  if (inboxTab === "history") {
    return (
      <ToolbarItem>
        <ChipGroup categoryName="Show">
          {(["all", "approved", "denied"] as const).map((f) => (
            <Chip
              key={f}
              isReadOnly={historyFilter === f}
              onClick={() => setHistoryFilter(f)}
            >
              {f === "all" ? "All" : f === "approved" ? "Approved" : "Denied"}
            </Chip>
          ))}
        </ChipGroup>
      </ToolbarItem>
    );
  }

  return (
    <>
      <ToolbarItem>
        <Button
          variant="primary"
          isDisabled={authorizableCount === 0 || isProcessing}
          isLoading={isProcessing}
          onClick={onAuthorizeBulk}
        >
          {`Authorize selected${
            authorizableCount > 0 ? ` (${authorizableCount})` : ""
          }`}
        </Button>
      </ToolbarItem>
      <ToolbarItem>
        <Button
          variant="secondary"
          isDisabled={committableCount === 0 || isProcessing}
          isLoading={isProcessing}
          onClick={onCommitBulk}
        >
          {`Commit selected${
            committableCount > 0 ? ` (${committableCount})` : ""
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
  const username = useCurrentUsername();

  const [inboxTab, setInboxTab] = useState<InboxTab>("awaiting");
  const [historyFilter, setHistoryFilter] = useState<HistoryFilter>("all");
  const [selected, setSelected] = useState<IgaChangeRequest[]>([]);
  const [tableKey, setTableKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [bulkResults, setBulkResults] = useState<{
    op: "authorize" | "commit";
    results: BulkResult[];
  } | null>(null);
  const [awaitingCount, setAwaitingCount] = useState(0);

  const refresh = useCallback(() => {
    setSelected([]);
    setTableKey((k) => k + 1);
  }, []);

  // Polling refresh of the active tab.
  useEffect(() => {
    const interval = setInterval(() => {
      setTableKey((k) => k + 1);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [inboxTab, historyFilter]);

  // Background poll of the awaiting-me count for the tab badge (kept light:
  // we only re-list PENDING; client filters from there).
  useEffect(() => {
    let cancelled = false;
    const tick = async () => {
      try {
        const rows = await adminClient.iga.listChangeRequests({
          status: "PENDING",
        });
        if (cancelled) return;
        setAwaitingCount(
          rows.filter((cr) => isAwaitingMe(cr, userRoles, username)).length,
        );
      } catch {
        /* ignored — badge is best-effort */
      }
    };
    void tick();
    const interval = setInterval(tick, POLL_INTERVAL_MS);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [adminClient, userRoles, username]);

  const loader = useCallback(async (): Promise<IgaChangeRequest[]> => {
    try {
      if (inboxTab === "history") {
        if (historyFilter === "approved") {
          return await adminClient.iga.listChangeRequests({
            status: "APPROVED",
          });
        }
        if (historyFilter === "denied") {
          return await adminClient.iga.listChangeRequests({ status: "DENIED" });
        }
        const [approved, denied] = await Promise.all([
          adminClient.iga.listChangeRequests({ status: "APPROVED" }),
          adminClient.iga.listChangeRequests({ status: "DENIED" }),
        ]);
        // Newest first; backend may already sort but we defensively re-sort.
        return [...approved, ...denied].sort(
          (a, b) => (b.createdAt ?? 0) - (a.createdAt ?? 0),
        );
      }

      const pending = await adminClient.iga.listChangeRequests({
        status: "PENDING",
      });
      if (inboxTab === "awaiting") {
        return pending.filter((cr) => isAwaitingMe(cr, userRoles, username));
      }
      return pending;
    } catch (err) {
      addError(`Failed to load change requests: ${errorMessage(err)}`, err);
      return [];
    }
  }, [adminClient, inboxTab, historyFilter, userRoles, username, addError]);

  /* ---- selection-derived counts ---- */

  const authorizableSelection = useMemo(
    () =>
      selected.filter(
        (cr) =>
          cr.status === "PENDING" &&
          canApprove(cr, userRoles) &&
          !hasSigned(cr, username),
      ),
    [selected, userRoles, username],
  );
  const committableSelection = useMemo(
    () =>
      selected.filter(
        (cr) =>
          cr.status === "PENDING" &&
          canApprove(cr, userRoles) &&
          cr.readyToCommit,
      ),
    [selected, userRoles],
  );
  const skippedFromAuthorize = selected.length - authorizableSelection.length;
  const skippedFromCommit = selected.length - committableSelection.length;

  /* ---- bulk authorize ---- */

  const [toggleAuthorizeDialog, AuthorizeConfirm] = useConfirmDialog({
    titleKey: "Authorize change requests",
    continueButtonLabel: "Authorize",
    continueButtonVariant: ButtonVariant.primary,
    cancelButtonLabel: "Cancel",
    children: (
      <>
        {`Authorize ${authorizableSelection.length} change request${
          authorizableSelection.length === 1 ? "" : "s"
        }?`}
        {skippedFromAuthorize > 0 && (
          <>
            {" "}
            {`(${skippedFromAuthorize} of ${selected.length} selected cannot be authorized — already signed or missing role — and will be skipped.)`}
          </>
        )}
      </>
    ),
    onConfirm: async () => {
      setIsProcessing(true);
      const results: BulkResult[] = [];
      for (const cr of authorizableSelection) {
        try {
          await adminClient.iga.authorize({ id: cr.id });
          results.push({ id: cr.id, ok: true });
        } catch (err) {
          results.push({ id: cr.id, ok: false, message: errorMessage(err) });
        }
      }
      setIsProcessing(false);
      setBulkResults({ op: "authorize", results });
      const okCount = results.filter((r) => r.ok).length;
      if (okCount === results.length && okCount > 0) {
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

  /* ---- bulk commit ---- */

  const [toggleCommitDialog, CommitConfirm] = useConfirmDialog({
    titleKey: "Commit change requests",
    continueButtonLabel: "Commit",
    continueButtonVariant: ButtonVariant.primary,
    cancelButtonLabel: "Cancel",
    children: (
      <>
        {`Commit ${committableSelection.length} change request${
          committableSelection.length === 1 ? "" : "s"
        }?`}
        {skippedFromCommit > 0 && (
          <>
            {" "}
            {`(${skippedFromCommit} of ${selected.length} selected are not ready to commit — threshold not met or you lack the required role — and will be skipped.)`}
          </>
        )}
      </>
    ),
    onConfirm: async () => {
      setIsProcessing(true);
      const results: BulkResult[] = [];
      for (const cr of committableSelection) {
        try {
          await adminClient.iga.commit({ id: cr.id });
          results.push({ id: cr.id, ok: true });
        } catch (err) {
          results.push({ id: cr.id, ok: false, message: errorMessage(err) });
        }
      }
      setIsProcessing(false);
      setBulkResults({ op: "commit", results });
      const okCount = results.filter((r) => r.ok).length;
      if (okCount === results.length && okCount > 0) {
        addAlert(
          `${okCount} change request${okCount === 1 ? "" : "s"} committed.`,
          AlertVariant.success,
        );
      } else if (okCount > 0) {
        addAlert(
          `${okCount} of ${results.length} change request${
            results.length === 1 ? "" : "s"
          } committed.`,
          AlertVariant.warning,
        );
      } else {
        addAlert("No change requests were committed.", AlertVariant.danger);
      }
      refresh();
    },
  });

  const onAuthorizeBulk = () => {
    if (authorizableSelection.length === 0) return;
    toggleAuthorizeDialog();
  };
  const onCommitBulk = () => {
    if (committableSelection.length === 0) return;
    toggleCommitDialog();
  };

  /* ---- per-row actions ---- */

  const onAuthorizeRow = useCallback(
    async (cr: IgaChangeRequest) => {
      if (!canApprove(cr, userRoles) || hasSigned(cr, username)) return;
      setIsProcessing(true);
      try {
        await adminClient.iga.authorize({ id: cr.id });
        addAlert("Change request authorized.", AlertVariant.success);
        refresh();
      } catch (err) {
        addError(
          `Failed to authorize change request: ${errorMessage(err)}`,
          err,
        );
      } finally {
        setIsProcessing(false);
      }
    },
    [adminClient, userRoles, username, addAlert, addError, refresh],
  );

  const onCommitRow = useCallback(
    async (cr: IgaChangeRequest) => {
      if (!canApprove(cr, userRoles) || !cr.readyToCommit) return;
      setIsProcessing(true);
      try {
        await adminClient.iga.commit({ id: cr.id });
        addAlert("Change request committed.", AlertVariant.success);
        refresh();
      } catch (err) {
        addError(`Cannot commit yet: ${errorMessage(err)}`, err);
      } finally {
        setIsProcessing(false);
      }
    },
    [adminClient, userRoles, addAlert, addError, refresh],
  );

  const onDenyRow = useCallback(
    async (cr: IgaChangeRequest) => {
      if (!canApprove(cr, userRoles)) return;
      setIsProcessing(true);
      try {
        await adminClient.iga.deny({ id: cr.id });
        addAlert("Change request denied.", AlertVariant.success);
        refresh();
      } catch (err) {
        addError(`Failed to deny change request: ${errorMessage(err)}`, err);
      } finally {
        setIsProcessing(false);
      }
    },
    [adminClient, userRoles, addAlert, addError, refresh],
  );

  /* ---- columns ---- */

  const columns = useMemo(
    () => [
      {
        name: "summary",
        displayKey: "Change",
        cellRenderer: (cr: IgaChangeRequest) => (
          <span title={humanReadableSummary(cr)}>
            {humanReadableSummary(cr)}
          </span>
        ),
      },
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
        cellRenderer: (cr: IgaChangeRequest) => <AuthorizationsCell cr={cr} />,
      },
      {
        name: "requiredApproverRoles",
        displayKey: "Required Roles",
        cellRenderer: (cr: IgaChangeRequest) => <RequiredRolesCell cr={cr} />,
      },
      {
        name: "status",
        displayKey: "Status",
        cellRenderer: (cr: IgaChangeRequest) => (
          <Label
            isCompact
            color={
              cr.status === "PENDING"
                ? "orange"
                : cr.status === "APPROVED"
                  ? "blue"
                  : "red"
            }
          >
            {cr.status}
          </Label>
        ),
      },
    ],
    [],
  );

  /* ---- row action menu (Open / Authorize / Commit / Deny) ---- */

  const actionResolver = useCallback(
    (rowData: any) => {
      const cr: IgaChangeRequest = rowData.data;
      const actions: {
        title: string;
        onClick: () => void;
        isDisabled?: boolean;
        tooltipProps?: { content: string };
      }[] = [{ title: "Open", onClick: () => setDetailId(cr.id) }];

      if (cr.status !== "PENDING") return actions;

      const isApprover = canApprove(cr, userRoles);
      const alreadySigned = hasSigned(cr, username);

      // Authorize
      let authTip: string | null = null;
      if (!isApprover) {
        authTip = "You are not in the required approver role(s)";
      } else if (alreadySigned) {
        authTip = "You have already signed this change request";
      }
      actions.push({
        title: "Authorize",
        isDisabled: !!authTip || isProcessing,
        tooltipProps: authTip ? { content: authTip } : undefined,
        onClick: () => {
          void onAuthorizeRow(cr);
        },
      });

      // Commit
      let commitTip: string | null = null;
      if (!isApprover) {
        commitTip = "You are not in the required approver role(s)";
      } else if (!cr.readyToCommit) {
        commitTip = `Threshold not met (${cr.authCount}/${cr.threshold})`;
      }
      actions.push({
        title: "Commit",
        isDisabled: !!commitTip || isProcessing,
        tooltipProps: commitTip
          ? { content: commitTip }
          : { content: "Threshold met — apply this change now." },
        onClick: () => {
          void onCommitRow(cr);
        },
      });

      // Deny
      actions.push({
        title: "Deny",
        isDisabled: !isApprover || isProcessing,
        tooltipProps: !isApprover
          ? { content: "You are not in the required approver role(s)" }
          : undefined,
        onClick: () => {
          void onDenyRow(cr);
        },
      });

      return actions;
    },
    [userRoles, username, isProcessing, onAuthorizeRow, onCommitRow, onDenyRow],
  );

  const tabKey = `${inboxTab}-${inboxTab === "history" ? historyFilter : ""}-${tableKey}`;
  const canSelect = inboxTab === "awaiting";

  return (
    <>
      <ViewHeader
        titleKey="Change Requests"
        subKey="Review and authorize change requests that require administrator approval."
        divider={false}
      />
      <PageSection variant="light" className="pf-v5-u-p-0">
        <Tabs
          activeKey={inboxTab}
          onSelect={(_e, key) => {
            setInboxTab(key as InboxTab);
            setSelected([]);
          }}
          isBox
        >
          <Tab
            eventKey="awaiting"
            title={
              <TabTitleText>
                Awaiting me{" "}
                {awaitingCount > 0 && (
                  <Badge isRead={false}>{awaitingCount}</Badge>
                )}
              </TabTitleText>
            }
          />
          <Tab
            eventKey="pending"
            title={<TabTitleText>All pending</TabTitleText>}
          />
          <Tab
            eventKey="history"
            title={<TabTitleText>History</TabTitleText>}
          />
        </Tabs>

        <div className="keycloak__events_table">
          <KeycloakDataTable
            key={tabKey}
            loader={loader}
            ariaLabelKey="Change Requests"
            toolbarItem={
              <ChangeRequestsToolbar
                inboxTab={inboxTab}
                authorizableCount={authorizableSelection.length}
                committableCount={committableSelection.length}
                isProcessing={isProcessing}
                onAuthorizeBulk={onAuthorizeBulk}
                onCommitBulk={onCommitBulk}
                historyFilter={historyFilter}
                setHistoryFilter={setHistoryFilter}
              />
            }
            columns={columns}
            actionResolver={actionResolver}
            isPaginated
            canSelectAll={canSelect}
            onSelect={
              canSelect
                ? (value: IgaChangeRequest[]) => setSelected([...value])
                : undefined
            }
            emptyState={
              <EmptyState variant="lg">
                <TextContent>
                  <Text>
                    {inboxTab === "awaiting"
                      ? "Nothing awaiting your action."
                      : inboxTab === "pending"
                        ? "No pending change requests."
                        : "No change requests in history."}
                  </Text>
                </TextContent>
              </EmptyState>
            }
          />
        </div>
      </PageSection>

      <AuthorizeConfirm />
      <CommitConfirm />

      {bulkResults && (
        <Modal
          variant={ModalVariant.small}
          title={
            bulkResults.op === "authorize"
              ? "Bulk authorize results"
              : "Bulk commit results"
          }
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
              {`${bulkResults.results.filter((r) => r.ok).length} succeeded, ${
                bulkResults.results.filter((r) => !r.ok).length
              } failed.`}
            </Text>
          </TextContent>
          {bulkResults.results.filter((r) => !r.ok).length > 0 && (
            <ul style={{ marginTop: 8 }}>
              {bulkResults.results
                .filter((r) => !r.ok)
                .map((r) => (
                  <li key={r.id}>
                    <code>{r.id}</code>: {r.message || "unknown error"}
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
          username={username}
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
