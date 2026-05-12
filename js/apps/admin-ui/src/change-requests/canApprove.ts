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
