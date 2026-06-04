/** TIDECLOAK IMPLEMENTATION */

import { NetworkError } from "@keycloak/keycloak-admin-client";
import { describe, expect, it, vi } from "vitest";

import { base64ToBytes, bytesToBase64 } from "../utils/tideSerialization";
import {
  runMultiAdminApproval,
  type ApproveTideRequests,
} from "./approvalModel";

const CR_ID = "cr-42";

/** Build a NetworkError as the admin-client throws it on a non-OK response. */
function networkError(status: number, responseData: unknown): NetworkError {
  return new NetworkError("request failed", {
    response: { status } as Response,
    responseData,
  });
}

/** Distinct request / doken byte blobs so we can assert the round-trip. */
const REQUEST_BYTES = new Uint8Array([1, 2, 3, 4, 5]);
const DOKEN_BYTES = new Uint8Array([9, 8, 7, 6]);
const REQUEST_MODEL_B64 = bytesToBase64(REQUEST_BYTES);
const DOKEN_MODEL_B64 = bytesToBase64(DOKEN_BYTES);

/** Minimal adminClient stub exposing just the two iga methods we touch. */
function makeAdminClient(opts: {
  approvalModel: {
    requiresApprovalPopup: boolean;
    requestModel?: string;
  };
  submitResult?: {
    recorded: boolean;
    authCount: number;
    threshold: number;
    readyForCommit: boolean;
  };
}) {
  const getApprovalModel = vi.fn().mockResolvedValue({
    changeRequestId: CR_ID,
    actionType: "USER_ROLE_MAPPING_SET",
    requiresApprovalPopup: opts.approvalModel.requiresApprovalPopup,
    requestModel: opts.approvalModel.requestModel ?? REQUEST_MODEL_B64,
  });
  const submitApprovalModel = vi.fn().mockResolvedValue(
    opts.submitResult ?? {
      recorded: true,
      authCount: 1,
      threshold: 2,
      readyForCommit: false,
    },
  );
  const authorize = vi.fn().mockResolvedValue({});
  const commit = vi.fn().mockResolvedValue({});
  return {
    client: {
      iga: { getApprovalModel, submitApprovalModel, authorize, commit },
    } as any,
    getApprovalModel,
    submitApprovalModel,
    authorize,
    commit,
  };
}

