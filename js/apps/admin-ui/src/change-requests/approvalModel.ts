/** TIDECLOAK IMPLEMENTATION */
//
// multiAdmin / firstAdmin change-request approval over the UNIFIED `/approve`
// endpoint.
//
// The Approvals inbox calls ONE endpoint — `POST /iga/change-requests/{id}/approve`
// — and the SERVER decides which ceremony applies (it knows the attestor and
// the firstAdmin/multiAdmin mode). The client no longer probes
// `/approval-model` then 409-falls-back to the legacy `authorize`+`commit`
// lane. Crucially, the legacy `POST .../commit` is REFUSED for multiAdmin CRs
// (iga-core: MULTIADMIN_REQUIRES_APPROVAL_ENCLAVE) — `/approve` collects the
// doken and AUTO-COMMITS at quorum, so there is no separate commit step.
//
//   firstAdmin / Tideless / simple attestor (single round-trip):
//     POST /approve  (empty body)
//        -> { mode: "recorded", committed, authCount, threshold, crStatus }
//     The server records the authorization inline and, if the threshold is met,
//     runs the full commit pipeline. `committed` is authoritative.
//
//   multiAdmin (two-phase, SAME endpoint):
//     1. POST /approve  (empty body)
//          -> { mode: "needs-approval", requestModel }   (requestModel = Base64)
//     2. Base64-decode requestModel -> bytes; hand to the Heimdall enclave via
//        approveTideRequests([{ id, request: bytes }]); the enclave returns the
//        doken+approval-embedded request bytes.
//     3. POST /approve  (body { requestModel: <Base64 doken> })
//          -> { mode: "recorded", committed, authCount, threshold, crStatus }.
//        At quorum the server auto-commits; `committed` reflects that.
//
// This keeps the dual-mode branch UI-only, routed entirely through `/approve`.

import type KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";
import type { IgaApproveResult } from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

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
   * The authorization was recorded by the unified `/approve` endpoint. For a
   * firstAdmin/Tideless/simple CR this is a single round-trip; for a multiAdmin
   * CR this is phase 2 (after the enclave sign). `committed` is the server's
   * authoritative flag: `true` means the threshold was met and the change was
   * auto-committed inline — there is NO separate legacy `/commit` step. When
   * `false` the approval counted toward the threshold but more approvers are
   * still required.
   */
  | { kind: "recorded"; result: IgaApproveResult }
  /** The operator denied the request in the enclave popup. */
  | { kind: "denied" }
  /** The enclave returned pending (e.g. awaiting more operators). */
  | { kind: "pending" };

/**
 * Run the unified `/approve` flow for a single CR.
 *
 * One endpoint, server-decided ceremony: firstAdmin/Tideless realms get a
 * single inline record+commit round-trip; multiAdmin realms get the two-phase
 * enclave ceremony (phase 1 returns the carrier, phase 2 submits the signed
 * doken and auto-commits at quorum). The legacy `authorize`/`commit`/
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
  // ── Phase 1: POST /approve with no body. ──────────────────────────────
  //
  // The server returns mode "recorded" for firstAdmin/Tideless/simple CRs
  // (it recorded + auto-committed inline), or mode "needs-approval" carrying
  // the Policy:1 enclave carrier for multiAdmin CRs.
  console.log("[TIDE-APPROVAL] runMultiAdminApproval: start", {
    changeRequestId,
  });
  const phase1 = await adminClient.iga.approve({ id: changeRequestId });
  console.log("[TIDE-APPROVAL] POST /approve (phase 1) result", {
    changeRequestId,
    mode: phase1.mode,
    committed: phase1.committed,
    requestModelLength:
      typeof phase1.requestModel === "string"
        ? phase1.requestModel.length
        : null,
  });

  // firstAdmin / Tideless / simple, OR a multiAdmin CR the server resolved
  // without an enclave round-trip: the unified endpoint already recorded (and,
  // when committed===true, auto-committed) the change.
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

  // ── Phase 2b: POST /approve with the signed doken; server auto-commits ─
  const requestModel = bytesToBase64(approval.approved.request);
  const result = await adminClient.iga.approve({
    id: changeRequestId,
    requestModel,
  });
  console.log("[TIDE-APPROVAL] POST /approve (phase 2) result", {
    changeRequestId,
    mode: result.mode,
    committed: result.committed,
    authCount: result.authCount,
    threshold: result.threshold,
  });

  return { kind: "recorded", result };
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
 * Bulk approval over the unified `/approve` endpoint that opens the Heimdall
 * enclave **exactly once** for the whole batch.
 *
 * The per-CR {@link runMultiAdminApproval} opens the enclave once per CR (N
 * pop-ups / N round-trips). The enclave's `approve()` accepts an ARRAY of
 * `{ id, request }` carriers and signs them all in a single popup interaction
 * (one doken, one open), returning an array of approvals keyed by id. This
 * helper exploits that:
 *
 *   1. Phase 1 — POST `/approve` (empty body) for every CR. firstAdmin/Tideless/
 *      simple CRs come back `mode: "recorded"` (recorded + auto-committed inline,
 *      no enclave); they never add a carrier to the batch. multiAdmin CRs come
 *      back `mode: "needs-approval"` carrying the Policy:1 carrier, which we
 *      decode and collect into ONE array.
 *   2. Phase 2a — call `approveTideRequests(allCarriers)` ONCE. One enclave
 *      pop-up; the admin authorizes once; the enclave signs all N carriers and
 *      returns N approvals, each tagged with its CR id.
 *   3. Phase 2b — for each approved carrier, POST its own doken-embedded model
 *      back to `/approve` (per-CR; the server auto-commits at quorum). This is
 *      plain HTTP — no further enclave interaction.
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
      // firstAdmin/Tideless/simple (or already-resolved): recorded inline.
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
    //    the server auto-commits at quorum. No further enclave interaction. ─
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
