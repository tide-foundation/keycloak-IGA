/** TIDECLOAK IMPLEMENTATION */

import { useCallback, useEffect, useState } from "react";
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
import type IgaComment from "@keycloak/keycloak-admin-client/lib/defs/igaCommentRepresentation";

import { canApprove } from "./canApprove";
import { actionTypeLabel, entityTypeLabel, formatTime } from "./formatters";

type Props = {
  id: string;
  userRoles: string[];
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

export function ChangeRequestsDetail({
  id,
  userRoles,
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
      addError("Failed to load change request", err);
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
      addError("Failed to authorize change request", err);
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
      addError("Failed to deny change request", err);
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
      addError("Failed to add comment", err);
    } finally {
      setIsWorking(false);
    }
  };

  const approvable = cr ? canApprove(cr, userRoles) : false;
  const requiredRolesText = cr?.requiredApproverRoles?.length
    ? `Requires role${
        cr.requiredApproverRoles.length > 1 ? "s" : ""
      }: ${cr.requiredApproverRoles.join(", ")}${
        cr.scopeMode === "all" ? " (all required)" : " (any one)"
      }`
    : "";

  return (
    <>
      <Modal
        variant={ModalVariant.medium}
        title="Change request"
        isOpen
        onClose={onClose}
        actions={
          cr
            ? [
                approvable ? (
                  <Button
                    key="authorize"
                    variant="primary"
                    isLoading={isWorking}
                    isDisabled={
                      isWorking || cr.status !== "PENDING" || !approvable
                    }
                    onClick={onAuthorize}
                  >
                    Authorize
                  </Button>
                ) : (
                  <Tooltip
                    key="authorize-disabled-tip"
                    content={requiredRolesText || "Cannot authorize"}
                  >
                    <span>
                      <Button
                        variant="primary"
                        isAriaDisabled
                        onClick={() => {
                          /* disabled */
                        }}
                      >
                        Authorize
                      </Button>
                    </span>
                  </Tooltip>
                ),
                <Button
                  key="deny"
                  variant={ButtonVariant.danger}
                  isDisabled={isWorking || cr.status !== "PENDING"}
                  onClick={() => setDenyOpen(true)}
                >
                  Deny
                </Button>,
                <Button key="close" variant="link" onClick={onClose}>
                  Close
                </Button>,
              ]
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
                <DescriptionListTerm>Authorizations</DescriptionListTerm>
                <DescriptionListDescription>
                  {cr.authCount} / {cr.threshold}
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

            <TextContent>
              <Text component="h3">Payload</Text>
            </TextContent>
            <CodeBlock>
              <CodeBlockCode>{pretty(cr.rowsJson)}</CodeBlockCode>
            </CodeBlock>

            <Divider style={{ margin: "1rem 0" }} />

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
