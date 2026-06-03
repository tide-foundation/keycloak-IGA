/** TIDECLOAK IMPLEMENTATION */
//
// M1b — multiAdmin two-phase change-request approval.
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
// firstAdmin / legacy single-phase CRs are signalled by the server returning
// `requiresApprovalPopup === false`; those keep the existing one-call
// `iga.authorize({ id })` path (this helper reports `singlePhase` so the caller
// can fall through).

import type KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type { IgaApprovalSubmitResult } from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

import { base64ToBytes, bytesToBase64 } from "../utils/tideSerialization";

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
  /** Server says this CR does not use the popup — caller runs `authorize`. */
  | { kind: "singlePhase" }
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
  const model = await adminClient.iga.getApprovalModel({ id: changeRequestId });

  // Legacy single-phase CR (firstAdmin): no enclave popup — let the caller
  // fall back to the plain authorize path.
  if (!model.requiresApprovalPopup) {
    return { kind: "singlePhase" };
  }

  // ── Phase 2a: enclave approve (decode -> approve -> read result) ──────
  const requestBytes = base64ToBytes(model.requestModel);
  const [approval] = await approveTideRequests([
    { id: changeRequestId, request: requestBytes },
  ]);

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
