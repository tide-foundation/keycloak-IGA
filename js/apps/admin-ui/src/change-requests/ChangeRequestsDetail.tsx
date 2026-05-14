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
import { useAlerts } from "@keycloak/keycloak-ui-shared";

import { useAdminClient } from "../admin-client";

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type { IgaCrAuthorizerRepresentation } from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type IgaComment from "@keycloak/keycloak-admin-client/lib/defs/igaCommentRepresentation";

import { canApprove } from "./canApprove";
import {
  actionTypeLabel,
  entityTypeLabel,
  errorMessage,
  formatRelativeTime,
  formatTime,
  humanReadableSummary,
} from "./formatters";

type Props = {
  id: string;
  userRoles: string[];
  username: string;
  onClose: () => void;
  onChanged: () => void;
};

function pretty(json: string): string {
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
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

  const [cr, setCr] = useState<IgaChangeRequest | null>(null);
  const [comments, setComments] = useState<IgaComment[]>([]);
  const [commentDraft, setCommentDraft] = useState("");
  const [isWorking, setIsWorking] = useState(false);
  const [denyOpen, setDenyOpen] = useState(false);
  const [denyReason, setDenyReason] = useState("");

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

  const onAuthorize = async () => {
    if (!cr) return;
    setIsWorking(true);
    try {
      await adminClient.iga.authorize({ id: cr.id });
      addAlert("Change request authorized.", AlertVariant.success);
      onChanged();
    } catch (err) {
      addError(`Failed to authorize change request: ${errorMessage(err)}`, err);
    } finally {
      setIsWorking(false);
    }
  };

  const onCommit = async () => {
    if (!cr) return;
    setIsWorking(true);
    try {
      await adminClient.iga.commit({ id: cr.id });
      addAlert("Change request committed.", AlertVariant.success);
      onChanged();
    } catch (err) {
      addError(`Cannot commit yet: ${errorMessage(err)}`, err);
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

  // Pick the most useful primary CTA: Commit > Authorize. Never both.
  const showCommitCta =
    !!cr && cr.status === "PENDING" && approvable && cr.readyToCommit;
  const showAuthorizeCta =
    !!cr &&
    cr.status === "PENDING" &&
    approvable &&
    !cr.readyToCommit &&
    !alreadySigned;

  const primaryCta = (() => {
    if (!cr) return null;
    if (showCommitCta) {
      return (
        <Tooltip
          key="commit-tip"
          content="Threshold met — apply this change now."
        >
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
      );
    }
    if (showAuthorizeCta) {
      return (
        <Button
          key="authorize"
          variant="primary"
          isLoading={isWorking}
          isDisabled={isWorking}
          onClick={onAuthorize}
        >
          Authorize
        </Button>
      );
    }
    // Disabled placeholder with a tooltip explaining why.
    if (cr.status !== "PENDING") return null;
    let tip = requiredRolesText || "Cannot act on this change request";
    if (approvable && alreadySigned && !cr.readyToCommit) {
      tip = "You have already signed; awaiting other approvers.";
    } else if (approvable && !cr.readyToCommit) {
      tip = `Threshold not met (${cr.authCount}/${cr.threshold})`;
    }
    const noop = () => {
      /* disabled placeholder */
    };
    return (
      <Tooltip key="cta-disabled-tip" content={tip}>
        <span>
          <Button variant="primary" isAriaDisabled onClick={noop}>
            Authorize
          </Button>
        </span>
      </Tooltip>
    );
  })();

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
                primaryCta,
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
                  {actionTypeLabel(cr.actionType)}
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
                <DescriptionListTerm>Created By</DescriptionListTerm>
                <DescriptionListDescription>
                  {cr.createdBy ?? "-"}
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
                {cr.authCount} of {cr.threshold}
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

            {/* ---- Raw payload ---- */}
            <ExpandableSection toggleText="Raw payload (rowsJson)" isIndented>
              <CodeBlock>
                <CodeBlockCode>{pretty(cr.rowsJson)}</CodeBlockCode>
              </CodeBlock>
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
