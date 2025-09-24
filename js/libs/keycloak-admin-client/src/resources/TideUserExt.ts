import type { KeycloakAdminClient } from "../client.js";
import Resource from "./resource.js";
import type RequestedChanges from "../defs/RequestedChanges.js";
import type RoleChangeRequest from "../defs/RoleChangeRequest.js";
import type CompositeRoleChangeRequest from "../defs/CompositeRoleChangeRequest.js";
import type DraftChangeSetRequest from "../defs/DraftChangeSetRequest.js";

// ---- Types kept for backward compatibility ----
interface ChangeSetRequest {
  changeSetId: string;
  changeSetType: string;
  actionType: string;
}
interface ChangeSetRequestList {
  changeSets: ChangeSetRequest[];
}

// Legacy UI shape (we’ll normalize server response into this)
export interface RoleDraftStatus {
  draftStatus: string;
  deleteStatus: string;
}

export interface changeSetApprovalRequest {
  message: string;
  uri: string;
  changeSetRequests: string;
  requiresApprovalPopup: string;
  expiry: string;
}

// Optional list params for POST listing endpoints
type ListParams = {
  first?: number;
  max?: number;
  status?: "DRAFT" | "PENDING" | "APPROVED" | "ACTIVE" | "DENIED" | "UNKNOWN" | "ALL";
};

export class TideUsersExt extends Resource<{ realm?: string }> {
  constructor(client: KeycloakAdminClient) {
    super(client, {
      path: "/admin/realms/{realm}",
      getUrlParams: () => ({ realm: client.realmName }),
      getBaseUrl: () => client.baseUrl,
    });
  }

  // ---------- Utility to map server {status, deleteStatus} -> legacy {draftStatus, deleteStatus} ----------
  private toRoleDraftStatus(input: any): RoleDraftStatus {
    return {
      draftStatus: (input?.status ?? "ACTIVE").toString(),
      deleteStatus: (input?.deleteStatus ?? "").toString(),
    };
  }

  /** Generate default user context for a set of clients */
  public generateDefaultUserContext = this.makeRequest<
    { clients?: string[] },
    string
  >({
    method: "POST",
    path: "/tide-admin/generate-default-user-context",
    payloadKey: "clients",
  });

  /** User-level overall draft status (normalized to legacy RoleDraftStatus) */
  public getUserDraftStatusRaw = this.makeRequest<{ id: string }, any>({
    method: "GET",
    path: "/tide-admin/users/{id}/draft/status",
    urlParamKeys: ["id"],
  });

  public getUserDraftStatus = async (payload: { id: string }): Promise<string> => {
    // Original method signature returned string; keep it and return draftStatus only
    const raw = await this.getUserDraftStatusRaw(payload);
    const norm = this.toRoleDraftStatus(raw);
    return norm.draftStatus;
  };

  /** User + Role draft status (normalized to legacy RoleDraftStatus) */
  public getUserRoleDraftStatusRaw = this.makeRequest<
    { userId: string; roleId: string },
    any
  >({
    method: "GET",
    path: "/tide-admin/users/{userId}/roles/{roleId}/draft/status",
    urlParamKeys: ["userId", "roleId"],
  });

  public getUserRoleDraftStatus = async (payload: {
    userId: string;
    roleId: string;
  }): Promise<RoleDraftStatus> => {
    const raw = await this.getUserRoleDraftStatusRaw(payload);
    return this.toRoleDraftStatus(raw);
  };

  /** Composite Role draft status (normalized) */
  public getRoleDraftStatusRaw = this.makeRequest<
    { parentId: string; childId: string },
    any
  >({
    method: "GET",
    path: "/tide-admin/composite/{parentId}/child/{childId}/draft/status",
    urlParamKeys: ["parentId", "childId"],
  });

  public getRoleDraftStatus = async (payload: {
    parentId: string;
    childId: string;
  }): Promise<RoleDraftStatus> => {
    const raw = await this.getRoleDraftStatusRaw(payload);
    return this.toRoleDraftStatus(raw);
  };

  // ---------- Listing change requests (POST; optional { first, max, status }) ----------
  public getRequestedChangesForUsers = this.makeRequest<ListParams | void, RoleChangeRequest[]>({
    method: "POST",
    path: "/tide-admin/change-set/users/requests",
  });

  public getRequestedChangesForRoles = this.makeRequest<
    ListParams | void,
    CompositeRoleChangeRequest[] | RoleChangeRequest[]
  >({
    method: "POST",
    path: "/tide-admin/change-set/roles/requests",
  });

  public getRequestedChangesForClients = this.makeRequest<ListParams | void, RequestedChanges[]>({
    method: "POST",
    path: "/tide-admin/change-set/clients/requests",
  });

  // (Left as-is if still applicable for your environment)
  public getRequestedChangesForRagnarokSettings = this.makeRequest<void, RequestedChanges[]>({
    method: "GET",
    path: "/ragnarok/change-set/offboarding/requests",
  });

  // ---------- Approve/Sign, Cancel, Commit (BATCH) ----------
  /**
   * Approve = Sign for Tide IGA (kept old name for UI compatibility).
   * Backend endpoint is sign/batch.
   * Returns string[] for popup flow compatibility (some deployments return JSON strings).
   */
  public approveDraftChangeSet = this.makeRequest<ChangeSetRequestList, string[]>({
    method: "POST",
    path: "/tide-admin/change-set/sign/batch",
  });

  public cancelDraftChangeSet = this.makeRequest<ChangeSetRequestList, void>({
    method: "POST",
    path: "/tide-admin/change-set/cancel/batch",
  });

  public commitDraftChangeSet = this.makeRequest<ChangeSetRequestList, void>({
    method: "POST",
    path: "/tide-admin/change-set/commit/batch",
  });

  // ---------- Enclave popup helpers (FormData) ----------
  public addAuthorization = this.makeUpdateRequest<any, void>({
    method: "POST",
    path: "/tide-admin/change-set/authorization",
    // send raw FormData (no JSON encoding)
    headers: {},
  });

  public addRejection = this.makeUpdateRequest<any, void>({
    method: "POST",
    path: "/tide-admin/change-set/rejection",
    headers: {},
  });
}
