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
        path: "/generate-default-user-context",
        payloadKey: "clients",
    });

  public getUserDraftStatus = this.makeRequest<
    { id: string },
    string
  >({
    method: "GET",
    path: "/users/{id}/draft/status",
    urlParamKeys: ["id"],
  });

  public getUserRoleDraftStatus = this.makeRequest<
    { userId: string, roleId: string },
    RoleDraftStatus
  >({
    method: "GET",
    path: "/users/{userId}/roles/{roleId}/draft/status",
    urlParamKeys: ["userId", "roleId"],
  });

  public getRoleDraftStatus = this.makeRequest<
    { parentId: string, childId: string },
    RoleDraftStatus
  >({
    method: "GET",
    path: "/composite/{parentId}/child/{childId}/draft/status",
    urlParamKeys: ["parentId", "childId"],
  });

  public getRequestedChangesForUsers = this.makeRequest<void, RoleChangeRequest[]>({
    method: "GET",
    path: "/change-set/users/requests",
  });

  public getRequestedChangesForRoles = this.makeRequest<void, CompositeRoleChangeRequest[] | RoleChangeRequest[]>({
    method: "GET",
    path: "/change-set/roles/requests",
  });

  public getRequestedChangesForClients = this.makeRequest<void, RequestedChanges[]>({
    method: "GET",
    path: "/change-set/clients/requests",
  });

  public getRequestedChangesForRealmSettings = async (): Promise<RequestedChanges[]> => {
    // Return dummy data for now
    return [
      {
        action: "UPDATE",
        changeSetType: "REALM_SETTINGS",
        requestType: "REALM_CONFIG",
        clientId: "realm-management",
        actionType: "MODIFY",
        draftRecordId: "realm-draft-001",
        userRecord: [{
          username: "admin",
          proofDetailId: "proof-001",
          clientId: "realm-management",
          accessDraft: "PENDING"
        }],
        status: "PENDING_APPROVAL",
        deleteStatus: "ACTIVE"
      },
      {
        action: "CREATE",
        changeSetType: "REALM_SETTINGS",
        requestType: "THEME_CONFIG",
        clientId: "realm-management",
        actionType: "ADD",
        draftRecordId: "realm-draft-002",
        userRecord: [{
          username: "admin",
          proofDetailId: "proof-002",
          clientId: "realm-management",
          accessDraft: "PENDING"
        }],
        status: "PENDING_APPROVAL",
        deleteStatus: "ACTIVE"
      }
    ];
  };


  public approveDraftChangeSet = this.makeRequest<
  ChangeSetRequestList,
  string[]
>({
  method: "POST",
  path: "/change-set/sign/batch",
});


  public cancelDraftChangeSet = this.makeRequest<
    ChangeSetRequestList,
    void
  >({
    method: "POST",
    path: "/change-set/cancel/batch",
  });

  public commitDraftChangeSet = this.makeRequest<
    ChangeSetRequestList,
    void
  >({
    method: "POST",
    path: "/change-set/commit/batch",
  });

  public offboardProvider = this.makeRequest<void, void>({
    method: "POST",
    path: "/offboard",
  });

  constructor(client: KeycloakAdminClient) {
    super(client, {
      path: "/admin/realms/{realm}/tide-admin",
      getUrlParams: () => ({
        realm: client.realmName,
      }),
      getBaseUrl: () => client.baseUrl,
    });
  }
}
