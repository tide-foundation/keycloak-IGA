/** TIDECLOAK IMPLEMENTATION */

import { useCallback, useEffect, useState, type ReactElement } from "react";
import {
  AlertVariant,
  Button,
  ButtonVariant,
  CodeBlock,
  CodeBlockCode,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  Divider,
  ExpandableSection,
  Label,
  Modal,
  ModalVariant,
  Spinner,
  Text,
  TextArea,
  TextContent,
  Tooltip,
} from "@patternfly/react-core";
import { fetchWithError } from "@keycloak/keycloak-admin-client";
import { useAlerts, useEnvironment } from "@keycloak/keycloak-ui-shared";
import { saveAs } from "file-saver";
import { useTranslation } from "react-i18next";

import { useAdminClient } from "../admin-client";
import { getAuthorizationHeaders } from "../utils/getAuthorizationHeaders";
import { joinPath } from "../utils/joinPath";

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type { IgaCrAuthorizerRepresentation } from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type IgaComment from "@keycloak/keycloak-admin-client/lib/defs/igaCommentRepresentation";

import { canApprove, blockedReasonOf } from "./canApprove";
import { runMultiAdminApproval, commitChangeRequest } from "./approvalModel";
import {
  actionTypeLabel,
  authCountOf,
  entityTypeLabel,
  errorMessage,
  formatRelativeTime,
  formatTime,
  humanReadableSummary,
  requestedByOf,
} from "./formatters";

type Props = {
  id: string;
  userRoles: string[];
  username: string;
  onClose: () => void;
  onChanged: () => void;
};

/**
 * Pretty-print the already-parsed change payload (`cr.rows`). The backend
 * deserializes the payload server-side and emits it as `rows`
 * (`List<Map<String,Object>>`), so we just re-stringify it with indentation —
 * no `JSON.parse` of a (non-existent) `rowsJson` string, which is what left the
 * panel empty before.
 */
function prettyRows(
  rows: Record<string, unknown>[] | undefined | null,
): string {
  if (!rows || rows.length === 0) return "";
  try {
    return JSON.stringify(rows, null, 2);
  } catch {
    return "";
  }
}

function hasSigned(cr: IgaChangeRequest | null, username: string): boolean {
  if (!cr || !username) return false;
  const a: IgaCrAuthorizerRepresentation[] = cr.authorizers ?? [];
  return a.some((x) => x.username === username);
}

