import type { KeycloakAdminClient } from "../client.js";
import Resource from "./resource.js";
import type RequestedChanges from "../defs/RequestedChanges.js";
import type RoleChangeRequest from "../defs/RoleChangeRequest.js";
import type CompositeRoleChangeRequest from "../defs/CompositeRoleChangeRequest.js";
import type DraftChangeSetRequest from "../defs/DraftChangeSetRequest.js";

// TIDECLOAK IMPLEMENTATION
interface ChangeSetRequest {
  changeSetId: string;
  changeSetType: string;
  actionType: string;
}

interface ChangeSetRequestList {
  changeSets: ChangeSetRequest[];
}

export interface RoleDraftStatus {
  draftStatus: string,
  deleteStatus: string
}

export interface changeSetApprovalRequest {
  message: string,
  uri: string,
  changeSetRequests: string,
  requiresApprovalPopup: string,
  expiry: string
}

export class TideUsersExt extends Resource<{ realm?: string }> {
    public generateDefaultUserContext = this.makeRequest<
    {
        clients?: (string)[];
    },
    string
    >({
        method: "POST",
        path: "/tide-admin/generate-default-user-context",
        payloadKey: "clients",
    });

  public getUserDraftStatus = this.makeRequest<
    { id: string },
    string
  >({
    method: "GET",
    path: "/tide-admin/users/{id}/draft/status",
    urlParamKeys: ["id"],
  });

  public getUserRoleDraftStatus = this.makeRequest<
    { userId: string, roleId: string },
    RoleDraftStatus
  >({
    method: "GET",
    path: "/tide-admin/users/{userId}/roles/{roleId}/draft/status",
    urlParamKeys: ["userId", "roleId"],
  });

  public getRoleDraftStatus = this.makeRequest<
    { parentId: string, childId: string },
    RoleDraftStatus
  >({
    method: "GET",
    path: "/tide-admin/composite/{parentId}/child/{childId}/draft/status",
    urlParamKeys: ["parentId", "childId"],
  });

  public getRequestedChangesForUsers = this.makeRequest<void, RoleChangeRequest[]>({
    method: "GET",
    path: "/tide-admin/change-set/users/requests",
  });

  public getRequestedChangesForRoles = this.makeRequest<void, CompositeRoleChangeRequest[] | RoleChangeRequest[]>({
    method: "GET",
    path: "/tide-admin/change-set/roles/requests",
  });

  public getRequestedChangesForClients = this.makeRequest<void, RequestedChanges[]>({
    method: "GET",
    path: "/tide-admin/change-set/clients/requests",
  });

  public getRequestedChangesForRagnarokSettings = this.makeRequest<void, RequestedChanges[]>({
    method: "GET",
    path: "/ragnarok/change-set/offboarding/requests",
  });


  public approveDraftChangeSet = this.makeRequest<
  ChangeSetRequestList,
  string[]
>({
  method: "POST",
  path: "/tide-admin/change-set/sign/batch",
});


  public cancelDraftChangeSet = this.makeRequest<
    ChangeSetRequestList,
    void
  >({
    method: "POST",
    path: "/tide-admin/change-set/cancel/batch",
  });

  public commitDraftChangeSet = this.makeRequest<
    ChangeSetRequestList,
    void
  >({
    method: "POST",
    path: "/tide-admin/change-set/commit/batch",
  });

  constructor(client: KeycloakAdminClient) {
    super(client, {
      path: "/admin/realms/{realm}",
      getUrlParams: () => ({
        realm: client.realmName,
      }),
      getBaseUrl: () => client.baseUrl,
    });
  }
}
