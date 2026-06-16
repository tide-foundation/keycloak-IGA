/* TIDECLOAK IMPLEMENTATION */
import type { KeycloakAdminClient } from "../client.js";
import Resource from "./resource.js";
import type IgaChangeRequest from "../defs/igaChangeRequestRepresentation.js";
import type {
  IgaChangeRequestStatus,
  IgaApproveResult,
  IgaCommitResult,
} from "../defs/igaChangeRequestRepresentation.js";
import type IgaComment from "../defs/igaCommentRepresentation.js";
import type ClientRepresentation from "../defs/clientRepresentation.js";
import type { PendingChangeRequest } from "../utils/pendingChangeRequest.js";

export class Iga extends Resource<{ realm?: string }> {
  public listChangeRequests = this.makeRequest<
    { status?: IgaChangeRequestStatus },
    IgaChangeRequest[]
  >({
    method: "GET",
    path: "/iga/change-requests",
    queryParamKeys: ["status"],
  });

  public getChangeRequest = this.makeRequest<{ id: string }, IgaChangeRequest>({
    method: "GET",
    path: "/iga/change-requests/{id}",
    urlParamKeys: ["id"],
  });

  /**
   * SIGN-ONLY approval endpoint. Records the caller's authorization toward the
   * CR's threshold; it does NOT apply the change. Applying is the separate
   * {@link commit} step (`POST .../commit`), enabled once the threshold is met.
   *
   * The SERVER decides which ceremony applies:
   *
   *  - firstAdmin / Tideless / simple-attestor, or an already-signed CR: call
   *    with an empty body. The caller's authorization is recorded (idempotent
   *    no-op if already signed — NOT a 409). Result is
   *    `{ mode: "recorded", authCount, threshold, readyToCommit, status }`.
   *  - multiAdmin: inherently two-phase over this SAME endpoint.
   *      • Phase 1 (empty body) → `{ mode: "needs-approval", requestModel }`:
   *        the Base64 `Policy:1` carrier to hand to the Heimdall enclave.
   *      • Phase 2 (body `{ requestModel: <signed doken Base64> }`) → records
   *        the doken toward the threshold. Result is
   *        `{ mode: "recorded", authCount, threshold, readyToCommit, status }`.
   *
   * `id` is templated into the path; the optional `{ requestModel }` becomes
   * the JSON body. `readyToCommit` (`authCount >= threshold`) is the signal the
   * UI uses to enable the separate {@link commit} action.
   */
  public approve = this.makeRequest<
    { id: string; requestModel?: string },
    IgaApproveResult
  >({
    method: "POST",
    path: "/iga/change-requests/{id}/approve",
    urlParamKeys: ["id"],
  });

  /**
   * APPLY-ONLY commit endpoint — the second of the two decoupled steps. After
   * a CR has been signed to its threshold via {@link approve}, this applies the
   * change. It is NOT the old refused legacy `/commit` lane; it is the new
   * quorum-gated apply step.
   *
   * Success: `{ committed: true, changeRequestId, status: "APPROVED",
   * changeRequest }`. Failures the caller must handle:
   *  - 412 `QUORUM_NOT_MET` — committed before the threshold was met; sign more
   *    approvals first.
   *  - 412 `DEPENDENCY_NOT_MET` / `PENDING_ADMIN_GRANTS` — a blocking
   *    prerequisite CR must commit first.
   *  - 403 / 404 / 409 — not authorized / gone / already resolved.
   *
   * The error code is carried on the thrown `NetworkError`'s `problem.code`
   * (RFC 7807); `response.status` carries the HTTP status.
   */
  public commit = this.makeRequest<{ id: string }, IgaCommitResult>({
    method: "POST",
    path: "/iga/change-requests/{id}/commit",
    urlParamKeys: ["id"],
  });

  public deny = this.makeRequest<{ id: string; reason?: string }, void>({
    method: "POST",
    path: "/iga/change-requests/{id}/deny",
    urlParamKeys: ["id"],
  });

  public listComments = this.makeRequest<{ id: string }, IgaComment[]>({
    method: "GET",
    path: "/iga/change-requests/{id}/comments",
    urlParamKeys: ["id"],
  });

  public addComment = this.makeRequest<
    { id: string; body: string },
    IgaComment
  >({
    method: "POST",
    path: "/iga/change-requests/{id}/comments",
    urlParamKeys: ["id"],
  });

  public signPreview = this.makeRequest<{ id: string }, unknown>({
    method: "POST",
    path: "/iga/change-requests/{id}/first-admin-sign-preview",
    urlParamKeys: ["id"],
  });

  /**
   * Capture a client-create for IGA approval instead of creating it natively.
   *
   * Sends the full `ClientRepresentation` as the JSON body to the backend
   * IGA capture endpoint. The backend responds with HTTP 202 and a
   * `PendingChangeRequest` envelope, which the shared Agent request layer
   * detects (status 202 + keys-based `pendingChangeRequestFromResponse`) and
   * surfaces verbatim — identical to the existing F1 model-path behaviour.
   * `realm` is a base url param (supplied from `client.realmName`) so it is
   * stripped from the JSON body by the Agent and never pollutes the payload.
   */
  public captureCreateClient = this.makeRequest<
    ClientRepresentation,
    PendingChangeRequest
  >({
    method: "POST",
    path: "/iga/capture/clients",
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
