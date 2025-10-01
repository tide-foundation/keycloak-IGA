import React, { useState, useEffect } from "react";
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
  DescriptionList,
  DescriptionListTerm,
  DescriptionListGroup,
  DescriptionListDescription,
  ChipGroup,
  Chip,
  Tooltip,
  Divider,
  Flex,
  FlexItem,
  Title,
  HelperText,
  HelperTextItem,
  Spinner,
} from "@patternfly/react-core";
import { Table, Thead, Tr, Th, Tbody, Td } from "@patternfly/react-table";
import { KeycloakDataTable } from "@keycloak/keycloak-ui-shared";
import RoleChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/RoleChangeRequest";
import { ViewHeader } from "../components/view-header/ViewHeader";
import "../events/events.css";
import helpUrls from "../help-urls";
import { RoutableTabs, useRoutableTab } from "../components/routable-tabs/RoutableTabs";
import { ChangeRequestsTab, toChangeRequests } from "./routes/ChangeRequests";
import { useRealm } from "../context/realm-context/RealmContext";
import { RolesChangeRequestsList } from "./RolesChangeRequestsList";
import { ClientChangeRequestsList } from "./ClientChangeRequestsList";
import { groupRequestsByDraftId } from "./utils/bundleUtils";
import { useAccess } from "../context/access/Access";
import { useAdminClient } from "../admin-client";
import { useEnvironment, useAlerts } from "@keycloak/keycloak-ui-shared";
import { useConfirmDialog } from "../components/confirm-dialog/ConfirmDialog";
import { findTideComponent } from "../identity-providers/utils/SignSettingsUtil";

/* ─────────────────────────────────────────────────────────────
   Light helpers (local HTTP using adminClient token)
   ───────────────────────────────────────────────────────────── */

