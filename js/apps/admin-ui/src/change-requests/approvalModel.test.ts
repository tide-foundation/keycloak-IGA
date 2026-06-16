/** TIDECLOAK IMPLEMENTATION */

import { describe, expect, it, vi } from "vitest";

import { base64ToBytes, bytesToBase64 } from "../utils/tideSerialization";
import {
  runMultiAdminApproval,
  type ApproveTideRequests,
} from "./approvalModel";

const CR_ID = "cr-42";

/** Distinct request / doken byte blobs so we can assert the round-trip. */
const REQUEST_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const DOKEN_BYTES = new Uint8Array([9, 8, 7, 6]);
const REQUEST_MODEL_B64 = bytesToBase64(REQUEST_BYTES);
const DOKEN_MODEL_B64 = bytesToBase64(DOKEN_BYTES);

/**
 * Minimal adminClient stub exposing just the unified `approve` method.
 *
 * `approve` is called up to twice: phase 1 (empty body) and, for multiAdmin,
 * phase 2 (signed doken body). `phase1`/`phase2` configure each response.
 */
function makeAdminClient(opts: {
  phase1: Record<string, unknown>;
  phase2?: Record<string, unknown>;
}) {
  const approve = vi
    .fn()
    .mockResolvedValueOnce(opts.phase1)
    .mockResolvedValueOnce(
      opts.phase2 ?? {
        mode: "recorded",
        changeRequestId: CR_ID,
        committed: true,
        authCount: 2,
        threshold: 2,
        crStatus: "APPROVED",
      },
    );
  return {
    client: { iga: { approve } } as any,
    approve,
  };
}

