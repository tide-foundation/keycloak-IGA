/** TIDECLOAK IMPLEMENTATION */
//
// Two change-request actions, BOTH available on a PENDING CR:
//
//   - `runMultiAdminApproval` drives `POST /iga/change-requests/{id}/approve`,
//     which APPROVES AND COMMITS in one: it records the caller's authorization
//     toward the threshold and, when that records the final approval needed,
//     AUTO-COMMITS the change server-side at quorum. The SERVER decides which
//     ceremony applies (it knows the attestor and the firstAdmin/multiAdmin
//     mode). The `committed` flag on the result tells the caller whether the
//     change was applied (quorum reached) or merely recorded (more approvers
//     still needed).
//   - `commitChangeRequest` drives `POST .../commit`, which APPLIES ONLY — it
//     commits a CR that has already been signed to its threshold without
//     recording a new approval. This is the explicit quorum-gated apply step
//     for an already-at-quorum CR (412 QUORUM_NOT_MET below threshold).
//
//   firstAdmin / Tideless / simple attestor (single round-trip APPROVE+COMMIT):
//     POST /approve  (empty body)
//        -> { mode: "recorded", committed, authCount, threshold, readyToCommit,
//             status }
//     Records the authorization inline and auto-commits at quorum. `committed`
//     says whether the change was applied. Already-signed = idempotent no-op.
//
//   multiAdmin (two-phase APPROVE+COMMIT, SAME /approve endpoint):
//     1. POST /approve  (empty body)
//          -> { mode: "needs-approval", requestModel }   (requestModel = Base64)
//     2. Base64-decode requestModel -> bytes; hand to the Heimdall enclave via
//        approveTideRequests([{ id, request: bytes }]); the enclave returns the
//        doken+approval-embedded request bytes.
//     3. POST /approve  (body { requestModel: <Base64 doken> })
//          -> { mode: "recorded", committed, authCount, threshold, ... }.
//        Records the doken toward the threshold and AUTO-COMMITS at quorum.
//
//   APPLY-only (both modes), `commitChangeRequest`:
//     POST /commit -> { committed: true, status: "APPROVED", changeRequest }.
//     412 QUORUM_NOT_MET if attempted below threshold (approve to quorum first).
//
// Authorize is routed through `/approve` (approve+commit) and Commit through
// `/commit` (apply-only); both are exposed in the UI.

import type KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import { NetworkError } from "@keycloak/keycloak-admin-client";
import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type {
  IgaApproveResult,
  IgaCommitResult,
} from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

import { base64ToBytes, bytesToBase64 } from "../utils/tideSerialization";
import { crNamesMap, type CrNamesMap } from "./formatters";

/** The enclave approve entry point as exposed by `useEnvironment()`.
 *
 * `names` is an OPTIONAL display-only id->name map (see {@link CrNamesMap}) the
 * enclave's sign card uses to render role/user names instead of UUIDs. It is
 * never signed and never affects the request bytes; extra carrier fields pass
 * through structured-clone/postMessage untouched. */
