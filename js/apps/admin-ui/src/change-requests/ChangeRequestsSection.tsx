/** TIDECLOAK IMPLEMENTATION */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertVariant,
  Button,
  ButtonVariant,
  Chip,
  ChipGroup,
  EmptyState,
  Label,
  Modal,
  ModalVariant,
  PageSection,
  Text,
  TextContent,
  ToolbarItem,
  Tooltip,
} from "@patternfly/react-core";
import { QuestionCircleIcon } from "@patternfly/react-icons";
import { useAlerts, KeycloakDataTable } from "@keycloak/keycloak-ui-shared";

import { useAdminClient } from "../admin-client";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { ViewHeader } from "../components/view-header/ViewHeader";
import { ChangeRequestsHelpModal } from "./ChangeRequestsHelpModal";

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type {
  IgaChangeRequestStatus,
  IgaCrAuthorizerRepresentation,
} from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

import { canApprove } from "./canApprove";
import { useCurrentUserRoles } from "./useCurrentUserRoles";
import { useCurrentUsername } from "./useCurrentUsername";
import {
  actionTypeLabel,
  entityTypeLabel,
  errorMessage,
  formatRelativeTime,
  formatTime,
} from "./formatters";
import { ChangeRequestsDetail } from "./ChangeRequestsDetail";

type ChipFilter = "PENDING" | "APPROVED" | "DENIED" | "ALL";

const CHIP_OPTIONS: { key: ChipFilter; label: string }[] = [
  { key: "PENDING", label: "Pending" },
  { key: "APPROVED", label: "Approved" },
  { key: "DENIED", label: "Denied" },
  { key: "ALL", label: "All" },
];

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

function StatusCell({ cr }: { cr: IgaChangeRequest }) {
  const color: "grey" | "green" | "red" =
    cr.status === "PENDING"
      ? "grey"
      : cr.status === "APPROVED"
        ? "green"
        : "red";
  const label =
    cr.status === "PENDING"
      ? "Pending"
      : cr.status === "APPROVED"
        ? "Approved"
        : "Denied";
  return (
    <Label isCompact color={color}>
      {label}
    </Label>
  );
}

type ToolbarProps = {
  chipFilter: ChipFilter;
  setChipFilter: (v: ChipFilter) => void;
  authorizableCount: number;
  committableCount: number;
  selectedCount: number;
  isProcessing: boolean;
  onAuthorizeBulk: () => void;
  onCommitBulk: () => void;
  onShowHelp: () => void;
};

