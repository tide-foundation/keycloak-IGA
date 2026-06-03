/** TIDECLOAK IMPLEMENTATION */

import { describe, expect, it } from "vitest";

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

import {
  DEFAULT_BLOCKED_REASON,
  authorizeTip,
  blockedReasonOf,
  canApprove,
  commitTip,
  hasSigned,
  isAuthorizable,
  isCommittable,
} from "./canApprove";

const USER = "alice";
const ROLE = "tide-realm-admin";

/** Build a PENDING CR that this user can approve and is ready to commit. */
function makeCr(overrides: Partial<IgaChangeRequest> = {}): IgaChangeRequest {
  return {
    id: "cr-1",
    status: "PENDING",
    requiredApproverRoles: [ROLE],
    scopeMode: "any",
    authorizers: [],
    readyToCommit: true,
    authCount: 1,
    threshold: 1,
    denyReason: null,
    ...overrides,
  } as unknown as IgaChangeRequest;
}

describe("blockedReasonOf", () => {
  it("returns the server-provided reason when present", () => {
    expect(blockedReasonOf({ blockedReason: "waiting on CR-7" })).toBe(
      "waiting on CR-7",
    );
  });

  it("falls back to the default reason when absent or empty", () => {
    expect(blockedReasonOf({ blockedReason: undefined })).toBe(
      DEFAULT_BLOCKED_REASON,
    );
    expect(blockedReasonOf({ blockedReason: "" })).toBe(DEFAULT_BLOCKED_REASON);
  });

  it("default reason is plain text (no HTML markup)", () => {
    // Guards against accidentally introducing markup that a tooltip might
    // render unescaped. The value is passed to PatternFly Tooltip `content`
    // which renders strings as escaped text children, but keep the source
    // string clean regardless.
    expect(DEFAULT_BLOCKED_REASON).not.toMatch(/[<>]/);
  });
});

describe("isAuthorizable / bulk Authorize selection", () => {
  it("is true for a pending, approvable, unsigned, unblocked CR", () => {
    expect(isAuthorizable(makeCr(), [ROLE], USER)).toBe(true);
  });

  it("is false when the CR is blocked (excluded from bulk Authorize)", () => {
    expect(isAuthorizable(makeCr({ blocked: true }), [ROLE], USER)).toBe(false);
  });

  it("is false when the user lacks the approver role", () => {
    expect(isAuthorizable(makeCr(), [], USER)).toBe(false);
  });

  it("is false when the user has already signed", () => {
    const cr = makeCr({ authorizers: [{ username: USER } as never] });
    expect(isAuthorizable(cr, [ROLE], USER)).toBe(false);
  });

  it("is false when the CR is not pending", () => {
    expect(isAuthorizable(makeCr({ status: "COMMITTED" }), [ROLE], USER)).toBe(
      false,
    );
  });
});

describe("isCommittable / bulk Commit selection", () => {
  it("is true for a pending, approvable, ready, unblocked CR", () => {
    expect(isCommittable(makeCr(), [ROLE])).toBe(true);
  });

  it("is false when the CR is blocked (excluded from bulk Commit)", () => {
    expect(isCommittable(makeCr({ blocked: true }), [ROLE])).toBe(false);
  });

  it("is false when not ready to commit", () => {
    expect(isCommittable(makeCr({ readyToCommit: false }), [ROLE])).toBe(false);
  });

  it("is false when the user lacks the approver role", () => {
    expect(isCommittable(makeCr(), [])).toBe(false);
  });
});

describe("authorizeTip / row Authorize action", () => {
  it("returns null (enabled, no tooltip) when authorizable", () => {
    expect(authorizeTip(makeCr(), [ROLE], USER)).toBeNull();
  });

  it("returns the blocked reason when blocked, taking precedence", () => {
    // Blocked + also-not-approver: blocked wins.
    const cr = makeCr({ blocked: true, blockedReason: "prereq CR-3 pending" });
    expect(authorizeTip(cr, [], USER)).toBe("prereq CR-3 pending");
  });

  it("uses the default blocked reason when none is provided", () => {
    expect(authorizeTip(makeCr({ blocked: true }), [ROLE], USER)).toBe(
      DEFAULT_BLOCKED_REASON,
    );
  });

  it("returns the role reason when not approver (and not blocked)", () => {
    expect(authorizeTip(makeCr(), [], USER)).toBe(
      "You are not in the required approver role(s)",
    );
  });

  it("returns the already-signed reason when applicable", () => {
    const cr = makeCr({ authorizers: [{ username: USER } as never] });
    expect(authorizeTip(cr, [ROLE], USER)).toBe(
      "You have already signed this change request",
    );
  });
});

describe("commitTip / row Commit action", () => {
  it("returns null (enabled) when committable", () => {
    expect(commitTip(makeCr(), [ROLE])).toBeNull();
  });

  it("returns the blocked reason when blocked, taking precedence", () => {
    const cr = makeCr({
      blocked: true,
      blockedReason: "prereq CR-3 pending",
      readyToCommit: false,
    });
    expect(commitTip(cr, [ROLE])).toBe("prereq CR-3 pending");
  });

  it("returns the threshold reason when not ready (and not blocked)", () => {
    const cr = makeCr({ readyToCommit: false, authCount: 1, threshold: 2 });
    expect(commitTip(cr, [ROLE])).toBe("Threshold not met (1/2)");
  });

  it("returns the role reason when not approver", () => {
    expect(commitTip(makeCr(), [])).toBe(
      "You are not in the required approver role(s)",
    );
  });
});

describe("hasSigned", () => {
  it("is false for an empty username", () => {
    expect(
      hasSigned(makeCr({ authorizers: [{ username: USER } as never] }), ""),
    ).toBe(false);
  });

  it("is true when the user is among the authorizers", () => {
    const cr = makeCr({ authorizers: [{ username: USER } as never] });
    expect(hasSigned(cr, USER)).toBe(true);
  });
});

describe("canApprove (regression)", () => {
  it("any-mode requires at least one matching role", () => {
    expect(canApprove(makeCr({ scopeMode: "any" }), [ROLE])).toBe(true);
    expect(canApprove(makeCr({ scopeMode: "any" }), ["other"])).toBe(false);
  });

  it("all-mode requires every role", () => {
    const cr = makeCr({ scopeMode: "all", requiredApproverRoles: ["a", "b"] });
    expect(canApprove(cr, ["a", "b"])).toBe(true);
    expect(canApprove(cr, ["a"])).toBe(false);
  });
});
