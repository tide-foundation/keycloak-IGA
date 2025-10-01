
import KeycloakAdminClient from "@keycloak/keycloak-admin-client";

/** Low-level GET using the admin client's token */
async function kcGet(adminClient: KeycloakAdminClient, path: string) {
  const base = (adminClient as any).baseUrl || "";
  const token = await (adminClient as any).getAccessToken?.();
  const res = await fetch(`${base}${path}`, {
    method: "GET",
    headers: {
      "Accept": "application/json",
      "Authorization": token ? `Bearer ${token}` : ""
    }
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`GET ${path} failed: ${res.status} ${res.statusText} - ${text}`);
  }
  return res.json();
}

/** Fetch list of change-set requests for a given scope segment used by backend (users|roles|groups|clients|client-scopes|realm) */
export async function fetchChangeRequests(adminClient: KeycloakAdminClient, realm: string, scope: string) {
  const r = encodeURIComponent(realm);
  return kcGet(adminClient, `/admin/realms/${r}/tide-admin/change-set/${scope}/requests`);
}

/** Convenience: filter requests matching a given userId/clientId/roleName or roleId embedded in the draft JSON. */
export function matchUserRoleRequest(row: any, { userId, clientId, roleName, roleId } : { userId?: string; clientId?: string; roleName?: string; roleId?: string; }) {
  try {
    const draftStr: string = row?.draft || "{}";
    const draft = JSON.parse((/^\s*[\{\[]/.test(draftStr) ? draftStr : atob(draftStr)));
    const okUser = !userId || draft.userId === userId || (draft._replayPath && draft._replayPath.includes(`/users/${userId}/`)) || (row.affectedUsers && row.affectedUsers.includes(userId));
    const okClient = !clientId || draft.clientId === clientId || (draft._replayPath && draft._replayPath.includes(`/clients/${clientId}`));
    let okRole = true;
    if (roleId || roleName) {
      okRole = false;
      const rolesArr = draft.roles || [];
      for (const r of rolesArr) {
        if (typeof r === "string" && (r === roleName)) okRole = true;
        else if (typeof r === "object" && ((roleId && r.id === roleId) || (roleName && r.name === roleName))) okRole = true;
      }
    }
    return okUser && okClient && okRole;
  } catch {
    return false;
  }
}
