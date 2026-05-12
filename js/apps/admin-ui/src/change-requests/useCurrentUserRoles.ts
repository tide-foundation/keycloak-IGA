/** TIDECLOAK IMPLEMENTATION */

// Pattern mirrors src/utils/useCurrentUser.ts (uses useWhoAmI + useFetch +
// adminClient.users) to read the logged-in user's role mappings.

import { useFetch } from "@keycloak/keycloak-ui-shared";
import { useState } from "react";
import { useAdminClient } from "../admin-client";
import { useWhoAmI } from "../context/whoami/WhoAmI";

/**
 * Returns a flat list of role names assigned to the currently signed-in user.
 * Unions realm roles + every client's role names (deduped). Empty array while
 * loading or on error.
 */
export function useCurrentUserRoles(): string[] {
  const { adminClient } = useAdminClient();
  const { whoAmI } = useWhoAmI();
  const [roles, setRoles] = useState<string[]>([]);

  useFetch(
    () => adminClient.users.listRoleMappings({ id: whoAmI.userId }),
    (mapping) => {
      const realmRoleNames = (mapping?.realmMappings ?? [])
        .map((r) => r.name)
        .filter((n): n is string => typeof n === "string");

      const clientRoleNames: string[] = [];
      const clientMappings = mapping?.clientMappings ?? {};
      for (const key of Object.keys(clientMappings)) {
        const mappings = (clientMappings as Record<string, any>)[key]?.mappings;
        if (Array.isArray(mappings)) {
          for (const r of mappings) {
            if (typeof r?.name === "string") clientRoleNames.push(r.name);
          }
        }
      }

      setRoles(Array.from(new Set([...realmRoleNames, ...clientRoleNames])));
    },
    [whoAmI.userId],
  );

  return roles;
}
