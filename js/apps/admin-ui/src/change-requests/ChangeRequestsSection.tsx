/** TIDECLOAK IMPLEMENTATION */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  AlertVariant,
  Button,
  ButtonVariant,
  Chip,
  ChipGroup,
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
import {
  useAlerts,
  useEnvironment,
  KeycloakDataTable,
  ListEmptyState,
} from "@keycloak/keycloak-ui-shared";
import type { KeycloakDataTableHandle } from "@keycloak/keycloak-ui-shared";

import { useAdminClient } from "../admin-client";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { ViewHeader } from "../components/view-header/ViewHeader";
import { ChangeRequestsHelpModal } from "./ChangeRequestsHelpModal";

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type {
  IgaChangeRequestStatus,
  IgaCrAuthorizerRepresentation,
} from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

import {
  canApprove,
  isAuthorizable,
  isCommittable,
  authorizeTip,
  commitTip,
} from "./canApprove";
import {
  runMultiAdminApproval,
  runMultiAdminApprovalBatch,
} from "./approvalModel";
import type { BatchApprovalOutcome } from "./approvalModel";
import { useCurrentUserRoles } from "./useCurrentUserRoles";
import { useCurrentUsername } from "./useCurrentUsername";
import {
  actionTypeLabel,
  authCountOf,
  entityTypeLabel,
  errorMessage,
  formatRelativeTime,
  formatTime,
  humanReadableSummary,
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
  const authCount = authCountOf(cr);
  const remaining = Math.max(cr.threshold - authCount, 0);

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
          {authCount} / {cr.threshold}
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
    </>
  );
}

