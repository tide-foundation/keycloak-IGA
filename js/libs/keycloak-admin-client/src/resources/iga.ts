/* TIDECLOAK IMPLEMENTATION */
import type { KeycloakAdminClient } from "../client.js";
import Resource from "./resource.js";
import type IgaChangeRequest from "../defs/igaChangeRequestRepresentation.js";
import type {
  IgaChangeRequestStatus,
  IgaApproveResult,
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
   * Unified approval endpoint — the single call the Approvals inbox uses to
   * approve (and, at quorum, auto-commit) a change request.
   *
   * The SERVER decides which ceremony applies. The legacy `authorize`+`commit`
   * and two-phase `approval-model` lanes have been removed from this client;
   * the only commit path is this endpoint:
   *
   *  - firstAdmin / Tideless / simple-attestor: call with an empty body. The
   *    server records the caller's authorization inline and, if the threshold
   *    is now met, runs the full commit pipeline. Result is
   *    `{ mode: "recorded", committed, ... }`.
   *  - multiAdmin: inherently two-phase over this SAME endpoint.
   *      • Phase 1 (empty body) → `{ mode: "needs-approval", requestModel }`:
   *        the Base64 `Policy:1` carrier to hand to the Heimdall enclave.
   *      • Phase 2 (body `{ requestModel: <signed doken Base64> }`) → records
   *        the doken toward threshold and AUTO-COMMITS at quorum. Result is
   *        `{ mode: "recorded", committed, ... }`.
   *
   * `id` is templated into the path; the optional `{ requestModel }` becomes
   * the JSON body. `committed` in the `"recorded"` result is authoritative —
   * there is no separate legacy `/commit` step for CRs approved this way.
   */
  public approve = this.makeRequest<
    { id: string; requestModel?: string },
    IgaApproveResult
  >({
    method: "POST",
    path: "/iga/change-requests/{id}/approve",
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
