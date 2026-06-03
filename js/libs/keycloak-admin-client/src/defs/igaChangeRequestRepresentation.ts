/* TIDECLOAK IMPLEMENTATION */
export type IgaChangeRequestStatus = "PENDING" | "APPROVED" | "DENIED";

export type IgaScopeMode = "any" | "all";

export interface IgaCrAuthorizerRepresentation {
  username: string;
  timestamp: number;
}

export default interface IgaChangeRequest {
  id: string;
  realmId: string;
  status: IgaChangeRequestStatus;
  actionType: string;
  entityType: string;
  entityId: string | null;
  rowsJson: string;
  authCount: number;
  authorizationCount?: number;
  threshold: number;
  requiredApproverRoles: string[];
  scopeMode: IgaScopeMode;
  createdBy: string | null;
  createdAt: number;
  finalSignature: string | null;
  denyReason: string | null;
  authorizers: IgaCrAuthorizerRepresentation[];
  readyToCommit: boolean;
  dependsOn?: string[];
  blocked?: boolean;
  blockedReason?: string;
}

/**
 * Phase 1 of the multiAdmin two-phase approval round-trip.
 *
 * Returned by `GET /iga/change-requests/{id}/approval-model`. `requestModel`
 * is the Base64-encoded serialized `Policy:1` `ModelRequest` the approving
 * admin must hand to the Heimdall enclave (`approveTideRequests`).
 *
 * `requiresApprovalPopup` is the discriminator the UI branches on: when
 * `true` the CR is a multiAdmin request that must take the enclave round-trip;
 * when `false` the legacy single-phase authorize path applies and the
 * `requestModel` can be ignored.
 */
export interface IgaApprovalModel {
  changeRequestId: string;
  actionType: string;
  requiresApprovalPopup: boolean;
  requestModel: string;
}

/**
 * Phase 2 result of the multiAdmin two-phase approval round-trip.
 *
 * Returned by `POST /iga/change-requests/{id}/approval-model` after the
 * doken+approval-embedded model is submitted back. `readyForCommit` is `true`
 * once the recorded authorizations meet the threshold, at which point the
 * existing commit flow can run.
 */
export interface IgaApprovalSubmitResult {
  recorded: boolean;
  authCount: number;
  threshold: number;
  readyForCommit: boolean;
}