export default function ChangeRequestsSection() {
  const { adminClient } = useAdminClient();
  const { addAlert, addError } = useAlerts();
  const { approveTideRequests } = useEnvironment();
  const userRoles = useCurrentUserRoles();
  const username = useCurrentUsername();

  const [chipFilter, setChipFilter] = useState<ChipFilter>("PENDING");
  const [selected, setSelected] = useState<IgaChangeRequest[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [isHelpOpen, setIsHelpOpen] = useState(false);
  const [bulkResults, setBulkResults] = useState<{
    op: "authorize" | "commit";
    results: BulkResult[];
  } | null>(null);

  // Imperative handle to the data table: lets us trigger an in-place data
  // re-fetch (background poll / post-action refresh) WITHOUT remounting the
  // table. A remount used to reset the table's internal selection state, which
  // yanked the user's checkbox selection out from under them on every poll tick.
  const tableRef = useRef<KeycloakDataTableHandle>(null);

  // Post-action refresh: intentionally clears the selection (the selected CRs
  // were just acted on) and re-fetches in place — no remount.
  const refresh = useCallback(() => {
    setSelected([]);
    tableRef.current?.refresh();
  }, []);

  // Light background polling so new CRs appear without a manual refresh.
  // We pause the poll while the user has an active selection or an action is in
  // flight, so a background refetch never disrupts a bulk-approve in progress.
  // The poll resumes (and a fresh fetch runs) once the selection is cleared.
  const hasSelection = selected.length > 0;
  const pausePolling = hasSelection || isProcessing || detailId !== null;
  useEffect(() => {
    if (pausePolling) return;
    const interval = setInterval(() => {
      tableRef.current?.refresh();
    }, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [pausePolling]);

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
    () => selected.filter((cr) => isAuthorizable(cr, userRoles, username)),
    [selected, userRoles, username],
  );
  const committableSelection = useMemo(
    () => selected.filter((cr) => isCommittable(cr, userRoles)),
    [selected, userRoles],
  );
  const skippedFromAuthorize = selected.length - authorizableSelection.length;
  const skippedFromCommit = selected.length - committableSelection.length;

  /* ---- approve one CR (two-phase multiAdmin or single-phase firstAdmin) ----
     multiAdmin CRs take the enclave round-trip via /approval-model and only
     record an approval toward threshold (commit stays a separate step).
     firstAdmin / Tideless realms refuse /approval-model with 409
     NOT_MULTI_ADMIN; runMultiAdminApproval detects that and runs the
     single-phase authorize+commit itself, returning `committed`. Returns a
     user-facing success message, or throws for transport/enclave errors and
     for an enclave denial (so bulk records it as a failure). Shared by the row
     action and the bulk loop. */

  const authorizeOne = useCallback(
    async (cr: IgaChangeRequest): Promise<string> => {
      const outcome = await runMultiAdminApproval(
        adminClient,
        approveTideRequests,
        cr.id,
      );
      if (outcome.kind === "denied") {
        throw new Error("Approval was denied in the enclave.");
      }
      if (outcome.kind === "pending") {
        return "Approval pending — awaiting other operators.";
      }
      if (outcome.kind === "committed") {
        // firstAdmin single-phase: authorize + commit already ran.
        return "Change request approved and committed.";
      }
      // recorded: multiAdmin two-phase approval counted toward threshold.
      const { authCount, threshold, readyForCommit } = outcome.result;
      return readyForCommit
        ? `Approved — ${authCount} of ${threshold}. Ready to commit.`
        : `Approved — ${authCount} of ${threshold}.`;
    },
    [adminClient, approveTideRequests],
  );

  /* ---- map a batch outcome to a user-facing success message ----
     Mirrors authorizeOne's outcome handling. Throws for denied/error so the
     bulk loop records them as failures; returns a message otherwise. */

  const messageForOutcome = useCallback(
    (outcome: BatchApprovalOutcome): string => {
      if (outcome.kind === "error") {
        throw outcome.error instanceof Error
          ? outcome.error
          : new Error(errorMessage(outcome.error));
      }
      if (outcome.kind === "denied") {
        throw new Error("Approval was denied in the enclave.");
      }
      if (outcome.kind === "pending") {
        return "Approval pending — awaiting other operators.";
      }
      if (outcome.kind === "committed") {
        return "Change request approved and committed.";
      }
      const { authCount, threshold, readyForCommit } = outcome.result;
      return readyForCommit
        ? `Approved — ${authCount} of ${threshold}. Ready to commit.`
        : `Approved — ${authCount} of ${threshold}.`;
    },
    [],
  );

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
      try {
        // Open the Heimdall enclave ONCE for the whole batch: collect every
        // selected CR's phase-1 carrier and sign them all in a single popup
        // (one doken, one round-trip), then commit each (see
        // runMultiAdminApprovalBatch). firstAdmin/Tideless CRs take the
        // single-phase authorize+commit path inside the batch (no enclave).
        const ids = authorizableSelection.map((cr) => cr.id);
        const outcomes = await runMultiAdminApprovalBatch(
          adminClient,
          approveTideRequests,
          ids,
        );
        for (const outcome of outcomes) {
          try {
            messageForOutcome(outcome);
            results.push({ id: outcome.changeRequestId, ok: true });
          } catch (err) {
            results.push({
              id: outcome.changeRequestId,
              ok: false,
              message: errorMessage(err),
            });
          }
        }
      } catch (err) {
        // A batch-wide failure (e.g. the single enclave call rejected): mark
        // every selected CR as failed so the operator sees the real error.
        for (const cr of authorizableSelection) {
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
      if (!isAuthorizable(cr, userRoles, username)) return;
      setIsProcessing(true);
      try {
        const message = await authorizeOne(cr);
        addAlert(message, AlertVariant.success);
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
    [authorizeOne, userRoles, username, addAlert, addError, refresh],
  );

  const onCommitRow = useCallback(
    async (cr: IgaChangeRequest) => {
      if (!isCommittable(cr, userRoles)) return;
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
     Order: Status, Action, What changed, Entity, Authorizations,
     Required roles, Created. */

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
        cellRenderer: (cr: IgaChangeRequest) => (
          <Label isCompact color="purple">
            {actionTypeLabel(cr.actionType) || "Unknown"}
          </Label>
        ),
      },
      {
        name: "summary",
        displayKey: "What changed",
        cellRenderer: (cr: IgaChangeRequest) => (
          <span className="pf-v5-u-font-size-sm">
            {humanReadableSummary(cr)}
          </span>
        ),
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

      // Authorize
      const authTip = authorizeTip(cr, userRoles, username);
      actions.push({
        title: "Authorize",
        isDisabled: !!authTip || isProcessing,
        tooltipProps: authTip ? { content: authTip } : undefined,
        onClick: () => {
          void onAuthorizeRow(cr);
        },
      });

      // Commit
      const cTip = commitTip(cr, userRoles);
      actions.push({
        title: "Commit",
        isDisabled: !!cTip || isProcessing,
        tooltipProps: cTip
          ? { content: cTip }
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
      <PageSection variant="light" className="pf-v5-u-pt-0 pf-v5-u-pb-0">
        <Button
          variant="secondary"
          icon={<QuestionCircleIcon />}
          onClick={() => setIsHelpOpen(true)}
          data-testid="change-requests-help"
        >
          How IGA works
        </Button>
      </PageSection>
      <PageSection variant="light" className="pf-v5-u-p-0">
        <div className="keycloak__events_table">
          <KeycloakDataTable
            key={chipFilter}
            ref={tableRef}
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
              />
            }
            columns={columns}
            actionResolver={actionResolver}
            isPaginated
            canSelectAll
            onSelect={(value: IgaChangeRequest[]) => setSelected([...value])}
            emptyState={
              <ListEmptyState
                icon={QuestionCircleIcon}
                message="No change requests"
                instructions="When IGA is enabled, administrative changes appear here as change requests awaiting approval. There's nothing here right now."
                primaryActionText="How IGA works"
                onPrimaryAction={() => setIsHelpOpen(true)}
              />
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
