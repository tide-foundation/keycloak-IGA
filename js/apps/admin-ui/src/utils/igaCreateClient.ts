// TIDECLOAK IMPLEMENTATION
// Phase 1 (frontend) of the endpoint redesign: when IGA is enabled for the
// active (non-master) realm, client creation must POST the full
// `ClientRepresentation` to the IGA capture endpoint instead of Keycloak's
// native `/clients`. When IGA is off or the realm is master, behaviour is
// unchanged (native create).
//
// Both branches return the same shape the create call sites already handle:
// the native path returns `{ id }`, the capture path returns a
// `PendingChangeRequest` envelope (HTTP 202, detected centrally by the SDK
// Agent). The existing `notifyIfPendingChangeRequest` flow consumes the
// result verbatim and is therefore unchanged.

import type KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type ClientRepresentation from "@keycloak/keycloak-admin-client/lib/defs/clientRepresentation";

/**
 * Create a client, routing through the IGA capture endpoint when IGA is
 * enabled. `isIgaEnabled` must come from the existing `useIsIgaEnabled()`
 * hook, which already returns false for the master realm / IGA-off (so
 * there is no double-capture and no behaviour change there).
 */
export function createClientIgaAware(
  adminClient: KeycloakAdminClient,
  isIgaEnabled: boolean,
  rep: ClientRepresentation,
) {
  if (isIgaEnabled) {
    return adminClient.iga.captureCreateClient(rep);
  }
  return adminClient.clients.create(rep);
}