function ChangeRequestsToolbar({
  chipFilter,
  setChipFilter,
  authorizableCount,
  committableCount,
  selectedCount,
  isProcessing,
  onAuthorizeBulk,
  onCommitBulk,
  onShowHelp,
}: ToolbarProps) {
  const noSelection = selectedCount === 0;
  const authorizeTip = noSelection
    ? "Select pending change requests you can authorize"
    : authorizableCount === 0
      ? "None of the selected rows can be authorized — already signed, missing role, or not pending"
      : "";
  const commitTip = noSelection
    ? "Select change requests that are ready to commit"
    : committableCount === 0
      ? "None of the selected rows are ready to commit — threshold not met or you lack the required role"
      : "";

  const authorizeDisabled =
    authorizableCount === 0 || isProcessing || noSelection;
  const commitDisabled = committableCount === 0 || isProcessing || noSelection;

  return (
    <>
      <ToolbarItem>
        <ChipGroup categoryName="Show">
          {CHIP_OPTIONS.map((opt) => (
            <Chip
              key={opt.key}
              isReadOnly={chipFilter === opt.key}
              onClick={() => setChipFilter(opt.key)}
            >
              {opt.label}
            </Chip>
          ))}
        </ChipGroup>
      </ToolbarItem>
      <ToolbarItem>
        {authorizeDisabled ? (
          <Tooltip content={authorizeTip || "Select rows to authorize"}>
            <span>
              <Button
                variant="primary"
                isAriaDisabled
                isLoading={isProcessing}
                onClick={() => {
                  /* disabled */
                }}
              >
                {`Bulk Authorize${
                  authorizableCount > 0 ? ` (${authorizableCount})` : ""
                }`}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button
            variant="primary"
            isLoading={isProcessing}
            onClick={onAuthorizeBulk}
          >
            {`Bulk Authorize (${authorizableCount})`}
          </Button>
        )}
      </ToolbarItem>
      <ToolbarItem>
        {commitDisabled ? (
          <Tooltip content={commitTip || "Select rows to commit"}>
            <span>
              <Button
                variant="secondary"
                isAriaDisabled
                isLoading={isProcessing}
                onClick={() => {
                  /* disabled */
                }}
              >
                {`Bulk Commit${
                  committableCount > 0 ? ` (${committableCount})` : ""
                }`}
              </Button>
            </span>
          </Tooltip>
        ) : (
          <Button
            variant="secondary"
            isLoading={isProcessing}
            onClick={onCommitBulk}
          >
            {`Bulk Commit (${committableCount})`}
          </Button>
        )}
      </ToolbarItem>
      <ToolbarItem align={{ default: "alignRight" }}>
        <Button
          variant="secondary"
          icon={<QuestionCircleIcon />}
          onClick={onShowHelp}
          data-testid="change-requests-help"
        >
          How IGA works
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

  const [chipFilter, setChipFilter] = useState<ChipFilter>("PENDING");
  const [selected, setSelected] = useState<IgaChangeRequest[]>([]);
  const [tableKey, setTableKey] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<{
    op: "authorize" | "commit";
    results: BulkResult[];
  } | null>(null);

  const refresh = useCallback(() => {
    setSelected([]);
    setTableKey((k) => k + 1);
  }, []);

  // Light polling refresh while viewing the table.
  useEffect(() => {
    const interval = setInterval(() => {
      setTableKey((k) => k + 1);
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [chipFilter]);

  /* ---- deep-link: ?cr=<id> opens the existing detail modal directly ----
     Triggered by the "View change request" link on the 202 create toast.
     Fetches the CR straight from the SDK so it opens regardless of the
     active status-chip filter (which defaults to Pending). */

  const [searchParams, setSearchParams] = useSearchParams();
  const crParam = searchParams.get("cr");
  // Guard so a transient re-render / poll tick doesn't re-fetch the same id.
  const handledCrParam = useRef<string | null>(null);

  const clearCrParam = useCallback(() => {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        next.delete("cr");
        return next;
      },
      { replace: true },
    );
  }, [setSearchParams]);

  useEffect(() => {
    if (!crParam) {
      handledCrParam.current = null;
      return;
    }
    if (handledCrParam.current === crParam) return;
    handledCrParam.current = crParam;

    let cancelled = false;
    void (async () => {
      try {
        // Direct fetch — do NOT depend on the row being in the filtered list.
        const cr = await adminClient.iga.getChangeRequest({ id: crParam });
        if (cancelled) return;
        // Reuse the exact "open detail for CR X" path the row action uses.
        setDetailId(cr.id);
      } catch {
        // 403 / 404 / already committed-or-denied / no access — non-fatal.
        if (cancelled) return;
        addAlert(
          "Change request not found or no longer available.",
          AlertVariant.warning,
        );
        // Land on the list (no modal); drop the stale param.
        clearCrParam();
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [crParam, adminClient, addAlert, clearCrParam]);

  const loader = useCallback(
    async (status?: IgaChangeRequestStatus): Promise<IgaChangeRequest[]> => {
      try {
        if (status) {
          return await adminClient.iga.listChangeRequests({ status });
        }
        return await adminClient.iga.listChangeRequests();
      } catch (err) {
        addError(`Failed to load change requests: ${errorMessage(err)}`, err);
        return [];
      }
    },
    [adminClient, addError],
  );

  const tableLoader = useCallback(
    () => loader(chipFilter === "ALL" ? undefined : chipFilter),
    [loader, chipFilter],
  );

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
            {`(${skippedFromAuthorize} of ${selected.length} selected cannot be authorized — already signed, missing role, or not pending — and will be skipped.)`}
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

  /* ---- columns ----
     Order: Status, Action, Entity, Authorizations, Required roles, Created. */

  const columns = useMemo(
    () => [
      {
        name: "status",
        displayKey: "Status",
        cellRenderer: (cr: IgaChangeRequest) => <StatusCell cr={cr} />,
      },
      {
        name: "actionType",
        displayKey: "Action",
        cellRenderer: (cr: IgaChangeRequest) => actionTypeLabel(cr.actionType),
      },
      {
        name: "entityType",
        displayKey: "Entity",
        cellRenderer: (cr: IgaChangeRequest) => entityTypeLabel(cr.entityType),
      },
      {
        name: "authorizations",
        displayKey: "Authorizations",
        cellRenderer: (cr: IgaChangeRequest) => <AuthorizationsCell cr={cr} />,
      },
      {
        name: "requiredApproverRoles",
        displayKey: "Required roles",
        cellRenderer: (cr: IgaChangeRequest) => <RequiredRolesCell cr={cr} />,
      },
      {
        name: "createdAt",
        displayKey: "Created",
        cellRenderer: (cr: IgaChangeRequest) => formatTime(cr.createdAt),
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

  return (
    <>
      <ViewHeader
        titleKey="Change Requests"
        subKey="Review and authorize change requests that require administrator approval."
        divider={false}
      />
      <PageSection variant="light" className="pf-v5-u-p-0">
        <div className="keycloak__events_table">
          <KeycloakDataTable
            key={`${chipFilter}-${tableKey}`}
            loader={tableLoader}
            ariaLabelKey="Change Requests"
            toolbarItem={
              <ChangeRequestsToolbar
                chipFilter={chipFilter}
                setChipFilter={(v) => {
                  setChipFilter(v);
                  setSelected([]);
                }}
                authorizableCount={authorizableSelection.length}
                committableCount={committableSelection.length}
                selectedCount={selected.length}
                isProcessing={isProcessing}
                onAuthorizeBulk={onAuthorizeBulk}
                onCommitBulk={onCommitBulk}
                onShowHelp={() => setIsHelpOpen(true)}
              />
            }
            columns={columns}
            actionResolver={actionResolver}
            isPaginated
            canSelectAll
            onSelect={(value: IgaChangeRequest[]) => setSelected([...value])}
            emptyState={
              <EmptyState variant="lg">
                <TextContent>
                  <Text>
                    {chipFilter === "PENDING"
                      ? "No pending change requests."
                      : chipFilter === "APPROVED"
                        ? "No approved change requests."
                        : chipFilter === "DENIED"
                          ? "No denied change requests."
                          : "No change requests."}
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

      {isHelpOpen && (
        <ChangeRequestsHelpModal onClose={() => setIsHelpOpen(false)} />
      )}

      {detailId && (
        <ChangeRequestsDetail
          id={detailId}
          userRoles={userRoles}
          username={username}
          onClose={() => {
            setDetailId(null);
            // If this modal was opened via the ?cr deep link, drop the
            // param so a refresh / back doesn't immediately reopen it.
            if (crParam) clearCrParam();
          }}
          onChanged={() => {
            setDetailId(null);
            if (crParam) clearCrParam();
            refresh();
          }}
        />
      )}
    </>
  );
}
