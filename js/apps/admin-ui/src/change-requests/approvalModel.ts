/** TIDECLOAK IMPLEMENTATION */
//
// M1b — multiAdmin two-phase change-request approval (+ firstAdmin single-phase).
//
// A multiAdmin CR approval is an enclave round-trip against the iga server's
// `/approval-model` endpoints:
//
//   1. GET  /iga/change-requests/{id}/approval-model
//        -> { requiresApprovalPopup, requestModel }   (requestModel = Base64)
//   2. Base64-decode requestModel -> bytes; hand to the Heimdall enclave via
//      approveTideRequests([{ id, request: bytes }]); the enclave returns the
//      doken+approval-embedded request bytes.
//   3. Base64-encode those bytes; POST them back to /approval-model
//        -> { recorded, authCount, threshold, readyForCommit }.
//
// firstAdmin / Tideless realms are NOT multiAdmin: the backend's
// `GET /approval-model` REFUSES with HTTP 409 + body `{ error: "NOT_MULTI_ADMIN" }`
// (see IgaAdminResource.getApprovalModel — it never returns
// `requiresApprovalPopup === false`). We detect that 409 here and run the
// single-phase flow instead: `POST .../authorize` then `POST .../commit`
// (firstAdmin authorize does NOT auto-commit — commit is an explicit step).
// This keeps the dual-mode branch UI-only, with no backend change.

import type KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type { IgaApprovalSubmitResult } from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import { NetworkError } from "@keycloak/keycloak-admin-client";

import { base64ToBytes, bytesToBase64 } from "../utils/tideSerialization";

/**
 * True when `err` is the backend's "this realm is not multiAdmin" refusal from
 * `GET /iga/change-requests/{id}/approval-model`: HTTP 409 CONFLICT carrying a
 * JSON body `{ error: "NOT_MULTI_ADMIN", ... }`. Any other failure (other 409s,
 * 403, 404, network) must NOT be treated as a single-phase signal — it has to
 * surface to the operator.
 */
function isNotMultiAdmin(err: unknown): boolean {
  if (!(err instanceof NetworkError) || err.response.status !== 409) {
    return false;
  }
  const data = err.responseData;
  return (
    typeof data === "object" &&
    data !== null &&
    (data as { error?: unknown }).error === "NOT_MULTI_ADMIN"
  );
}

/** The enclave approve entry point as exposed by `useEnvironment()`. */
export type ApproveTideRequests = (
  requests: { id: string; request: Uint8Array }[],
) => Promise<
  {
    id: string;
    approved?: { request: Uint8Array };
    denied?: boolean;
    pending?: boolean;
  }[]
>;

export type ApprovalModelOutcome =
  /**
   * firstAdmin / Tideless realm (server answered the two-phase probe with
   * 409 NOT_MULTI_ADMIN): the helper has already run the single-phase
   * `authorize` then `commit` and the change has been applied. The caller just
   * shows a success message and refreshes.
   */
  | { kind: "committed" }
  /** The two-phase round-trip completed and the server recorded the approval. */
  | { kind: "recorded"; result: IgaApprovalSubmitResult }
  /** The operator denied the request in the enclave popup. */
  | { kind: "denied" }
  /** The enclave returned pending (e.g. awaiting more operators). */
  | { kind: "pending" };

/**
 * Run the multiAdmin two-phase approval round-trip for a single CR.
 *
 * Returns a discriminated outcome rather than throwing for the
 * denied/pending/single-phase cases, so the UI can surface an appropriate
 * message. Genuine transport/enclave failures still throw and are handled by
 * the caller's existing try/catch.
 */
export async function runMultiAdminApproval(
  adminClient: KeycloakAdminClient,
  approveTideRequests: ApproveTideRequests,
  changeRequestId: string,
): Promise<ApprovalModelOutcome> {
  // ── Phase 1: fetch the model the admin must approve ───────────────────
  //
  // Probe the two-phase endpoint. firstAdmin / Tideless realms refuse with
  // 409 NOT_MULTI_ADMIN — in that case run the single-phase authorize+commit
  // flow. Any OTHER error (other 409s, 403, 404, transport) must propagate so
  // the operator sees the real failure (don't swallow genuine errors).
  console.log("[TIDE-APPROVAL] runMultiAdminApproval: start", {
    changeRequestId,
  });
  let model;
  try {
    model = await adminClient.iga.getApprovalModel({ id: changeRequestId });
    console.log("[TIDE-APPROVAL] GET /approval-model result", {
      changeRequestId,
      requiresApprovalPopup: model.requiresApprovalPopup,
      requestModelLength:
        typeof model.requestModel === "string"
          ? model.requestModel.length
          : null,
    });
  } catch (err) {
    if (isNotMultiAdmin(err)) {
      console.log(
        "[TIDE-APPROVAL] GET /approval-model -> 409 NOT_MULTI_ADMIN; running single-phase firstAdmin authorize+commit",
        { changeRequestId },
      );
      // firstAdmin single-phase: authorize, then commit (authorize alone does
      // not apply the change — commit is an explicit second step server-side).
      await adminClient.iga.authorize({ id: changeRequestId });
      await adminClient.iga.commit({ id: changeRequestId });
      return { kind: "committed" };
    }
    throw err;
  }

  // Defensive: if a backend ever DID answer the probe with
  // `requiresApprovalPopup === false` instead of a 409, treat it the same as
  // the single-phase realm (authorize + commit).
  if (!model.requiresApprovalPopup) {
    await adminClient.iga.authorize({ id: changeRequestId });
    await adminClient.iga.commit({ id: changeRequestId });
    return { kind: "committed" };
  }

  // ── Phase 2a: enclave approve (decode -> approve -> read result) ──────
  const requestBytes = base64ToBytes(model.requestModel);
  console.log(
    "[TIDE-APPROVAL] Phase 2a: handing request to enclave via approveTideRequests (opens Heimdall approval popup)",
    { changeRequestId, requestBytesLength: requestBytes.length },
  );
  const [approval] = await approveTideRequests([
    { id: changeRequestId, request: requestBytes },
  ]);
  console.log("[TIDE-APPROVAL] Phase 2a: enclave approve returned", {
    changeRequestId,
    approved: !!approval?.approved,
    denied: !!approval?.denied,
    pending: !!approval?.pending,
  });

  if (!approval) {
    throw new Error("Enclave returned no approval result for the request.");
  }
  if (approval.denied) {
    return { kind: "denied" };
  }
  if (!approval.approved) {
    // pending (or any non-approved, non-denied terminal state)
    return { kind: "pending" };
  }

  // ── Phase 2b: submit the doken-embedded model back to the server ─────
  const requestModel = bytesToBase64(approval.approved.request);
  const result = await adminClient.iga.submitApprovalModel({
    id: changeRequestId,
    requestModel,
  });

  return { kind: "recorded", result };
}
