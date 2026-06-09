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
  /**
   * The change payload, already parsed by the backend into one row object per
   * affected record. This is the authoritative field name the REST API emits
   * (`IgaChangeRequestRepresentation.getRows()`); it replaces the old
   * `rowsJson` string the UI used to (incorrectly) read, which the server never
   * sends — hence the historically-empty payload panel.
   */
  rows: Record<string, unknown>[];
  /**
   * Number of recorded authorizations toward the threshold. The REST API field
   * is `authorizationCount` (`getAuthorizationCount()`); `authCount` is kept as
   * an optional legacy alias but is never populated by the server.
   */
  authorizationCount: number;
  /** @deprecated server emits `authorizationCount`; kept for back-compat. */
  authCount?: number;
  threshold: number;
  requiredApproverRoles: string[];
  scopeMode: IgaScopeMode;
  /** Username of the admin who raised the change request. */
  requestedBy: string | null;
  /** @deprecated server emits `requestedBy`; kept for back-compat. */
  createdBy?: string | null;
  createdAt: number;
  resolvedAt?: number | null;
  resolvedBy?: string | null;
  finalSignature?: string | null;
  denyReason?: string | null;
  authorizers: IgaCrAuthorizerRepresentation[];
  readyToCommit: boolean;
  /**
   * For a pending `tide-realm-admin` `GRANT_ROLES`/`REVOKE_ROLES` change
   * request, the id of the pending `REGEN_ADMIN_POLICY` change request that was
   * auto-created alongside it (the admin-threshold-policy regeneration). The
   * UI uses this to auto-include the linked policy CR in the same one-open
   * approval ceremony when its grant CRs are bulk-authorized.
   *
   * This is purely informational — the policy CR carries NO blocking
   * `dependsOn` relationship to the grant CR; both are independent CRs the
   * operator signs together. `null` when there is no linked policy CR.
   */
  relatedPolicyCrId?: string | null;
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
