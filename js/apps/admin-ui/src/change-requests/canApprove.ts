/** TIDECLOAK IMPLEMENTATION */

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

export function canApprove(cr: IgaChangeRequest, userRoles: string[]): boolean {
  if (!cr.requiredApproverRoles?.length) return true;
  const set = new Set(userRoles);
  if (cr.scopeMode === "all") {
    return cr.requiredApproverRoles.every((r) => set.has(r));
  }
  // 'any' or unknown → 'any' fallback
  return cr.requiredApproverRoles.some((r) => set.has(r));
}

/** True when this user has already authorized (signed) the CR. */
export function hasSigned(cr: IgaChangeRequest, username: string): boolean {
  if (!username) return false;
  const authorizers = cr.authorizers ?? [];
  return authorizers.some((a) => a.username === username);
}

export const DEFAULT_BLOCKED_REASON =
  "Blocked: a prerequisite change request must be committed first";

/** The reason text to surface for a blocked CR (server-provided or default). */
export function blockedReasonOf(cr: Pick<IgaChangeRequest, "blockedReason">) {
  return cr.blockedReason || DEFAULT_BLOCKED_REASON;
}

/**
 * Whether a CR is eligible to be *authorized* by this user. This is the same
 * predicate the bulk Authorize selection uses. A `blocked` CR is never
 * authorizable from the UI. NOTE: this is advisory UX only — the backend
 * remains the source of truth and fail-closes blocked commits with 412
 * DEPENDENCY_NOT_MET.
 */
export function isAuthorizable(
  cr: IgaChangeRequest,
  userRoles: string[],
  username: string,
): boolean {
  return (
    cr.status === "PENDING" &&
    !cr.blocked &&
    canApprove(cr, userRoles) &&
    !hasSigned(cr, username)
  );
}

/**
 * Whether a CR is eligible to be *committed* by this user. This is the same
 * predicate the bulk Commit selection uses. A `blocked` CR is never
 * committable from the UI (advisory only — see {@link isAuthorizable}).
 */
export function isCommittable(
  cr: IgaChangeRequest,
  userRoles: string[],
): boolean {
  return (
    cr.status === "PENDING" &&
    !cr.blocked &&
    canApprove(cr, userRoles) &&
    cr.readyToCommit
  );
}

/**
 * Tooltip/disabled-reason for the row-level Authorize action. `null` means the
 * action is enabled (no tooltip). `blocked` takes precedence over every other
 * reason.
 */
export function authorizeTip(
  cr: IgaChangeRequest,
  userRoles: string[],
  username: string,
): string | null {
  if (cr.blocked) return blockedReasonOf(cr);
  if (!canApprove(cr, userRoles))
    return "You are not in the required approver role(s)";
  if (hasSigned(cr, username))
    return "You have already signed this change request";
  return null;
}

/**
 * Tooltip/disabled-reason for the row-level Commit action. `null` means the
 * action is enabled. `blocked` takes precedence over every other reason.
 */
export function commitTip(
  cr: IgaChangeRequest,
  userRoles: string[],
): string | null {
  if (cr.blocked) return blockedReasonOf(cr);
  if (!canApprove(cr, userRoles))
    return "You are not in the required approver role(s)";
  if (!cr.readyToCommit)
    return `Threshold not met (${cr.authCount}/${cr.threshold})`;
  return null;
}
