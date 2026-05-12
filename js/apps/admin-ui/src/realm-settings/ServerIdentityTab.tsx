/** TIDECLOAK IMPLEMENTATION */
import { useState, useEffect, useCallback, Fragment } from "react";
import { useTranslation } from "react-i18next";
import {
  TextContent,
  Text,
  EmptyState,
  EmptyStateBody,
  Label,
  Button,
  AlertVariant,
  DescriptionList,
  DescriptionListGroup,
  DescriptionListTerm,
  DescriptionListDescription,
  Card,
  CardHeader,
  CardTitle,
  CardBody,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { useAdminClient } from "../admin-client";
import { useRealm } from "../context/realm-context/RealmContext";
import { useEnvironment, useAlerts } from "@keycloak/keycloak-ui-shared";
import {
  base64ToBytes,
  bytesToBase64,
} from "../utils/tideSerialization";
import {
  CheckCircleIcon,
  BanIcon,
  InProgressIcon,
} from "@patternfly/react-icons";

interface ServerCertEntry {
  id: string;
  changeRequestId: string;
  clientId: string;
  instanceId: string;
  spiffeId: string;
  fingerprint: string;
  status: string;
  revoked: boolean;
  timestamp: number;
  publicKey: string;
  signedPublicKey: string;
}

export const ServerIdentityTab = () => {
  const { adminClient } = useAdminClient();
  const { approveTideRequests } = useEnvironment();
  const { realm } = useRealm();
  const { t } = useTranslation();
  const { addAlert } = useAlerts();
  const [entries, setEntries] = useState<ServerCertEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedCertRows, setExpandedCertRows] = useState<Set<string>>(
    new Set(),
  );
  const [expandedKeyRows, setExpandedKeyRows] = useState<Set<string>>(
    new Set(),
  );

  const fetchEntries = useCallback(async () => {
    setLoading(true);
    try {
      const token = await adminClient.getAccessToken();
      const response = await fetch(
        `${adminClient.baseUrl}/admin/realms/${realm}/tide-admin/server-cert/requests`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
            Accept: "application/json",
          },
        },
      );
      if (response.ok) {
        const data: ServerCertEntry[] = await response.json();
        setEntries(data);
      }
    } catch (e) {
      console.error("Failed to fetch server identity entries", e);
    }
    setLoading(false);
  }, [adminClient, realm]);

  useEffect(() => {
    void fetchEntries();
  }, [fetchEntries]);

  const handleApprove = async (changeRequestId: string) => {
    try {
      const changeRequests = [
        {
          changeSetId: changeRequestId,
          changeSetType: "SERVER_CERT",
          actionType: "CREATE",
        },
      ];

      const respObj: any = await adminClient.tideUsersExt.approveDraftChangeSet(
        {
          changeSets: changeRequests,
        },
      );

      if (respObj.length > 0) {
        try {
          const firstRespObj = respObj[0];
          if (
            firstRespObj.requiresApprovalPopup === true ||
            firstRespObj.requiresApprovalPopup === "true"
          ) {
            const respMetaMap: Record<
              string,
              { actionType: string; changeSetType: string }
            > = {};

            const missingDraft = respObj.find(
              (resp: any) => !resp.changeSetDraftRequests,
            );
            if (missingDraft) {
              addAlert(
                "Server cert request model not available. Please rebuild the IGA extensions.",
                AlertVariant.danger,
              );
              return;
            }

            const changereqs = respObj.map((resp: any) => {
              respMetaMap[resp.changesetId] = {
                actionType: resp.actionType || "CREATE",
                changeSetType: resp.changeSetType || "SERVER_CERT",
              };
              return {
                id: resp.changesetId,
                request: base64ToBytes(resp.changeSetDraftRequests),
              };
            });

            const reviewResponses = await approveTideRequests(changereqs);

            for (const reviewResp of reviewResponses) {
              if (reviewResp.approved) {
                const meta = respMetaMap[reviewResp.id] || {
                  actionType: "CREATE",
                  changeSetType: "SERVER_CERT",
                };
                const msg = reviewResp.approved.request;
                const formData = new FormData();
                formData.append("changeSetId", reviewResp.id);
                formData.append("actionType", meta.actionType);
                formData.append("changeSetType", meta.changeSetType);
                formData.append("requests", bytesToBase64(msg));

                await adminClient.tideAdmin.addReview(formData);
              } else if (reviewResp.denied) {
                const meta = respMetaMap[reviewResp.id] || {
                  actionType: "CREATE",
                  changeSetType: "SERVER_CERT",
                };
                const formData = new FormData();
                formData.append("changeSetId", reviewResp.id);
                formData.append("actionType", meta.actionType);
                formData.append("changeSetType", meta.changeSetType);

                await adminClient.tideAdmin.addRejection(formData);
              }
            }
            // Commit after enclave approval
            await adminClient.tideUsersExt.commitDraftChangeSet({
              changeSets: changeRequests,
            });
            addAlert(
              "Server identity entry approved and signed",
              AlertVariant.success,
            );
          } else {
            // No enclave needed — commit directly
            await adminClient.tideUsersExt.commitDraftChangeSet({
              changeSets: changeRequests,
            });
            addAlert(
              "Server identity entry approved and signed",
              AlertVariant.success,
            );
          }
        } catch (error: any) {
          addAlert(
            error.responseData || "Approval failed",
            AlertVariant.danger,
          );
        } finally {
          void fetchEntries();
        }
      }
    } catch (error: any) {
      addAlert(error.responseData || "Approval failed", AlertVariant.danger);
    }
  };

  const handleCommit = async (changeRequestId: string) => {
    try {
      await adminClient.tideUsersExt.commitDraftChangeSet({
        changeSets: [
          {
            changeSetId: changeRequestId,
            changeSetType: "SERVER_CERT",
            actionType: "CREATE",
          },
        ],
      });
      addAlert(
        "Server identity entry signed and committed",
        AlertVariant.success,
      );
      void fetchEntries();
    } catch (e: any) {
      addAlert(e.responseData || "Commit failed", AlertVariant.danger);
    }
  };

  const handleRevoke = async (instanceId: string) => {
    try {
      const token = await adminClient.getAccessToken();
      const response = await fetch(
        `${adminClient.baseUrl}/admin/realms/${realm}/tide-admin/server-cert/revoke`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ instanceId }),
        },
      );
      if (response.ok) {
        addAlert(t("Server certificate revoked"), AlertVariant.success);
        void fetchEntries();
      } else {
        const err = await response.text();
        addAlert(err || "Revocation failed", AlertVariant.danger);
      }
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : "Revocation failed";
      addAlert(msg, AlertVariant.danger);
    }
  };

  const getStatusIcon = (entry: ServerCertEntry) => {
    if (entry.revoked)
      return (
        <Label color="red" icon={<BanIcon />}>
          Revoked
        </Label>
      );
    switch (entry.status) {
      case "ACTIVE":
        return (
          <Label color="green" icon={<CheckCircleIcon />}>
            Active
          </Label>
        );
      case "DRAFT":
        return (
          <Label color="blue" icon={<InProgressIcon />}>
            Pending Approval
          </Label>
        );
      case "APPROVED":
        return (
          <Label color="cyan" icon={<CheckCircleIcon />}>
            Approved
          </Label>
        );
      default:
        return <Label>{entry.status}</Label>;
    }
  };

  const renderActions = (entry: ServerCertEntry) => (
    <>
      {entry.status === "DRAFT" && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleApprove(entry.changeRequestId)}
        >
          Approve
        </Button>
      )}
      {entry.status === "APPROVED" && (
        <Button
          variant="primary"
          size="sm"
          onClick={() => void handleCommit(entry.changeRequestId)}
        >
          Commit
        </Button>
      )}
      {entry.status === "ACTIVE" && !entry.revoked && (
        <Button
          variant="danger"
          size="sm"
          onClick={() => void handleRevoke(entry.instanceId)}
        >
          Revoke
        </Button>
      )}
    </>
  );

  if (loading) {
    return (
      <EmptyState>
        <EmptyStateBody>Loading server identity...</EmptyStateBody>
      </EmptyState>
    );
  }

  if (entries.length === 0) {
    return (
      <EmptyState>
        <EmptyStateBody>
          No server identity entries. Server identity entries are created when
          app servers register via the public /tide-server-identity/request
          endpoint. They require admin quorum approval before VVK-signed
          credentials are issued.
        </EmptyStateBody>
      </EmptyState>
    );
  }

  return (
    <>
      {/* Section 1: Certificates */}
      <Card isPlain style={{ marginBottom: "2rem" }}>
        <CardHeader>
          <CardTitle>
            <TextContent>
              <Text component="h2">Certificates (SPIFFE SVIDs)</Text>
            </TextContent>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <TextContent style={{ marginBottom: "1rem" }}>
            <Text>
              VVK-signed X.509 certificates for server mTLS authentication. Each
              certificate binds a server instance to a client via a SPIFFE ID.
            </Text>
          </TextContent>

          <Table aria-label="Server certificates">
            <Thead>
              <Tr>
                <Th />
                <Th>Client</Th>
                <Th>Instance</Th>
                <Th>SPIFFE ID</Th>
                <Th>Fingerprint</Th>
                <Th>Status</Th>
                <Th>Requested</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {entries.map((entry) => (
                <Fragment key={`cert-${entry.id}`}>
                  <Tr>
                    <Td
                      expand={{
                        rowIndex: 0,
                        isExpanded: expandedCertRows.has(entry.id),
                        onToggle: () => {
                          setExpandedCertRows((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.id)) next.delete(entry.id);
                            else next.add(entry.id);
                            return next;
                          });
                        },
                      }}
                    />
                    <Td>{entry.clientId}</Td>
                    <Td>
                      <code>{entry.instanceId}</code>
                    </Td>
                    <Td>
                      <code>{entry.spiffeId}</code>
                    </Td>
                    <Td>
                      <code>{entry.fingerprint?.substring(0, 20)}...</code>
                    </Td>
                    <Td>{getStatusIcon(entry)}</Td>
                    <Td>{new Date(entry.timestamp).toLocaleString()}</Td>
                    <Td>{renderActions(entry)}</Td>
                  </Tr>
                  {expandedCertRows.has(entry.id) && (
                    <Tr isExpanded>
                      <Td colSpan={8}>
                        <DescriptionList isHorizontal>
                          <DescriptionListGroup>
                            <DescriptionListTerm>SPIFFE ID</DescriptionListTerm>
                            <DescriptionListDescription>
                              <code>{entry.spiffeId}</code>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup>
                            <DescriptionListTerm>
                              Full Fingerprint
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                              <code>{entry.fingerprint}</code>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup>
                            <DescriptionListTerm>
                              Change Request ID
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                              <code>{entry.changeRequestId}</code>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        </DescriptionList>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      {/* Section 2: Server Keys (gSRK) */}
      <Card isPlain style={{ marginBottom: "2rem" }}>
        <CardHeader>
          <CardTitle>
            <TextContent>
              <Text component="h2">Server Keys (gSRK)</Text>
            </TextContent>
          </CardTitle>
        </CardHeader>
        <CardBody>
          <TextContent style={{ marginBottom: "1rem" }}>
            <Text>
              Server public keys (gSRK) and their VVK-signed counterparts
              (signedGSRK). These keys are used for server-to-server
              authentication and are bound to each server instance.
            </Text>
          </TextContent>

          <Table aria-label="Server keys">
            <Thead>
              <Tr>
                <Th />
                <Th>Instance</Th>
                <Th>Fingerprint</Th>
                <Th>Public Key (gSRK)</Th>
                <Th>Status</Th>
                <Th>Actions</Th>
              </Tr>
            </Thead>
            <Tbody>
              {entries.map((entry) => (
                <Fragment key={`key-${entry.id}`}>
                  <Tr>
                    <Td
                      expand={{
                        rowIndex: 0,
                        isExpanded: expandedKeyRows.has(entry.id),
                        onToggle: () => {
                          setExpandedKeyRows((prev) => {
                            const next = new Set(prev);
                            if (next.has(entry.id)) next.delete(entry.id);
                            else next.add(entry.id);
                            return next;
                          });
                        },
                      }}
                    />
                    <Td>
                      <code>{entry.instanceId}</code>
                    </Td>
                    <Td>
                      <code>{entry.fingerprint?.substring(0, 20)}...</code>
                    </Td>
                    <Td>
                      <code>
                        {entry.publicKey
                          ? `${entry.publicKey.substring(0, 24)}...`
                          : "—"}
                      </code>
                    </Td>
                    <Td>{getStatusIcon(entry)}</Td>
                    <Td>{renderActions(entry)}</Td>
                  </Tr>
                  {expandedKeyRows.has(entry.id) && (
                    <Tr isExpanded>
                      <Td colSpan={6}>
                        <DescriptionList isHorizontal>
                          <DescriptionListGroup>
                            <DescriptionListTerm>
                              Public Key (gSRK)
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                              <code
                                style={{
                                  wordBreak: "break-all",
                                  display: "block",
                                  maxWidth: "600px",
                                }}
                              >
                                {entry.publicKey || "—"}
                              </code>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup>
                            <DescriptionListTerm>
                              Signed Public Key (signedGSRK)
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                              <code
                                style={{
                                  wordBreak: "break-all",
                                  display: "block",
                                  maxWidth: "600px",
                                }}
                              >
                                {entry.signedPublicKey || "—"}
                              </code>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                          <DescriptionListGroup>
                            <DescriptionListTerm>
                              Change Request ID
                            </DescriptionListTerm>
                            <DescriptionListDescription>
                              <code>{entry.changeRequestId}</code>
                            </DescriptionListDescription>
                          </DescriptionListGroup>
                        </DescriptionList>
                      </Td>
                    </Tr>
                  )}
                </Fragment>
              ))}
            </Tbody>
          </Table>
        </CardBody>
      </Card>

      <Button
        variant="secondary"
        onClick={() => void fetchEntries()}
        style={{ marginTop: "1rem" }}
      >
        Refresh
      </Button>
    </>
  );
};
