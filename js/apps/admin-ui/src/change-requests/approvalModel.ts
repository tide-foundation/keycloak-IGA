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

/** Per-CR outcome of the bulk batch approval. Mirrors {@link ApprovalModelOutcome}
 *  but always carries the originating CR id so the caller can map back. */
export type BatchApprovalOutcome = { changeRequestId: string } & (
  | { kind: "committed" }
  | { kind: "recorded"; result: IgaApprovalSubmitResult }
  | { kind: "denied" }
  | { kind: "pending" }
  | { kind: "error"; error: unknown }
);

/**
 * Bulk multiAdmin approval that opens the Heimdall enclave **exactly once** for
 * the whole batch.
 *
 * Today the per-CR {@link runMultiAdminApproval} opens the enclave once per CR
 * (N pop-ups / N round-trips). The enclave's `approve()` already accepts an
 * ARRAY of `{ id, request }` carriers and signs them all in a single popup
 * interaction (one doken, one open), returning an array of approvals keyed by
 * id. This helper exploits that:
 *
 *   1. Phase 1 — GET `/approval-model` for every CR and collect the decoded
 *      carriers `{ id, request: bytes }` into ONE array. firstAdmin / Tideless
 *      CRs (409 NOT_MULTI_ADMIN, or `requiresApprovalPopup === false`) take the
 *      single-phase authorize+commit path immediately — they never touch the
 *      enclave, so they don't add a carrier to the batch.
 *   2. Phase 2a — call `approveTideRequests(allCarriers)` ONCE. One enclave
 *      pop-up; the admin authorizes once; the enclave signs all N carriers and
 *      returns N approvals, each tagged with its CR id.
 *   3. Phase 2b — for each approved carrier, POST its own doken-embedded model
 *      back to `/approval-model` (per-CR commit; there is no bulk submit
 *      endpoint). This is plain HTTP — no further enclave interaction.
 *
 * Correctness is preserved: each CR keeps its own carrier and its own returned
 * signature, mapped back by id. The single doken established at
 * `initApprovalEnclave` authorizes the whole interaction; the ORK's Policy:1
 * contract validates the approver's role per request inside that one
 * interaction (each carrier carries its own request model).
 *
 * Returns one {@link BatchApprovalOutcome} per input id (order preserved). Phase-1
 * GET failures and phase-2 POST failures are captured per-CR as `error`
 * outcomes so one bad CR doesn't sink the batch. A failure of the single
 * `approveTideRequests` call (the enclave itself) DOES throw, since that is a
 * batch-wide failure the caller must surface.
 */
export async function runMultiAdminApprovalBatch(
  adminClient: KeycloakAdminClient,
  approveTideRequests: ApproveTideRequests,
  changeRequestIds: string[],
): Promise<BatchApprovalOutcome[]> {
  console.log("[TIDE-APPROVAL] runMultiAdminApprovalBatch: start", {
    batchSize: changeRequestIds.length,
    changeRequestIds,
  });

  const outcomes = new Map<string, BatchApprovalOutcome>();
  // Carriers that need the enclave, collected for ONE approveTideRequests call.
  const carriers: { id: string; request: Uint8Array }[] = [];

  // ── Phase 1: fetch every carrier; run single-phase CRs immediately ────
  for (const changeRequestId of changeRequestIds) {
    let model;
    try {
      model = await adminClient.iga.getApprovalModel({ id: changeRequestId });
    } catch (err) {
      if (isNotMultiAdmin(err)) {
        // firstAdmin single-phase: authorize + commit; no enclave carrier.
        try {
          console.log(
            "[TIDE-APPROVAL] batch: 409 NOT_MULTI_ADMIN; single-phase authorize+commit",
            { changeRequestId },
          );
          await adminClient.iga.authorize({ id: changeRequestId });
          await adminClient.iga.commit({ id: changeRequestId });
          outcomes.set(changeRequestId, { changeRequestId, kind: "committed" });
        } catch (innerErr) {
          outcomes.set(changeRequestId, {
            changeRequestId,
            kind: "error",
            error: innerErr,
          });
        }
        continue;
      }
      outcomes.set(changeRequestId, {
        changeRequestId,
        kind: "error",
        error: err,
      });
      continue;
    }

    if (!model.requiresApprovalPopup) {
      // Defensive single-phase fallback (see runMultiAdminApproval).
      try {
        await adminClient.iga.authorize({ id: changeRequestId });
        await adminClient.iga.commit({ id: changeRequestId });
        outcomes.set(changeRequestId, { changeRequestId, kind: "committed" });
      } catch (innerErr) {
        outcomes.set(changeRequestId, {
          changeRequestId,
          kind: "error",
          error: innerErr,
        });
      }
      continue;
    }

    carriers.push({
      id: changeRequestId,
      request: base64ToBytes(model.requestModel),
    });
  }

  console.log("[TIDE-APPROVAL] batch: phase-1 done", {
    enclaveCarriers: carriers.length,
    singlePhaseResolved: outcomes.size,
  });

  // ── Phase 2a: ONE enclave open for every multiAdmin carrier ───────────
  if (carriers.length > 0) {
    console.log(
      "[TIDE-APPROVAL] batch Phase 2a: handing ALL carriers to the enclave in ONE approveTideRequests call (single Heimdall popup, one doken)",
      { batchSize: carriers.length, ids: carriers.map((c) => c.id) },
    );
    const approvals = await approveTideRequests(carriers);
    const byId = new Map(approvals.map((a) => [a.id, a]));
    console.log("[TIDE-APPROVAL] batch Phase 2a: enclave returned", {
      returned: approvals.length,
      ids: approvals.map((a) => a.id),
    });

    // ── Phase 2b: per-CR commit of each returned approval (plain HTTP) ───
    for (const carrier of carriers) {
      const approval = byId.get(carrier.id);
      if (!approval) {
        outcomes.set(carrier.id, {
          changeRequestId: carrier.id,
          kind: "error",
          error: new Error(
            "Enclave returned no approval result for this request.",
          ),
        });
        continue;
      }
      if (approval.denied) {
        outcomes.set(carrier.id, {
          changeRequestId: carrier.id,
          kind: "denied",
        });
        continue;
      }
      if (!approval.approved) {
        outcomes.set(carrier.id, {
          changeRequestId: carrier.id,
          kind: "pending",
        });
        continue;
      }
      try {
        const requestModel = bytesToBase64(approval.approved.request);
        const result = await adminClient.iga.submitApprovalModel({
          id: carrier.id,
          requestModel,
        });
        outcomes.set(carrier.id, {
          changeRequestId: carrier.id,
          kind: "recorded",
          result,
        });
      } catch (err) {
        outcomes.set(carrier.id, {
          changeRequestId: carrier.id,
          kind: "error",
          error: err,
        });
      }
    }
  }

  // Preserve input order.
  return changeRequestIds.map(
    (id) =>
      outcomes.get(id) ?? {
        changeRequestId: id,
        kind: "error",
        error: new Error("No outcome produced for change request."),
      },
  );
}