describe("runMultiAdminApproval", () => {
  it("firstAdmin/Tideless (mode recorded, single round-trip): returns recorded with committed", async () => {
    const { client, approve } = makeAdminClient({
      phase1: {
        mode: "recorded",
        changeRequestId: CR_ID,
        committed: true,
        authCount: 1,
        threshold: 1,
        crStatus: "APPROVED",
      },
    });
    const enclave = vi.fn() as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, enclave, CR_ID);

    expect(outcome.kind).toBe("recorded");
    if (outcome.kind === "recorded") {
      expect(outcome.result.committed).toBe(true);
    }
    // Single round-trip: only one /approve call, no enclave.
    expect(approve).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledWith({ id: CR_ID });
    expect(enclave).not.toHaveBeenCalled();
  });

  it("propagates an error from the phase-1 approve call", async () => {
    const approve = vi.fn().mockRejectedValueOnce(new Error("boom"));
    const client = { iga: { approve } } as any;
    const enclave = vi.fn() as unknown as ApproveTideRequests;

    await expect(runMultiAdminApproval(client, enclave, CR_ID)).rejects.toThrow(
      /boom/,
    );
    expect(enclave).not.toHaveBeenCalled();
  });

  it("multiAdmin: decodes requestModel, calls the enclave with bytes, re-encodes, and re-POSTs to /approve", async () => {
    const { client, approve } = makeAdminClient({
      phase1: {
        mode: "needs-approval",
        changeRequestId: CR_ID,
        actionType: "USER_ROLE_MAPPING_SET",
        requestModel: REQUEST_MODEL_B64,
        authCount: 1,
        threshold: 2,
      },
      phase2: {
        mode: "recorded",
        changeRequestId: CR_ID,
        committed: true,
        authCount: 2,
        threshold: 2,
        crStatus: "APPROVED",
      },
    });

    const enclave = vi
      .fn()
      .mockResolvedValue([
        { id: CR_ID, approved: { request: DOKEN_BYTES } },
      ]) as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, enclave, CR_ID);

    // Phase 1 called with the right CR, empty body.
    expect(approve).toHaveBeenNthCalledWith(1, { id: CR_ID });

    // Enclave received the *decoded bytes* of requestModel (not the Base64).
    const enclaveArg = (enclave as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(enclaveArg).toHaveLength(1);
    expect(enclaveArg[0].id).toBe(CR_ID);
    expect(Array.from(enclaveArg[0].request as Uint8Array)).toEqual(
      Array.from(REQUEST_BYTES),
    );

    // Phase 2 re-POSTed the Base64 of the doken bytes the enclave returned.
    expect(approve).toHaveBeenNthCalledWith(2, {
      id: CR_ID,
      requestModel: DOKEN_MODEL_B64,
    });
    // And the submitted value round-trips back to the doken bytes.
    expect(
      Array.from(base64ToBytes(approve.mock.calls[1][0].requestModel)),
    ).toEqual(Array.from(DOKEN_BYTES));

    expect(outcome.kind).toBe("recorded");
    if (outcome.kind === "recorded") {
      expect(outcome.result.committed).toBe(true);
      expect(outcome.result.authCount).toBe(2);
      expect(outcome.result.threshold).toBe(2);
    }
  });

  it("multiAdmin not-yet-at-threshold: recorded with committed=false (no commit)", async () => {
    const { client } = makeAdminClient({
      phase1: {
        mode: "needs-approval",
        changeRequestId: CR_ID,
        requestModel: REQUEST_MODEL_B64,
        authCount: 0,
        threshold: 2,
      },
      phase2: {
        mode: "recorded",
        changeRequestId: CR_ID,
        committed: false,
        authCount: 1,
        threshold: 2,
        crStatus: "PENDING",
      },
    });
    const enclave = vi
      .fn()
      .mockResolvedValue([
        { id: CR_ID, approved: { request: DOKEN_BYTES } },
      ]) as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, enclave, CR_ID);

    expect(outcome.kind).toBe("recorded");
    if (outcome.kind === "recorded") {
      expect(outcome.result.committed).toBe(false);
      expect(outcome.result.authCount).toBe(1);
    }
  });

  it("throws when needs-approval comes back without a requestModel carrier", async () => {
    const { client } = makeAdminClient({
      phase1: {
        mode: "needs-approval",
        changeRequestId: CR_ID,
        authCount: 0,
        threshold: 2,
      },
    });
    const enclave = vi.fn() as unknown as ApproveTideRequests;

    await expect(runMultiAdminApproval(client, enclave, CR_ID)).rejects.toThrow(
      /requestModel/i,
    );
    expect(enclave).not.toHaveBeenCalled();
  });

  it("returns denied (and does not re-POST) when the enclave denies", async () => {
    const { client, approve } = makeAdminClient({
      phase1: {
        mode: "needs-approval",
        changeRequestId: CR_ID,
        requestModel: REQUEST_MODEL_B64,
        authCount: 0,
        threshold: 2,
      },
    });
    const enclave = vi
      .fn()
      .mockResolvedValue([
        { id: CR_ID, denied: true },
      ]) as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, enclave, CR_ID);

    expect(outcome).toEqual({ kind: "denied" });
    // Only phase 1 ran; no phase-2 /approve.
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("returns pending (and does not re-POST) when the enclave is pending", async () => {
    const { client, approve } = makeAdminClient({
      phase1: {
        mode: "needs-approval",
        changeRequestId: CR_ID,
        requestModel: REQUEST_MODEL_B64,
        authCount: 0,
        threshold: 2,
      },
    });
    const enclave = vi
      .fn()
      .mockResolvedValue([
        { id: CR_ID, pending: true },
      ]) as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, enclave, CR_ID);

    expect(outcome).toEqual({ kind: "pending" });
    expect(approve).toHaveBeenCalledTimes(1);
  });

  it("throws when the enclave returns no result for the request", async () => {
    const { client } = makeAdminClient({
      phase1: {
        mode: "needs-approval",
        changeRequestId: CR_ID,
        requestModel: REQUEST_MODEL_B64,
        authCount: 0,
        threshold: 2,
      },
    });
    const enclave = vi
      .fn()
      .mockResolvedValue([]) as unknown as ApproveTideRequests;

    await expect(runMultiAdminApproval(client, enclave, CR_ID)).rejects.toThrow(
      /no approval result/i,
    );
  });
});
