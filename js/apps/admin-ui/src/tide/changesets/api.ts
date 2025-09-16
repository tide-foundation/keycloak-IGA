// // TIDECLOAK IMPLEMENTATION
import type { TokenPreviewSpec } from "../tokenPreview/types";

export type DraftStatus = "DRAFT" | "PENDING" | "APPROVED" | "ACTIVE" | "NULL";
export type ChangeSetType =
  | "USER_ROLE" | "ROLE" | "COMPOSITE_ROLE" | "DEFAULT_ROLES"
  | "CLIENT_FULLSCOPE" | "CLIENT" | "USER"
  | "GROUP" | "USER_GROUP_MEMBERSHIP" | "GROUP_ROLE";

export interface RequestChangesUserRecord {
  username: string;
  proofId: string;
  clientId: string;
  proofDraft: string; // JSON string containing preview token
}

export interface RequestedChanges {
  title: string;
  type: ChangeSetType;
  requestType: "USER" | "ROLE" | "CLIENT";
  clientId?: string;
  realmName: string;
  action: string; // description
  changeSetId: string;
  userRecord: RequestChangesUserRecord[];
  draftStatus: DraftStatus;
  deleteStatus: DraftStatus;
}

function url(realm: string, path: string) {
  return `/realms/${encodeURIComponent(realm)}/tidecloak/iga/${path}`;
}

async function getJSON(realm: string, path: string) {
  const r = await fetch(url(realm, path));
  if (!r.ok) throw new Error(await r.text());
  return r.json();
}

async function postJSON(realm: string, path: string, body: any) {
  const r = await fetch(url(realm, path), {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify(body),
  });
  if (!r.ok) throw new Error(await r.text());
  return r.json().catch(() => ({}));
}

export const ChangesetAPI = {
  users: (realm: string) => getJSON(realm, "change-set/users/requests") as Promise<RequestedChanges[]>,
  roles: (realm: string) => getJSON(realm, "change-set/roles/requests") as Promise<RequestedChanges[]>,
  clients: (realm: string) => getJSON(realm, "change-set/clients/requests") as Promise<RequestedChanges[]>,
  sign: (realm: string, changeSetId: string, type: ChangeSetType) =>
    postJSON(realm, "change-set/sign", { changeSetId, type }),
  signBatch: (realm: string, items: { changeSetId: string, type: ChangeSetType }[]) =>
    postJSON(realm, "change-set/sign/batch", { changeSets: items }),
  commit: (realm: string, changeSetId: string, type: ChangeSetType) =>
    postJSON(realm, "change-set/commit", { changeSetId, type }),
  commitBatch: (realm: string, items: { changeSetId: string, type: ChangeSetType }[]) =>
    postJSON(realm, "change-set/commit/batch", { changeSets: items }),
  cancel: (realm: string, changeSetId: string, type: ChangeSetType) =>
    postJSON(realm, "change-set/cancel", { changeSetId, type }),
  cancelBatch: (realm: string, items: { changeSetId: string, type: ChangeSetType }[]) =>
    postJSON(realm, "change-set/cancel/batch", { changeSets: items }),
};