describe("runMultiAdminApproval", () => {
  it("firstAdmin (409 NOT_MULTI_ADMIN): runs authorize+commit and returns committed", async () => {
    const { client, getApprovalModel, authorize, commit, submitApprovalModel } =
      makeAdminClient({ approvalModel: { requiresApprovalPopup: true } });
    // firstAdmin / Tideless realm refuses the two-phase probe.
    getApprovalModel.mockRejectedValueOnce(
      networkError(409, {
        error: "NOT_MULTI_ADMIN",
        message: "use the single-phase authorize/commit flow",
      }),
    );
    const approve = vi.fn() as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, approve, CR_ID);

    expect(outcome).toEqual({ kind: "committed" });
    // Single-phase: authorize then commit, never the enclave or phase-2 submit.
    expect(authorize).toHaveBeenCalledWith({ id: CR_ID });
    expect(commit).toHaveBeenCalledWith({ id: CR_ID });
    expect(approve).not.toHaveBeenCalled();
    expect(submitApprovalModel).not.toHaveBeenCalled();
  });

  it("propagates a non-NOT_MULTI_ADMIN error from the approval-model probe", async () => {
    const { client, getApprovalModel, authorize, commit } = makeAdminClient({
      approvalModel: { requiresApprovalPopup: true },
    });
    // A real failure (e.g. 403) must NOT be swallowed as single-phase.
    getApprovalModel.mockRejectedValueOnce(
      networkError(403, { error: "forbidden" }),
    );
    const approve = vi.fn() as unknown as ApproveTideRequests;

    await expect(
      runMultiAdminApproval(client, approve, CR_ID),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(authorize).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("a non-NOT_MULTI_ADMIN 409 still propagates (not treated as single-phase)", async () => {
    const { client, getApprovalModel, authorize, commit } = makeAdminClient({
      approvalModel: { requiresApprovalPopup: true },
    });
    getApprovalModel.mockRejectedValueOnce(
      networkError(409, { error: "Change request is not in PENDING state" }),
    );
    const approve = vi.fn() as unknown as ApproveTideRequests;

    await expect(
      runMultiAdminApproval(client, approve, CR_ID),
    ).rejects.toBeInstanceOf(NetworkError);
    expect(authorize).not.toHaveBeenCalled();
    expect(commit).not.toHaveBeenCalled();
  });

  it("returns committed when the server answers the probe with requiresApprovalPopup=false", async () => {
    const { client, authorize, commit, submitApprovalModel } = makeAdminClient({
      approvalModel: { requiresApprovalPopup: false },
    });
    const approve = vi.fn() as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, approve, CR_ID);

    expect(outcome).toEqual({ kind: "committed" });
    expect(authorize).toHaveBeenCalledWith({ id: CR_ID });
    expect(commit).toHaveBeenCalledWith({ id: CR_ID });
    expect(approve).not.toHaveBeenCalled();
    expect(submitApprovalModel).not.toHaveBeenCalled();
  });

  it("decodes requestModel, calls the enclave with bytes, re-encodes, and submits", async () => {
    const { client, getApprovalModel, submitApprovalModel } = makeAdminClient({
      approvalModel: { requiresApprovalPopup: true },
      submitResult: {
        recorded: true,
        authCount: 2,
        threshold: 2,
        readyForCommit: true,
      },
    });

    const approve = vi
      .fn()
      .mockResolvedValue([
        { id: CR_ID, approved: { request: DOKEN_BYTES } },
      ]) as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, approve, CR_ID);

    // Phase 1 fetched for the right CR.
    expect(getApprovalModel).toHaveBeenCalledWith({ id: CR_ID });

    // Enclave received the *decoded bytes* of requestModel (not the Base64).
    const approveArg = (approve as unknown as ReturnType<typeof vi.fn>).mock
      .calls[0][0];
    expect(approveArg).toHaveLength(1);
    expect(approveArg[0].id).toBe(CR_ID);
    expect(Array.from(approveArg[0].request as Uint8Array)).toEqual(
      Array.from(REQUEST_BYTES),
    );

    // Phase 2 submitted the Base64 of the doken bytes the enclave returned.
    expect(submitApprovalModel).toHaveBeenCalledWith({
      id: CR_ID,
      requestModel: DOKEN_MODEL_B64,
    });
    // And the submitted value round-trips back to the doken bytes.
    expect(
      Array.from(
        base64ToBytes(submitApprovalModel.mock.calls[0][0].requestModel),
      ),
    ).toEqual(Array.from(DOKEN_BYTES));

    expect(outcome).toEqual({
      kind: "recorded",
      result: {
        recorded: true,
        authCount: 2,
        threshold: 2,
        readyForCommit: true,
      },
    });
  });

  it("returns denied (and does not submit) when the enclave denies", async () => {
    const { client, submitApprovalModel } = makeAdminClient({
      approvalModel: { requiresApprovalPopup: true },
    });
    const approve = vi
      .fn()
      .mockResolvedValue([
        { id: CR_ID, denied: true },
      ]) as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, approve, CR_ID);

    expect(outcome).toEqual({ kind: "denied" });
    expect(submitApprovalModel).not.toHaveBeenCalled();
  });

  it("returns pending (and does not submit) when the enclave is pending", async () => {
    const { client, submitApprovalModel } = makeAdminClient({
      approvalModel: { requiresApprovalPopup: true },
    });
    const approve = vi
      .fn()
      .mockResolvedValue([
        { id: CR_ID, pending: true },
      ]) as unknown as ApproveTideRequests;

    const outcome = await runMultiAdminApproval(client, approve, CR_ID);

    expect(outcome).toEqual({ kind: "pending" });
    expect(submitApprovalModel).not.toHaveBeenCalled();
  });

  it("throws when the enclave returns no result for the request", async () => {
    const { client } = makeAdminClient({
      approvalModel: { requiresApprovalPopup: true },
    });
    const approve = vi
      .fn()
      .mockResolvedValue([]) as unknown as ApproveTideRequests;

    await expect(runMultiAdminApproval(client, approve, CR_ID)).rejects.toThrow(
      /no approval result/i,
    );
  });
});