async function kcGetJSON(adminClient: any, url: string) {
  const base: string = (adminClient as any).baseUrl || "";
  const token = await (adminClient as any).getAccessToken?.();
  const res = await fetch(`${base}${url}`, {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: token ? `Bearer ${token}` : "",
    },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${url} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

/* ─────────────────────────────────────────────────────────────
   Merge utilities for bulk actions
   ───────────────────────────────────────────────────────────── */

type ActionType = "ADD" | "REMOVE" | "UPDATE" | string;

type ChangeSetRef = {
  changeSetId: string;
  changeSetType: string;
  actionType: ActionType;
  role?: string;
  requestType?: string;
  clientId?: string;
  userId?: string;
};

type MergedContext = {
  key: string; // `${userId}|${clientId}`
  userId?: string;
  clientId?: string;
  actions: ChangeSetRef[];
  source: RoleChangeRequest[];
};

const userClientKey = (userId?: string, clientId?: string) => `${userId ?? ""}|${clientId ?? ""}`;

const normalizeActions = (items: ChangeSetRef[]): ChangeSetRef[] => {
  const map = new Map<string, ChangeSetRef>();
  for (const it of items) {
    const target = `${it.changeSetType}|${it.role ?? ""}|${it.clientId ?? ""}`;
    const existing = map.get(target);
    if (!existing) {
      map.set(target, it);
      continue;
    }
    const pair = `${existing.actionType}>${it.actionType}`;
    if (pair === "ADD>REMOVE" || pair === "REMOVE>ADD") {
      map.delete(target);
    } else {
      map.set(target, it);
    }
  }
  return Array.from(map.values());
};

const expandSelectedToRefs = (reqs: RoleChangeRequest[]): ChangeSetRef[] => {
  const out: ChangeSetRef[] = [];
  for (const r of reqs) {
    const uRecords: any[] = Array.isArray((r as any).userRecord) ? (r as any).userRecord : [];
    const csId = (r as any).draftRecordId || (r as any).changeSetId;
    if (uRecords.length === 0) {
      out.push({
        changeSetId: csId,
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
          changeSetId: csId,
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
    if (norm.length === 0) continue;
    merged.push({
      key,
      userId: items[0]?.userId,
      clientId: items[0]?.clientId,
      actions: norm,
      source: selected.filter((r) => items.some((i) => (r as any).draftRecordId === i.changeSetId)),
    });
  }
  return merged;
};

/* ─────────────────────────────────────────────────────────────
   Presentational helpers
   ───────────────────────────────────────────────────────────── */

const fmtTime = (ts?: number | string) => {
  if (!ts && ts !== 0) return "";
  const n = typeof ts === "string" ? parseInt(ts, 10) : ts;
  const ms = (n! < 10_000_000_000 ? n! * 1000 : n!) as number; // normalize seconds → ms
  try {
    return new Date(ms).toLocaleString();
  } catch {
    return String(ts);
  }
};

const statusPill = (status?: string) => {
  const s = (status || "").toUpperCase();
  const color =
    s === "APPROVED" ? "blue" : s === "PENDING" || s === "DRAFT" ? "orange" : s === "DENIED" ? "red" : "grey";
  return (
    <Label color={color as any} className="keycloak-admin--role-mapping__client-name">
      {s || "UNKNOWN"}
    </Label>
  );
};

const safeJsonPretty = (str?: string) => {
  try {
    if (!str) return "—";
    const obj = JSON.parse(str);
    return JSON.stringify(obj, null, 2);
  } catch {
    return str || "—";
  }
};

const UserChip: React.FC<{ u?: any }> = ({ u }) => {
  if (!u) return <Chip isOverflowChip>unknown</Chip>;
  const text =
    u.username ? `${u.username}${u.email ? ` • ${u.email}` : ""}` : u.email ? u.email : (u.id ?? "unknown");
  return (
    <Tooltip content={<div>{u.id}</div>}>
      <Chip isReadOnly>{text}</Chip>
    </Tooltip>
  );
};

/* ─────────────────────────────────────────────────────────────
   NEW↔LEGACY shape adapters (new list → legacy "bundle")
   ───────────────────────────────────────────────────────────── */

const isNewChangeSetDto = (it: any) => it && typeof it === "object" && "changeSetId" in it && "type" in it;

const toBundleFromChangeSet = (cs: any) => {
  const ctx0 = Array.isArray(cs.userContextsPreview) ? cs.userContextsPreview[0] ?? {} : {};
  const affected0 = Array.isArray(cs.affectedUsersDetailed) ? cs.affectedUsersDetailed[0] ?? {} : {};

  const requestRow = {
    draftRecordId: cs.changeSetId,
    changeSetId: cs.changeSetId,
    action: "UPDATE",
    role: (() => {
      try {
        const d = JSON.parse(cs.draft || "{}");
        return Array.isArray(d.roles) ? d.roles[0]?.name : undefined;
      } catch {
        return undefined;
      }
    })(),
    clientId: ctx0.clientId,
    requestType: cs.type,
    status: cs.status,
    userRecord: [
      {
        userId: ctx0.userId || affected0.id || cs.affectedUsers?.[0],
        username: affected0.username || ctx0.userId,
        clientId: ctx0.clientId,
        accessDraft: ctx0.context || cs.draft,
      },
    ],
  };

  const summary = [
    requestRow.role && `Role: ${requestRow.role}`,
    requestRow.clientId && `• Client: ${requestRow.clientId}`,
    requestRow.requestType && `• ${requestRow.requestType}`,
  ]
    .filter(Boolean)
    .join(" ");

  return {
    id: cs.changeSetId,

    // 👉 simple list fields
    summary,
    statusText: cs.status,
    submittedAt: cs.timestamp,
    requestedByDisplay: cs.requestedBy?.username || cs.requestedBy?.email || cs.requestedBy?.id || "-",
    affectedDisplay:
      affected0.username || affected0.email || affected0.id || (cs.affectedUsers?.[0] ?? "-"),
    approvalsCount: (cs.adminApprovals || []).length,
    rejectionsCount: (cs.adminRejections || []).length,

    // detail payload
    draftRecordId: cs.changeSetId,
    changeSetId: cs.changeSetId,
    requests: [requestRow],
    requestedBy: cs.requestedBy,
    timestamp: cs.timestamp,
    affectedUsers: cs.affectedUsers,
    affectedUsersDetailed: cs.affectedUsersDetailed,
    userContextsPreview: cs.userContextsPreview,
    adminApprovals: cs.adminApprovals,
    adminRejections: cs.adminRejections,
    draft: cs.draft,
    __hydratedFromList: true,
  };
};

/* ─────────────────────────────────────────────────────────────
   Role-diff helpers (preview vs current)
   ───────────────────────────────────────────────────────────── */

type RolesShape = { realm: Set<string>; client: Record<string, Set<string>> };

type RoleDelta = {
  realm: { added: string[]; removed: string[] };
  client: Record<string, { added: string[]; removed: string[] }>;
};

const emptyDelta: RoleDelta = { realm: { added: [], removed: [] }, client: {} };

const extractRolesFromPreview = (previewJson?: string): RolesShape => {
  try {
    const ctx = JSON.parse(previewJson || "{}");
    const realm = new Set<string>(ctx.realm_access?.roles ?? []);
    const client: Record<string, Set<string>> = {};
    const ra = ctx.resource_access || {};
    Object.keys(ra).forEach((cid) => {
      client[cid] = new Set<string>(ra[cid]?.roles ?? []);
    });
    return { realm, client };
  } catch {
    return { realm: new Set<string>(), client: {} };
  }
};

async function loadCurrentRoles(adminClient: any, userId: string, clientId?: string): Promise<RolesShape> {
  const realmRoles = await adminClient.users.listRealmRoleMappings({ id: userId });
  let clientRoles: string[] = [];
  if (clientId) {
    clientRoles = (
      await adminClient.users.listClientRoleMappings({ id: userId, clientUniqueId: clientId })
    ).map((r: any) => r.name);
  }
  return {
    realm: new Set<string>(realmRoles.map((r: any) => r.name)),
    client: clientId ? { [clientId]: new Set<string>(clientRoles) } : {},
  };
}

const diffSets = (before: Set<string>, after: Set<string>) => {
  const added: string[] = [];
  const removed: string[] = [];
  after.forEach((x) => !before.has(x) && added.push(x));
  before.forEach((x) => !after.has(x) && removed.push(x));
  return { added, removed };
};

/* ─────────────────────────────────────────────────────────────
   Detail panel (can skip fetch if list is hydrated)
   ───────────────────────────────────────────────────────────── */

const DetailPanel: React.FC<{
  bundle: any;
  adminClient: any;
  realm: string;
}> = ({ bundle, adminClient, realm }) => {
  const { t } = useTranslation();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [requestedBy, setRequestedBy] = useState<any | null>(null);
  const [approvals, setApprovals] = useState<any[]>([]);
  const [rejections, setRejections] = useState<any[]>([]);
  const [affectedUsers, setAffectedUsers] = useState<any[]>([]);
  const [submittedAt, setSubmittedAt] = useState<number | undefined>(undefined);
  const [accessDraft, setAccessDraft] = useState<string>("");

  const [roleDelta, setRoleDelta] = useState<RoleDelta>(emptyDelta);

  const firstReq = bundle?.requests?.[0] || {};
  const changeSetId =
    firstReq.changeSetId || firstReq.draftRecordId || bundle?.draftRecordId || bundle?.changeSetId;

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);

        // If row came from the new list (already hydrated), skip network calls
        if (bundle?.__hydratedFromList) {
          setSubmittedAt(bundle.timestamp ?? undefined);
          setRequestedBy(bundle.requestedBy ?? null);

          const aus =
            Array.isArray(bundle.affectedUsersDetailed) && bundle.affectedUsersDetailed.length
              ? bundle.affectedUsersDetailed
              : Array.isArray(bundle.affectedUsers)
              ? bundle.affectedUsers.map((id: string) => ({ id }))
              : [];
          setAffectedUsers(aus);

          const toChips = (arr: any[]) => (Array.isArray(arr) ? arr : []).map((a) => ({
            isApproval: !!a.isApproval,
            user: a.user || { id: a.userId },
          }));
          setApprovals(toChips(bundle.adminApprovals));
          setRejections(toChips(bundle.adminRejections));

          const fromReq =
            Array.isArray(firstReq?.userRecord) && firstReq.userRecord[0]?.accessDraft
              ? firstReq.userRecord[0].accessDraft
              : undefined;
          const fromPreview =
            Array.isArray(bundle.userContextsPreview) && bundle.userContextsPreview[0]?.context
              ? bundle.userContextsPreview[0].context
              : undefined;

          const ad = fromReq || fromPreview || bundle.draft || "";
          setAccessDraft(ad);

          // Compute role diff
          const urec = Array.isArray(firstReq?.userRecord) ? firstReq.userRecord[0] : undefined;
          const userId: string | undefined = urec?.userId;
          const clientId: string | undefined = urec?.clientId;
          const preview = extractRolesFromPreview(ad);
          let current: RolesShape = { realm: new Set<string>(), client: {} };
          if (userId) {
            try {
              current = await loadCurrentRoles(adminClient, userId, clientId);
            } catch (e) {
              // ignore load errors; show preview-only diff
            }
          }
          const realmDelta = diffSets(current.realm, preview.realm);
          const clientDelta = clientId
            ? diffSets(current.client[clientId] || new Set<string>(), preview.client[clientId] || new Set<string>())
            : { added: [], removed: [] };
          if (!cancelled)
            setRoleDelta({ realm: realmDelta, client: clientId ? { [clientId]: clientDelta } : {} });

          if (!cancelled) setLoading(false);
          return;
        }
        // Not hydrated; skip network fetch (tideUsersExt already provided data)
        setLoading(false);
        return;
      } catch (e: any) {
        if (!cancelled) setError(e?.message || "Failed to load details");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    if (changeSetId) load();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [changeSetId, adminClient, realm]);

  if (loading) {
    return (
      <div className="pf-v5-u-py-md">
        <Spinner size="md" /> <span className="pf-v5-u-ml-sm">{t("loading")}</span>
      </div>
    );
  }

  if (error) {
    return (
      <HelperText className="pf-v5-u-my-md">
        <HelperTextItem variant="error">{error}</HelperTextItem>
      </HelperText>
    );
  }

  // derive a user + client from the first request row for headings
  const urec = Array.isArray(firstReq.userRecord) ? firstReq.userRecord[0] : undefined;
  const clientId = urec?.clientId as string | undefined;

  return (
    <div className="pf-v5-u-pt-sm pf-v5-u-pb-md">
      <Flex direction={{ default: "row" }} spaceItems={{ default: "spaceItemsXl" }}>
        {/* Left: the change row(s) */}
        <FlexItem flex={{ default: "flex_2" }}>
          <Title headingLevel="h6" className="pf-v5-u-mb-sm">
            Requested changes
          </Title>
          <Table aria-label="Bundle details" variant="compact" borders={false} isStriped>
            <Thead>
              <Tr>
                <Th width={10}>Action</Th>
                <Th width={10}>Role</Th>
                <Th width={10}>Client</Th>
                <Th width={10}>Type</Th>
                <Th width={10}>Status</Th>
              </Tr>
            </Thead>
            <Tbody>
              {(Array.isArray(bundle.requests) ? bundle.requests : [bundle]).map((r: any, idx: number) => (
                <Tr key={idx}>
                  <Td dataLabel="Action">{r.action || "UPDATE"}</Td>
                  <Td dataLabel="Role">{r.role || "—"}</Td>
                  <Td dataLabel="Client">{r.clientId || "—"}</Td>
                  <Td dataLabel="Type">{r.requestType || bundle.type || "—"}</Td>
                  <Td dataLabel="Status">
                    {statusPill((r.status === "ACTIVE" ? r.deleteStatus || r.status : r.status) || bundle.status)}
                  </Td>
                </Tr>
              ))}
            </Tbody>
          </Table>
        </FlexItem>

        {/* Right: meta + approvals + diff + draft */}
        <FlexItem flex={{ default: "flex_3" }}>
          <Title headingLevel="h6" className="pf-v5-u-mb-sm">
            Request details
          </Title>
          <DescriptionList isHorizontal isCompact className="pf-v5-u-mb-md">
            <DescriptionListGroup>
              <DescriptionListTerm>Requested by</DescriptionListTerm>
              <DescriptionListDescription>{requestedBy ? <UserChip u={requestedBy} /> : "—"}</DescriptionListDescription>
            </DescriptionListGroup>

            <DescriptionListGroup>
              <DescriptionListTerm>Submitted</DescriptionListTerm>
              <DescriptionListDescription>{fmtTime(submittedAt) || "—"}</DescriptionListDescription>
            </DescriptionListGroup>

            <DescriptionListGroup>
              <DescriptionListTerm>Affected users</DescriptionListTerm>
              <DescriptionListDescription>
                {affectedUsers.length > 0 ? (
                  <ChipGroup>
                    {affectedUsers.map((u: any) => (
                      <UserChip key={u.id} u={u} />
                    ))}
                  </ChipGroup>
                ) : (
                  "—"
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>

            <DescriptionListGroup>
              <DescriptionListTerm>Approvals</DescriptionListTerm>
              <DescriptionListDescription>
                {approvals.length ? (
                  <ChipGroup>
                    {approvals.map((a, i) => (
                      <UserChip key={`ap-${i}`} u={a.user} />
                    ))}
                  </ChipGroup>
                ) : (
                  <span>—</span>
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>

            <DescriptionListGroup>
              <DescriptionListTerm>Rejections</DescriptionListTerm>
              <DescriptionListDescription>
                {rejections.length ? (
                  <ChipGroup>
                    {rejections.map((r, i) => (
                      <UserChip key={`rj-${i}`} u={r.user} />
                    ))}
                  </ChipGroup>
                ) : (
                  <span>—</span>
                )}
              </DescriptionListDescription>
            </DescriptionListGroup>
          </DescriptionList>

          <Divider className="pf-v5-u-my-md" />

          <Title headingLevel="h6" className="pf-v5-u-mt-md">
            What will change
          </Title>
          <DescriptionList isHorizontal isCompact style={{ maxWidth: 560 }}>
            <DescriptionListGroup>
              <DescriptionListTerm>Realm roles</DescriptionListTerm>
              <DescriptionListDescription>
                <Flex spaceItems={{ default: "spaceItemsSm" }}>
                  <FlexItem>
                    <Label color="green">Added</Label>
                    <ChipGroup>
                      {(roleDelta.realm.added.length ? roleDelta.realm.added : ["—"]).map((r, i) => (
                        <Chip key={`ra+${i}`} isReadOnly>
                          {r}
                        </Chip>
                      ))}
                    </ChipGroup>
                  </FlexItem>
                  <FlexItem>
                    <Label color="red">Removed</Label>
                    <ChipGroup>
                      {(roleDelta.realm.removed.length ? roleDelta.realm.removed : ["—"]).map((r, i) => (
                        <Chip key={`ra-${i}`} isReadOnly>
                          {r}
                        </Chip>
                      ))}
                    </ChipGroup>
                  </FlexItem>
                </Flex>
              </DescriptionListDescription>
            </DescriptionListGroup>

            {clientId && (
              <DescriptionListGroup>
                <DescriptionListTerm>Client roles ({clientId})</DescriptionListTerm>
                <DescriptionListDescription>
                  <Flex spaceItems={{ default: "spaceItemsSm" }}>
                    <FlexItem>
                      <Label color="green">Added</Label>
                      <ChipGroup>
                        {(
                          roleDelta.client[clientId]?.added.length ? roleDelta.client[clientId].added : ["—"]
                        ).map((r, i) => (
                          <Chip key={`ca+${i}`} isReadOnly>
                            {r}
                          </Chip>
                        ))}
                      </ChipGroup>
                    </FlexItem>
                    <FlexItem>
                      <Label color="red">Removed</Label>
                      <ChipGroup>
                        {(
                          roleDelta.client[clientId]?.removed.length ? roleDelta.client[clientId].removed : ["—"]
                        ).map((r, i) => (
                          <Chip key={`ca-${i}`} isReadOnly>
                            {r}
                          </Chip>
                        ))}
                      </ChipGroup>
                    </FlexItem>
                  </Flex>
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>

          <Divider className="pf-v5-u-my-md" />

          <Title headingLevel="h6" className="pf-v5-u-mb-sm">
            Access draft / token preview
          </Title>
          <ClipboardCopy isCode isReadOnly hoverTip="Copy" clickTip="Copied" variant={ClipboardCopyVariant.expansion}>
            {safeJsonPretty(
              (() => {
                try {
                  return typeof bundle.draft === "string" ? bundle.draft : JSON.stringify(bundle.draft ?? "");
                } catch {
                  return bundle.draft ?? "";
                }
              })()
            )}
          </ClipboardCopy>
        </FlexItem>
      </Flex>
    </div>
  );
};

/* ─────────────────────────────────────────────────────────────
   Main component
   ───────────────────────────────────────────────────────────── */

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
      const enabled = (await findTideComponent(adminClient, realm)) !== undefined;
      setIsTideEnabled(enabled);
    };
    checkTide();
  }, [adminClient, realm]);

  // enable/disable buttons based on first selected row
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
      (status === "ACTIVE" && (deleteStatus === "DRAFT" || deleteStatus === "PENDING"))
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

  /* Toolbar (approve / commit / cancel) */
  const ToolbarItemsComponent = () => {
    const { hasAccess } = useAccess();
    const isManager = hasAccess("manage-clients");
    if (!isManager) return <span />;

    return (
      <>
        <ToolbarItem>
          <Button
            variant="primary"
            isDisabled={!approveRecord || selectedRow.length === 0}
            onClick={async () => {
              try {
                const merged = mergeByUserClient(selectedRow);
                // @ts-ignore
                const tide = adminClient.tideUsersExt || adminClient.tideUserExt;
                for (const mc of merged) {
                  const changeSets = mc.actions.map((a) => ({
                    changeSetId: a.changeSetId,
                    changeSetType: a.changeSetType,
                    actionType: a.actionType,
                  }));
                  if (typeof tide?.approveDraftChangeSet === "function") {
                    await tide.approveDraftChangeSet({ changeSets });
                  }
                }
                refresh();
              } catch (error: any) {
                addAlert(error?.responseData ?? String(error), AlertVariant.danger);
              }
            }}
          >
            {isTideEnabled ? t("Review Draft") : t("Approve Draft")}
          </Button>
        </ToolbarItem>

        <ToolbarItem>
          <Button
            variant="secondary"
            isDisabled={!commitRecord || selectedRow.length === 0}
            onClick={async () => {
              try {
                const merged = mergeByUserClient(selectedRow);
                // @ts-ignore
                const tide = adminClient.tideUsersExt || adminClient.tideUserExt;
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
            }}
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

  /* Cancel dialog */
  const [toggleCancelDialog, CancelConfirm] = useConfirmDialog({
    titleKey: "Cancel Change Request",
    children: <>{"Are you sure you want to cancel this change request?"}</>,
    continueButtonLabel: "cancel",
    cancelButtonLabel: "back",
    continueButtonVariant: ButtonVariant.danger,
    onConfirm: async () => {
      try {
        // @ts-ignore
        const tide = adminClient.tideUsersExt || adminClient.tideUserExt;
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

  /* Summary columns (robust to both shapes) */
  // NOTE: KeycloakDataTable treats `cellRenderer` as a React component and passes the row value as props.
  const SummaryCell = (row: any): JSX.Element => <>{row.summary ?? ""}</>;
  const StatusCell = (row: any): JSX.Element | string => statusPill(row.statusText);
  const RequestedByCell = (row: any): JSX.Element | string => <Chip isReadOnly>{row.requestedByDisplay}</Chip>;
  const AffectedCell = (row: any): JSX.Element | string => <Chip isReadOnly>{row.affectedDisplay}</Chip>;
  const SubmittedCell = (row: any): JSX.Element | string => <>{fmtTime(row.submittedAt)}</>;
  const ApprovalsCell = (row: any): JSX.Element | string => (
    <span>
      <Label color="green" className="pf-v5-u-mr-sm">{row.approvalsCount}</Label>
      {row.rejectionsCount > 0 && <Label color="red">{row.rejectionsCount}</Label>}
    </span>
  );

  // TEMP DEBUG CELL — remove after verifying rendering
  const DebugCell = (row: any): JSX.Element => (
    <pre style={{ whiteSpace: "pre-wrap", margin: 0 }}>
      {JSON.stringify(row, null, 2)}
    </pre>
  );

  const columns = [
    { name: "⧉ debug", cellRenderer: DebugCell },
    { name: "Summary", cellRenderer: SummaryCell },
    { name: "Status", cellRenderer: StatusCell },
    { name: "Requested by", cellRenderer: RequestedByCell },
    { name: "For", cellRenderer: AffectedCell },
    { name: "Submitted", cellRenderer: SubmittedCell },
    { name: "Approvals", cellRenderer: ApprovalsCell },
  ];

  /* Detail column */
  const DetailCell = (bundle: any): JSX.Element => (
    <DetailPanel bundle={bundle} adminClient={adminClient} realm={realm} />
  );

  /* Counters & loader */
  const updateClientCounter = (n: number) => setClientRequestCount((p) => (p === n ? p : n));
  const updateRoleCounter = (n: number) => setRoleRequestCount((p) => (p === n ? p : n));
  const updateRealmSettingsCounter = (n: number) => setRealmSettingsRequestCount((p) => (p === n ? p : n));

  const loadUserRequests = async () => {
    try {
      const ext = (adminClient as any).tideUsersExt || (adminClient as any).tideUserExt;
      const rawMaybe = await ext?.getRequestedChangesForUsers?.();
      const raw: any[] = Array.isArray(rawMaybe) ? rawMaybe : [];

      if (raw.every(isNewChangeSetDto)) {
        const adapted = raw.map(toBundleFromChangeSet);
        setUserRequestCount(adapted.length);
        return adapted;
      }

      const bundled = groupRequestsByDraftId(raw as any[]);
      setUserRequestCount(bundled.length);
      return bundled;
    } catch (e) {
      console.error("Failed to load user change requests", e);
      return [];
    }
  };

  const loader = async () => {
    const rows = await loadUserRequests();
    return rows;
  };

  /* Tabs */
  const useTab = (tab: ChangeRequestsTab) => useRoutableTab(toChangeRequests({ realm, tab }));
  const userRequestsTab = useTab("users");
  const roleRequestsTab = useTab("roles");
  const clientRequestsTab = useTab("clients");
  const settingsRequestsTab = useTab("settings");

  return (
    <>
      {/* TEMP: force visibility to rule out theme/opacity issues */}
      <style>{`
        /* TEMP override: force visible text in dark theme */
        html.pf-v5-theme-dark .pf-v5-c-table thead th,
        html.pf-v5-theme-dark .pf-v5-c-table tbody td,
        html.pf-v5-theme-dark .pf-v5-c-chip,
        html.pf-v5-theme-dark .pf-v5-c-label {
          color: #fff !important;
        }
        html.pf-v5-theme-dark .pf-v5-c-table td * { color: inherit !important; }
      `}</style>
      <ViewHeader
        titleKey="Change Requests"
        subKey="Change requests require review by administrators."
        helpUrl={helpUrls.changeRequests}
        divider={false}
      />
      <PageSection data-testid="change-request-page" variant="light" className="pf-v5-u-p-0">
        <RoutableTabs mountOnEnter isBox defaultLocation={toChangeRequests({ realm, tab: "users" })}>
          <Tab
            title={
              <>
                <TabTitleText>Users</TabTitleText>
                {userRequestCount > 0 && <Label className="pf-v5-u-ml-sm">{userRequestCount}</Label>}
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
                    enabled: (row) => {
                      const bundle = row as any;
                      return !bundle || !Array.isArray(bundle.requests) || bundle.requests.length > 0;
                    },
                    cellRenderer: DetailCell,
                  },
                ]}
                columns={columns}
                isPaginated
                onSelect={(value: any[]) => {
                  const flattened = value.flatMap((b: any) => (Array.isArray(b?.requests) ? b.requests : []));
                  setSelectedRow(flattened);
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
                {roleRequestCount > 0 && <Label className="pf-v5-u-ml-sm">{roleRequestCount}</Label>}
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
                {clientRequestCount > 0 && <Label className="pf-v5-u-ml-sm">{clientRequestCount}</Label>}
              </>
            }
            {...clientRequestsTab}
          >
            <ClientChangeRequestsList updateCounter={updateClientCounter} />
          </Tab>

          {/* Settings tab kept hidden until wired */}
          {/* <Tab
            title={
              <>
                <TabTitleText>Settings</TabTitleText>
                {realmSettingsRequestCount > 0 && <Label className="pf-v5-u-ml-sm">{realmSettingsRequestCount}</Label>}
              </>
            }
            {...settingsRequestsTab}
          >
            <SettingsChangeRequestsList updateCounter={updateRealmSettingsCounter} />
          </Tab> */}
        </RoutableTabs>
      </PageSection>
    </>
  );
}