export function ChangeRequestsDetail({
  id,
  userRoles,
  username,
  onClose,
  onChanged,
}: Props) {
  const { adminClient } = useAdminClient();
  const { addAlert, addError } = useAlerts();
  const { approveTideRequests } = useEnvironment();
  const { t } = useTranslation();

  const [cr, setCr] = useState<IgaChangeRequest | null>(null);
  const [comments, setComments] = useState<IgaComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState("");
  // Change payload starts expanded so the actual change is visible up front.
  const [payloadOpen, setPayloadOpen] = useState(true);

  const fetchAll = useCallback(async () => {
    try {
      const [next, nextComments] = await Promise.all([
        adminClient.iga.getChangeRequest({ id }),
        adminClient.iga.listComments({ id }).catch(() => [] as IgaComment[]),
      ]);
      setCr(next);
      setComments(nextComments);
    } catch (err) {
      addError(`Failed to load change request: ${errorMessage(err)}`, err);
    }
  }, [adminClient, id, addError]);

  useEffect(() => {
    void fetchAll();
  }, [fetchAll]);

  // Approve SIGNS ONLY: it records this admin's authorization toward the
  // threshold via /approve and never applies the change. Applying is the
  // separate Commit action below. Approve stays available while PENDING so
  // admins can sign toward quorum (already-signed = idempotent no-op).
  const onApprove = async () => {
    if (!cr) return;
    setIsWorking(true);
    try {
      const outcome = await runMultiAdminApproval(
        adminClient,
        approveTideRequests,
        cr.id,
      );
      if (outcome.kind === "denied") {
        addAlert("Approval was denied in the enclave.", AlertVariant.warning);
        return;
      }
      if (outcome.kind === "pending") {
        addAlert(
          "Approval is pending, awaiting other operators.",
          AlertVariant.info,
        );
        onChanged();
        return;
      }
      // recorded: the SIGN-only /approve endpoint recorded this approval. It did
      // NOT apply the change — Commit is the separate step. `readyToCommit`
      // says whether the threshold is now met.
      const { authCount, threshold, readyToCommit } = outcome.result;
      const atQuorum = readyToCommit ?? authCount >= threshold;
      addAlert(
        atQuorum
          ? `Approved, ${authCount} of ${threshold}. Ready to commit.`
          : `Approved, ${authCount} of ${threshold}.`,
        AlertVariant.success,
      );
      onChanged();
    } catch (err) {
      addError(`Failed to approve change request: ${errorMessage(err)}`, err);
    } finally {
      setIsWorking(false);
    }
  };

  // Commit APPLIES ONLY: it calls the quorum-gated /commit endpoint to apply a
  // CR that has already been signed to its threshold. No signing, no enclave.
  // A 412 QUORUM_NOT_MET is surfaced as a soft message telling the admin to
  // approve to quorum first; other 412/403/404/409 errors surface via addError.
  const onCommit = async () => {
    if (!cr) return;
    setIsWorking(true);
    try {
      const outcome = await commitChangeRequest(adminClient, cr.id);
      if (outcome.kind === "quorum-not-met") {
        addAlert(outcome.message, AlertVariant.warning);
        onChanged();
        return;
      }
      addAlert("Change request committed.", AlertVariant.success);
      onChanged();
    } catch (err) {
      addError(`Failed to commit change request: ${errorMessage(err)}`, err);
    } finally {
      setIsWorking(false);
    }
  };

  const onDownloadDiagnosticBundle = async () => {
    if (!cr) return;
    setIsWorking(true);
    try {
      // Mirror the admin-ui raw-fetch convention (admin-ui-endpoint.ts): admin
      // base URL + bearer token. The endpoint returns JSON; we download it as a
      // blob the user can hand to a developer.
      const accessToken = await adminClient.getAccessToken();
      const response = await fetchWithError(
        joinPath(
          adminClient.baseUrl,
          "admin/realms",
          encodeURIComponent(adminClient.realmName),
          "iga/change-requests",
          encodeURIComponent(cr.id),
          "diagnostic-bundle",
        ),
        {
          method: "GET",
          headers: {
            ...getAuthorizationHeaders(accessToken),
            Accept: "application/json",
          },
        },
      );
      const blob = await response.blob();
      saveAs(blob, `cr-${cr.id}-diagnostic.json`);
    } catch (err) {
      addError(
        `${t("downloadDiagnosticBundleError")}: ${errorMessage(err)}`,
        err,
      );
    } finally {
      setIsWorking(false);
    }
  };

  const onDeny = async () => {
    if (!cr) return;
    setIsWorking(true);
    try {
      await adminClient.iga.deny({
        id: cr.id,
        reason: denyReason.trim() || undefined,
      });
      addAlert("Change request denied.", AlertVariant.success);
      onChanged();
    } catch (err) {
      addError(`Failed to deny change request: ${errorMessage(err)}`, err);
    } finally {
      setIsWorking(false);
      setDenyOpen(false);
    }
  };

  const onAddComment = async () => {
    if (!cr || !commentDraft.trim()) return;
    setIsWorking(true);
    try {
      await adminClient.iga.addComment({
        id: cr.id,
        body: commentDraft.trim(),
      });
      setCommentDraft("");
      await fetchAll();
    } catch (err) {
      addError(`Failed to add comment: ${errorMessage(err)}`, err);
    } finally {
      setIsWorking(false);
    }
  };

  const approvable = cr ? canApprove(cr, userRoles) : false;
  const alreadySigned = hasSigned(cr, username);
  const requiredRolesText = cr?.requiredApproverRoles?.length
    ? `Requires role${
        cr.requiredApproverRoles.length > 1 ? "s" : ""
      }: ${cr.requiredApproverRoles.join(", ")}${
        cr.scopeMode === "all" ? " (all required)" : " (any one)"
      }`
    : "";

  const blockedReason = cr ? blockedReasonOf(cr) : "";

  // Approve and Commit are now TWO SEPARATE actions, rendered side by side
  // whenever the CR is PENDING:
  //   • Approve SIGNS (records an authorization toward quorum). Available while
  //     PENDING and the admin is an approver who has not already signed; a
  //     blocked CR cannot be signed. Already-signed disables it (no-op).
  //   • Commit APPLIES. Enabled only once the threshold is met (readyToCommit)
  //     and the admin can approve and the CR is not blocked; otherwise it is
  //     disabled with a tooltip explaining why.
  const isPending = !!cr && cr.status === "PENDING";

  const canApproveNow =
    isPending && !cr!.blocked && approvable && !alreadySigned;
  const approveTip = (() => {
    if (!cr) return "";
    if (cr.blocked) return blockedReason;
    if (!approvable)
      return requiredRolesText || "Cannot act on this change request";
    if (alreadySigned)
      return "You have already signed; awaiting other approvers.";
    return "";
  })();

  const canCommitNow =
    isPending && !cr!.blocked && approvable && cr!.readyToCommit;
  const commitTipText = (() => {
    if (!cr) return "";
    if (cr.blocked) return blockedReason;
    if (!approvable)
      return requiredRolesText || "Cannot act on this change request";
    if (!cr.readyToCommit)
      return `Threshold not met (${authCountOf(cr)}/${cr.threshold}) — approve to quorum before committing.`;
    return "Threshold met — apply this change now.";
  })();

  const noop = () => {
    /* disabled placeholder */
  };

  const approveButton = !isPending ? null : canApproveNow ? (
    <Button
      key="approve"
      variant="secondary"
      isLoading={isWorking}
      isDisabled={isWorking}
      onClick={onApprove}
    >
      Approve
    </Button>
  ) : (
    <Tooltip key="approve-tip" content={approveTip || "Cannot approve"}>
      <span>
        <Button key="approve" variant="secondary" isAriaDisabled onClick={noop}>
          Approve
        </Button>
      </span>
    </Tooltip>
  );

  const commitButton = !isPending ? null : canCommitNow ? (
    <Tooltip key="commit-tip" content={commitTipText}>
      <Button
        key="commit"
        variant="primary"
        isLoading={isWorking}
        isDisabled={isWorking}
        onClick={onCommit}
      >
        Commit
      </Button>
    </Tooltip>
  ) : (
    <Tooltip key="commit-tip" content={commitTipText || "Cannot commit"}>
      <span>
        <Button key="commit" variant="primary" isAriaDisabled onClick={noop}>
          Commit
        </Button>
      </span>
    </Tooltip>
  );

  const signers: IgaCrAuthorizerRepresentation[] = cr?.authorizers ?? [];

  return (
    <>
      <Modal
        variant={ModalVariant.medium}
        title="Change request"
        isOpen
        onClose={onClose}
        actions={
          cr
            ? ([
                commitButton,
                approveButton,
                <Button
                  key="download-diagnostic-bundle"
                  variant="secondary"
                  isDisabled={isWorking}
                  isLoading={isWorking}
                  onClick={onDownloadDiagnosticBundle}
                >
                  {t("downloadDiagnosticBundle")}
                </Button>,
                <Button
                  key="deny"
                  variant={ButtonVariant.danger}
                  isDisabled={
                    isWorking || cr.status !== "PENDING" || !approvable
                  }
                  onClick={() => setDenyOpen(true)}
                >
                  Deny
                </Button>,
                <Button key="close" variant="link" onClick={onClose}>
                  Close
                </Button>,
              ].filter(Boolean) as ReactElement[])
            : [
                <Button key="close" variant="link" onClick={onClose}>
                  Close
                </Button>,
              ]
        }
      >
        {!cr && <Spinner />}
        {cr && (
          <>
            {/* ---- Human-readable summary ---- */}
            <TextContent>
              <Text component="h3">Summary</Text>
              <Text>{humanReadableSummary(cr)}</Text>
            </TextContent>

            <Divider style={{ margin: "1rem 0" }} />

            <DescriptionList isHorizontal>
              <DescriptionListGroup>
                <DescriptionListTerm>Status</DescriptionListTerm>
                <DescriptionListDescription>
                  <Label
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
                  {cr.readyToCommit && cr.status === "PENDING" && (
                    <>
                      {" "}
                      <Label isCompact color="green">
                        Ready to commit
                      </Label>
                    </>
                  )}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Action</DescriptionListTerm>
                <DescriptionListDescription>
                  <Label color="purple">
                    {actionTypeLabel(cr.actionType) || "Unknown"}
                  </Label>
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Entity</DescriptionListTerm>
                <DescriptionListDescription>
                  {entityTypeLabel(cr.entityType)}
                  {cr.entityId ? ` — ${cr.entityId}` : ""}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Requested By</DescriptionListTerm>
                <DescriptionListDescription>
                  {requestedByOf(cr) || "-"}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Created At</DescriptionListTerm>
                <DescriptionListDescription>
                  {formatTime(cr.createdAt)}
                </DescriptionListDescription>
              </DescriptionListGroup>
              <DescriptionListGroup>
                <DescriptionListTerm>Required Roles</DescriptionListTerm>
                <DescriptionListDescription>
                  {cr.requiredApproverRoles?.length
                    ? `${cr.requiredApproverRoles.join(", ")} ${
                        cr.scopeMode === "all" ? "(all required)" : "(any one)"
                      }`
                    : "(no roles required)"}
                </DescriptionListDescription>
              </DescriptionListGroup>
              {cr.denyReason && (
                <DescriptionListGroup>
                  <DescriptionListTerm>Deny Reason</DescriptionListTerm>
                  <DescriptionListDescription>
                    {cr.denyReason}
                  </DescriptionListDescription>
                </DescriptionListGroup>
              )}
            </DescriptionList>

            <Divider style={{ margin: "1rem 0" }} />

            {/* ---- Signature progress ---- */}
            <TextContent>
              <Text component="h3">Signatures</Text>
              <Text
                component="p"
                style={{
                  fontSize: "1.5rem",
                  fontWeight: 700,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {authCountOf(cr)} of {cr.threshold}
              </Text>
            </TextContent>
            {signers.length === 0 ? (
              <TextContent>
                <Text className="pf-v5-u-color-200">Not signed yet.</Text>
              </TextContent>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: "none", margin: 0 }}>
                {signers.map((s) => (
                  <li
                    key={`${s.username}-${s.timestamp}`}
                    style={{ padding: "0.25rem 0" }}
                  >
                    <span className="pf-v5-u-font-weight-bold">
                      {s.username}
                    </span>{" "}
                    <span className="pf-v5-u-color-200 pf-v5-u-font-size-sm">
                      {formatRelativeTime(s.timestamp)} ·{" "}
                      {formatTime(s.timestamp)}
                    </span>
                  </li>
                ))}
              </ul>
            )}

            <Divider style={{ margin: "1rem 0" }} />

            {/* ---- Change payload ----
                Renders the server-parsed `rows` payload. Defaults to expanded
                so the actual change is visible without an extra click; the
                previous version read a non-existent `rowsJson` string and so
                always rendered empty. */}
            <ExpandableSection
              toggleText="Change payload (rows)"
              isIndented
              isExpanded={payloadOpen}
              onToggle={(_e, v) => setPayloadOpen(v)}
            >
              {cr.rows && cr.rows.length > 0 ? (
                <CodeBlock>
                  <CodeBlockCode>{prettyRows(cr.rows)}</CodeBlockCode>
                </CodeBlock>
              ) : (
                <TextContent>
                  <Text className="pf-v5-u-color-200">
                    This change request carries no row data.
                  </Text>
                </TextContent>
              )}
            </ExpandableSection>

            <Divider style={{ margin: "1rem 0" }} />

            {/* ---- Comments ---- */}
            <TextContent>
              <Text component="h3">Comments</Text>
            </TextContent>
            {comments.length === 0 ? (
              <TextContent>
                <Text className="pf-v5-u-color-200">No comments yet.</Text>
              </TextContent>
            ) : (
              <ul style={{ paddingLeft: 0, listStyle: "none" }}>
                {comments.map((c) => (
                  <li
                    key={c.id}
                    style={{
                      padding: "0.5rem 0",
                      borderBottom: "1px solid #eee",
                    }}
                  >
                    <div className="pf-v5-u-font-weight-bold">
                      {c.authorUsername}{" "}
                      <span className="pf-v5-u-color-200 pf-v5-u-font-size-sm pf-v5-u-font-weight-normal">
                        {formatTime(c.createdAt)}
                      </span>
                    </div>
                    <div style={{ whiteSpace: "pre-wrap" }}>{c.body}</div>
                  </li>
                ))}
              </ul>
            )}
            <TextArea
              id="change-requests-new-comment"
              aria-label="Add a comment"
              value={commentDraft}
              onChange={(_e, v) => setCommentDraft(v)}
              placeholder="Add a comment..."
              rows={3}
              style={{ marginTop: "0.5rem" }}
            />
            <Button
              variant="secondary"
              isDisabled={!commentDraft.trim() || isWorking}
              isLoading={isWorking}
              onClick={onAddComment}
              style={{ marginTop: "0.5rem" }}
            >
              Add comment
            </Button>
            {/* Suppress unused-var lint for requiredRolesText if no tooltip
                path consumed it — referencing here is cheap and intentional. */}
            <span style={{ display: "none" }}>{requiredRolesText}</span>
          </>
        )}
      </Modal>

      <Modal
        variant={ModalVariant.small}
        title="Deny change request"
        isOpen={denyOpen}
        onClose={() => setDenyOpen(false)}
        actions={[
          <Button
            key="confirm"
            variant={ButtonVariant.danger}
            isLoading={isWorking}
            onClick={onDeny}
          >
            Deny
          </Button>,
          <Button
            key="cancel"
            variant="link"
            onClick={() => setDenyOpen(false)}
          >
            Cancel
          </Button>,
        ]}
      >
        <TextContent>
          <Text>
            Optionally provide a reason. This is shown to the requester.
          </Text>
        </TextContent>
        <TextArea
          id="change-requests-deny-reason"
          aria-label="Deny reason"
          value={denyReason}
          onChange={(_e, v) => setDenyReason(v)}
          rows={3}
          style={{ marginTop: "0.5rem" }}
        />
      </Modal>
    </>
  );
}
