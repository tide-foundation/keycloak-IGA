/** TIDECLOAK IMPLEMENTATION */

// `whoAmI` exposes `displayName` and `userId` but not the canonical
// `username` that the IGA backend records in `authorizers[].username`.
// We resolve the username by re-fetching the user record (the same pattern
// utils/useCurrentUser.ts uses).

import { useFetch } from "@keycloak/keycloak-ui-shared";
import { useState } from "react";
import { useAdminClient } from "../admin-client";
import { useWhoAmI } from "../context/whoami/WhoAmI";

/**
 * Returns the currently signed-in user's `username` (matches the value the
 * backend stores in `IgaCrAuthorizerRepresentation.username`). Empty string
 * while loading or on error.
 */
export function useCurrentUsername(): string {
  const { adminClient } = useAdminClient();
  const { whoAmI } = useWhoAmI();
  const [username, setUsername] = useState<string>("");

  useFetch(
    () => adminClient.users.findOne({ id: whoAmI.userId }),
    (user) => {
      setUsername(typeof user?.username === "string" ? user.username : "");
    },
    [whoAmI.userId],
  );

  return username;
}
