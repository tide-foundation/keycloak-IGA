/* TIDECLOAK IMPLEMENTATION */
import type { KeycloakAdminClient } from "../client.js";
import Resource from "./resource.js";
import type IgaChangeRequest from "../defs/igaChangeRequestRepresentation.js";
import type {
  IgaChangeRequestStatus,
  IgaApprovalModel,
  IgaApprovalSubmitResult,
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

  public authorize = this.makeRequest<{ id: string }, IgaChangeRequest>({
    method: "POST",
    path: "/iga/change-requests/{id}/authorize",
    urlParamKeys: ["id"],
  });

  public commit = this.makeRequest<{ id: string }, IgaChangeRequest>({
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
   * Phase 1 of the multiAdmin two-phase approval round-trip.
   *
   * Fetches the `Policy:1` `ModelRequest` the approving admin must hand to the
   * Heimdall enclave. `requestModel` is Base64; the UI decodes it to bytes,
   * runs `approveTideRequests`, then submits the doken-embedded result back via
   * {@link submitApprovalModel}. `requiresApprovalPopup` tells the UI whether
   * this CR actually takes the two-phase path (multiAdmin) or the legacy
   * single-phase `authorize` path (firstAdmin). `realm` is supplied as the base
   * url param from `client.realmName`, so only `id` is templated here.
   */
  public getApprovalModel = this.makeRequest<{ id: string }, IgaApprovalModel>({
    method: "GET",
    path: "/iga/change-requests/{id}/approval-model",
    urlParamKeys: ["id"],
  });

  /**
   * Phase 2 of the multiAdmin two-phase approval round-trip.
   *
   * Submits the doken+approval-embedded model (Base64) the enclave produced
   * from {@link getApprovalModel}'s `requestModel`. `id` is templated into the
   * path; the remaining `{ requestModel }` becomes the JSON body. Returns the
   * recorded authorization progress — when `readyForCommit` is `true` the
   * existing commit flow can run.
   */
  public submitApprovalModel = this.makeRequest<
    { id: string; requestModel: string },
    IgaApprovalSubmitResult
  >({
    method: "POST",
    path: "/iga/change-requests/{id}/approval-model",
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
