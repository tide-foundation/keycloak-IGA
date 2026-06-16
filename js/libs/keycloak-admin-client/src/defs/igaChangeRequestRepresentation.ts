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
 * Result of the unified `POST /iga/change-requests/{id}/approve` endpoint.
 *
 * This is the single endpoint the Approvals inbox calls; the server decides
 * which ceremony applies (firstAdmin/Tideless inline-commit, or multiAdmin
 * two-phase enclave) rather than the client probing `/approval-model` and
 * falling back to the legacy `authorize`+`commit` lane.
 *
 * The `mode` discriminator distinguishes the two server responses:
 *
 *  - `"needs-approval"` (multiAdmin phase 1, empty request body): the server
 *    built and persisted the `Policy:1` carrier the approving admin must hand
 *    to the Heimdall enclave. `requestModel` is the Base64-encoded carrier;
 *    the UI decodes it, runs `approveTideRequests`, then calls `approve` AGAIN
 *    with the signed doken in the body (phase 2).
 *
 *  - `"recorded"` (firstAdmin/Tideless single round-trip, OR multiAdmin phase
 *    2 with the signed doken): the caller's authorization was recorded and, if
 *    the threshold was met, the server ran the FULL commit pipeline inline.
 *    `committed` is authoritative: `true` means the change has already been
 *    applied (the unified endpoint auto-commits at quorum, so there is no
 *    separate legacy `/commit` step for these CRs).
 */
export interface IgaApproveResult {
  mode: "needs-approval" | "recorded";
  changeRequestId: string;
  /** multiAdmin phase 1 only (`mode === "needs-approval"`). */
  actionType?: string;
  /** multiAdmin phase 1 only: Base64 `Policy:1` carrier for the enclave. */
  requestModel?: string;
  /**
   * `mode === "recorded"` only. `true` once the threshold was met and the
   * server auto-committed the change inline. Authoritative.
   */
  committed?: boolean;
  authCount: number;
  threshold: number;
  /** `mode === "recorded"` only: the CR status after the commit attempt. */
  crStatus?: string;
}
