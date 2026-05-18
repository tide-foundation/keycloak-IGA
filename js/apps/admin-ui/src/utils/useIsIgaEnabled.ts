/** TIDECLOAK IMPLEMENTATION */

import { useRealm } from "../context/realm-context/RealmContext";

/**
 * Returns true when IGA is active for the currently-selected realm.
 *
 * Reads the `isIGAEnabled` realm attribute (case-sensitive, as set by
 * `TideAdminCompatResource` when admins toggle IGA via the legacy UI).
 * The master realm bypasses IGA entirely per backend logic, so the
 * hook always returns false there.
 */
export function useIsIgaEnabled(): boolean {
  const { realm: realmName, realmRepresentation } = useRealm();
  if (!realmRepresentation) return false;
  if (realmName === "master") return false;
  const attrs = realmRepresentation.attributes ?? {};
  return attrs["isIGAEnabled"] === "true";
}