export type ApproveTideRequests = (
  requests: { id: string; request: Uint8Array; names?: CrNamesMap }[],
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
   * The authorization was recorded by the APPROVE+COMMIT `/approve` endpoint. For
   * a firstAdmin/Tideless/simple CR this is a single round-trip; for a
   * multiAdmin CR this is phase 2 (after the enclave sign). At quorum the server
   * AUTO-COMMITS as part of the same call: `result.committed === true` means the
   * change was applied. Below threshold the signature counted but more approvers
   * are still needed (`committed` falsy, `readyToCommit` false).
   */
  | { kind: "recorded"; result: IgaApproveResult }
  /** The operator denied the request in the enclave popup. */
  | { kind: "denied" }
  /** The enclave returned pending (e.g. awaiting more operators). */
  | { kind: "pending" };

/**
 * Run the APPROVE+COMMIT `/approve` flow for a single CR. This records the
 * caller's authorization toward the threshold and AUTO-COMMITS the change
 * server-side once that records the final approval needed (quorum). The
 * `committed` flag on the result reports whether the change was applied.
 *
 * One endpoint, server-decided ceremony: firstAdmin/Tideless realms get a
 * single inline record+commit round-trip; multiAdmin realms get the two-phase
 * enclave ceremony (phase 1 returns the carrier, phase 2 submits the signed
 * doken and the server commits at quorum). The legacy `authorize`/
 * `approval-model` endpoints are NOT used here.
 *
 * Returns a discriminated outcome rather than throwing for the denied/pending
 * cases, so the UI can surface an appropriate message. Genuine transport/
 * enclave failures still throw and are handled by the caller's try/catch.
 */
export async function runMultiAdminApproval(
  adminClient: KeycloakAdminClient,
  approveTideRequests: ApproveTideRequests,
  changeRequestId: string,
): Promise<ApprovalModelOutcome> {
  // ── Phase 1: POST /approve with no body (APPROVE + auto-commit). ──────
  //
  // The server returns mode "recorded" for firstAdmin/Tideless/simple CRs
  // (the authorization was recorded inline and auto-committed at quorum), or
  // mode "needs-approval" carrying the Policy:1 enclave carrier for multiAdmin
  // CRs.
  console.log("[TIDE-APPROVAL] runMultiAdminApproval: start", {
    changeRequestId,
  });
  const phase1 = await adminClient.iga.approve({ id: changeRequestId });
  console.log("[TIDE-APPROVAL] POST /approve (phase 1) result", {
    changeRequestId,
    mode: phase1.mode,
    readyToCommit: phase1.readyToCommit,
    requestModelLength:
      typeof phase1.requestModel === "string"
        ? phase1.requestModel.length
        : null,
  });

  // firstAdmin / Tideless / simple, OR a multiAdmin CR the server resolved
  // without an enclave round-trip: the endpoint recorded the authorization and
  // auto-committed at quorum (`phase1.committed` reports whether it applied).
  if (phase1.mode !== "needs-approval") {
    return { kind: "recorded", result: phase1 };
  }

  if (!phase1.requestModel) {
    throw new Error(
      "Server requested enclave approval but returned no requestModel carrier.",
    );
  }

  // ── Phase 2a: enclave approve (decode -> approve -> read result) ──────
  const requestBytes = base64ToBytes(phase1.requestModel);
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

  // ── Phase 2b: POST /approve with the signed doken (records toward quorum,
  //    server auto-commits at quorum) ───────────────────────────────────
  const requestModel = bytesToBase64(approval.approved.request);
  const result = await adminClient.iga.approve({
    id: changeRequestId,
    requestModel,
  });
  console.log("[TIDE-APPROVAL] POST /approve (phase 2) result", {
    changeRequestId,
    mode: result.mode,
    readyToCommit: result.readyToCommit,
    authCount: result.authCount,
    threshold: result.threshold,
  });

  return { kind: "recorded", result };
}

/**
 * Outcome of the APPLY-only `/commit` step.
 *
 *  - `kind: "committed"` — the change was applied; the CR is now APPROVED.
 *  - `kind: "quorum-not-met"` — 412 `QUORUM_NOT_MET`: commit was attempted
 *    before the threshold was met. Sign more approvals (`/approve`) first. The
 *    caller surfaces this as a soft, non-error message.
 *
 * Every other failure (other 412 codes, 403, 404, 409, transport) is thrown for
 * the caller's try/catch, with the RFC 7807 detail/code on the error.
 */
export type CommitOutcome =
  | { kind: "committed"; result: IgaCommitResult }
  | { kind: "quorum-not-met"; message: string };

/**
 * Extract the Tide problem `code` from a thrown error, if it is a
 * {@link NetworkError} carrying an RFC 7807 problem body. Returns `undefined`
 * for any other error shape.
 */
function problemCodeOf(err: unknown): string | undefined {
  return err instanceof NetworkError ? err.problem?.code : undefined;
}

/**
 * Drive the APPLY-only `POST /iga/change-requests/{id}/commit` step for a
 * single CR. This applies a change that has already been signed to its
 * threshold via {@link runMultiAdminApproval}; it performs NO signing and opens
 * NO enclave.
 *
 * Returns a discriminated {@link CommitOutcome} so the caller can surface the
 * 412 `QUORUM_NOT_MET` "approve to quorum before committing" case softly rather
 * than as a hard error. All other failures (other 412 codes, 403/404/409,
 * transport) are re-thrown for the caller's try/catch.
 */
export async function commitChangeRequest(
  adminClient: KeycloakAdminClient,
  changeRequestId: string,
): Promise<CommitOutcome> {
  console.log("[TIDE-APPROVAL] commitChangeRequest: start", {
    changeRequestId,
  });
  try {
    const result = await adminClient.iga.commit({ id: changeRequestId });
    console.log("[TIDE-APPROVAL] POST /commit result", {
      changeRequestId,
      committed: result.committed,
      status: result.status,
    });
    return { kind: "committed", result };
  } catch (err) {
    if (problemCodeOf(err) === "QUORUM_NOT_MET") {
      return {
        kind: "quorum-not-met",
        message:
          "Not enough approvals yet — approve to quorum before committing.",
      };
    }
    // Other 412 (DEPENDENCY_NOT_MET / PENDING_ADMIN_GRANTS), 403, 404, 409,
    // transport: re-throw with the RFC 7807 detail/code intact for the caller.
    throw err;
  }
}

/** Per-CR outcome of the bulk batch approval. Mirrors {@link ApprovalModelOutcome}
 *  but always carries the originating CR id so the caller can map back. */
export type BatchApprovalOutcome = { changeRequestId: string } & (
  | { kind: "recorded"; result: IgaApproveResult }
  | { kind: "denied" }
  | { kind: "pending" }
  | { kind: "error"; error: unknown }
);

/**
 * Bulk APPROVE+COMMIT over the `/approve` endpoint that opens the Heimdall
 * enclave **exactly once** for the whole batch. Each CR is recorded toward its
 * threshold and AUTO-COMMITTED server-side at quorum (`result.committed`
 * reports whether it applied). The explicit apply-only {@link commitChangeRequest}
 * remains separate (bulk Commit calls it per quorum-met CR).
 *
 * The per-CR {@link runMultiAdminApproval} opens the enclave once per CR (N
 * pop-ups / N round-trips). The enclave's `approve()` accepts an ARRAY of
 * `{ id, request }` carriers and signs them all in a single popup interaction
 * (one doken, one open), returning an array of approvals keyed by id. This
 * helper exploits that:
 *
 *   1. Phase 1 — POST `/approve` (empty body) for every CR. firstAdmin/Tideless/
 *      simple CRs come back `mode: "recorded"` (authorization recorded inline,
 *      auto-committed at quorum, no enclave); they never add a carrier to the
 *      batch. multiAdmin CRs come back `mode: "needs-approval"` carrying the
 *      Policy:1 carrier, which we decode and collect into ONE array.
 *   2. Phase 2a — call `approveTideRequests(allCarriers)` ONCE. One enclave
 *      pop-up; the admin authorizes once; the enclave signs all N carriers and
 *      returns N approvals, each tagged with its CR id.
 *   3. Phase 2b — for each approved carrier, POST its own doken-embedded model
 *      back to `/approve` (per-CR; records toward the threshold and auto-commits
 *      at quorum). This is plain HTTP — no further enclave interaction.
 *
 * Correctness is preserved: each CR keeps its own carrier and its own returned
 * signature, mapped back by id. The single doken established at
 * `initApprovalEnclave` authorizes the whole interaction; the ORK's Policy:1
 * contract validates the approver's role per request inside that one
 * interaction (each carrier carries its own request model).
 *
 * Returns one {@link BatchApprovalOutcome} per input id (order preserved). Phase-1
 * and phase-2 POST failures are captured per-CR as `error` outcomes so one bad
 * CR doesn't sink the batch. A failure of the single `approveTideRequests` call
 * (the enclave itself) DOES throw, since that is a batch-wide failure the caller
 * must surface.
 */
export async function runMultiAdminApprovalBatch(
  adminClient: KeycloakAdminClient,
  approveTideRequests: ApproveTideRequests,
  changeRequests: IgaChangeRequest[],
): Promise<BatchApprovalOutcome[]> {
  const changeRequestIds = changeRequests.map((cr) => cr.id);
  // id -> CR, so each enclave carrier can be tagged with its display names map.
  const crById = new Map(changeRequests.map((cr) => [cr.id, cr]));
  console.log("[TIDE-APPROVAL] runMultiAdminApprovalBatch: start", {
    batchSize: changeRequestIds.length,
    changeRequestIds,
  });

  const outcomes = new Map<string, BatchApprovalOutcome>();
  // Carriers that need the enclave, collected for ONE approveTideRequests call.
  // `names` is a best-effort display-only id->name map (never signed).
  const carriers: { id: string; request: Uint8Array; names?: CrNamesMap }[] =
    [];

  // ── Phase 1: POST /approve per CR; resolve inline-committed CRs now ────
  for (const changeRequestId of changeRequestIds) {
    let phase1: IgaApproveResult;
    try {
      phase1 = await adminClient.iga.approve({ id: changeRequestId });
    } catch (err) {
      outcomes.set(changeRequestId, {
        changeRequestId,
        kind: "error",
        error: err,
      });
      continue;
    }

    if (phase1.mode !== "needs-approval") {
      // firstAdmin/Tideless/simple (or already-signed): recorded inline and
      // auto-committed at quorum (`phase1.committed` reports whether it applied).
      outcomes.set(changeRequestId, {
        changeRequestId,
        kind: "recorded",
        result: phase1,
      });
      continue;
    }

    if (!phase1.requestModel) {
      outcomes.set(changeRequestId, {
        changeRequestId,
        kind: "error",
        error: new Error(
          "Server requested enclave approval but returned no requestModel carrier.",
        ),
      });
      continue;
    }

    // Best-effort id->name map so the enclave sign card shows names not UUIDs.
    // Display-only: a resolution failure must never break the signing batch.
    let names: CrNamesMap | undefined;
    try {
      const cr = crById.get(changeRequestId);
      names = cr ? crNamesMap(cr) : undefined;
    } catch {
      names = undefined;
    }

    carriers.push({
      id: changeRequestId,
      request: base64ToBytes(phase1.requestModel),
      ...(names ? { names } : {}),
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

    // ── Phase 2b: per-CR POST /approve of each returned approval (plain HTTP);
    //    records toward the threshold and auto-commits at quorum. No further
    //    enclave. ─
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
        const result = await adminClient.iga.approve({
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
