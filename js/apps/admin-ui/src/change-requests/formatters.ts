/** TIDECLOAK IMPLEMENTATION */

import type IgaChangeRequest from "@keycloak/keycloak-admin-client/lib/defs/igaChangeRequestRepresentation";

/**
 * Turn a raw enum-ish action type (e.g. "GRANT_ROLES") into a human label
 * ("Grant Roles"). Falls back to the raw string if it's unexpectedly empty.
 */
export function actionTypeLabel(t: string | undefined | null): string {
  if (!t) return "";
  return t
    .split(/[_\-\s]+/)
    .filter(Boolean)
    .map(
      (chunk) => chunk.charAt(0).toUpperCase() + chunk.slice(1).toLowerCase(),
    )
    .join(" ");
}

/**
 * Format an entity type token ("USER", "PROTOCOL_MAPPER", ...) as
 * "User" / "Protocol Mapper".
 */
export function entityTypeLabel(t: string | undefined | null): string {
  return actionTypeLabel(t);
}

/**
 * Format an epoch-millis timestamp using the browser's locale.
 * Mirrors the date helper used by src/utils/useFormatDate.ts.
 */
export function formatTime(
  epochMillis: number | null | undefined,
  locale?: string,
): string {
  if (!epochMillis || Number.isNaN(epochMillis)) return "";
  return new Date(epochMillis).toLocaleString(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

/**
 * Best-effort extraction of a human-readable string from anything that ends up
 * in a `catch` block. Handles:
 *  - plain strings
 *  - Keycloak `NetworkError` thrown by the admin-client SDK (whose
 *    `responseData` is the raw `{error, error_description}` body)
 *  - generic `Error` instances
 *  - bare `{error, error_description}` / `{errorMessage}` objects
 *
 * Critically, this NEVER returns an object — only strings. That guarantees the
 * result is safe to pass to React as a child or to i18n as an interpolation
 * value (avoids React error #31 "Objects are not valid as a React child").
 */
export function errorMessage(err: unknown): string {
  if (typeof err === "string") return err;
  if (err && typeof err === "object") {
    const e = err as Record<string, unknown> & {
      responseData?: unknown;
    };
    // Keycloak NetworkError: prefer the unwrapped response body fields.
    if (e.responseData && typeof e.responseData === "object") {
      const rd = e.responseData as Record<string, unknown>;
      if (typeof rd.error_description === "string") return rd.error_description;
      if (typeof rd.errorMessage === "string") return rd.errorMessage;
      if (typeof rd.error === "string") return rd.error;
    }
    if (typeof e.error_description === "string") return e.error_description;
    if (typeof e.errorMessage === "string") return e.errorMessage;
    if (typeof e.message === "string") return e.message;
    if (typeof e.error === "string") return e.error;
  }
  return "Unknown error";
}

/**
 * Render a coarse-grained relative time string ("just now", "5m ago", "2h ago",
 * "3d ago"). We deliberately avoid pulling in date-fns since the admin-ui's
 * existing date helpers (`useFormatDate`) only use Intl.DateTimeFormat.
 */
export function formatRelativeTime(
  epochMillis: number | null | undefined,
  now: number = Date.now(),
): string {
  if (!epochMillis || Number.isNaN(epochMillis)) return "";
  const diffMs = now - epochMillis;
  if (diffMs < 0) return "just now";
  const minutes = Math.floor(diffMs / 60000);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

/* ---------- humanReadableSummary helpers ---------- */

function safeParse(json: string): Record<string, unknown> | unknown[] | null {
  if (!json) return null;
  try {
    return JSON.parse(json);
  } catch {
    return null;
  }
}

/**
 * Pull the "first record" out of rowsJson. The backend serializes a
 * single-row change as either an array with one element or a bare object,
 * so accept both.
 */
function firstRow(parsed: unknown): Record<string, unknown> | null {
  if (Array.isArray(parsed)) {
    return parsed.length > 0 &&
      typeof parsed[0] === "object" &&
      parsed[0] !== null
      ? (parsed[0] as Record<string, unknown>)
      : null;
  }
  if (parsed && typeof parsed === "object") {
    return parsed as Record<string, unknown>;
  }
  return null;
}

/**
 * Try a list of field names against a row, returning the first string-ish value.
 * Case-insensitive — backends sometimes upper-case column names.
 */
function pick(
  row: Record<string, unknown> | null,
  ...candidates: string[]
): string | null {
  if (!row) return null;
  const lower: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) lower[k.toLowerCase()] = v;
  for (const c of candidates) {
    const v = lower[c.toLowerCase()];
    if (v === null || v === undefined) continue;
    if (
      typeof v === "string" ||
      typeof v === "number" ||
      typeof v === "boolean"
    ) {
      return String(v);
    }
  }
  return null;
}

/** Display a name OR fall back to "(id: <id>)" if we only have an id. */
function nameOrId(
  name: string | null | undefined,
  id: string | null | undefined,
): string {
  if (name) return `\`${name}\``;
  if (id) return `(id: ${id})`;
  return "(unknown)";
}

/**
 * Convert a CR into a single-line human-readable description of what the change
 * will do once committed. This is a best-effort first cut: it parses rowsJson
 * defensively but does NOT issue extra round-trips to resolve ids to display
 * names. If only an id is present we render it inline.
 *
 * Returns a Markdown-ish string with backticks around values; callers are
 * expected to render it as plain text or to apply minimal formatting.
 */
export function humanReadableSummary(cr: IgaChangeRequest): string {
  const row = firstRow(safeParse(cr.rowsJson));
  const action = (cr.actionType || "").toUpperCase();

  const username = pick(row, "username", "USERNAME", "user_name", "userName");
  const userId = pick(row, "user_id", "USER_ID", "userId");
  const userLbl = nameOrId(username, userId);

  const roleName = pick(row, "name", "role_name", "ROLE_NAME", "roleName");
  const roleId = pick(row, "role_id", "ROLE_ID", "roleId");
  const roleLbl = nameOrId(roleName, roleId);

  const groupName = pick(row, "name", "group_name", "GROUP_NAME", "groupName");
  const groupId = pick(row, "group_id", "GROUP_ID", "groupId");
  const groupLbl = nameOrId(groupName, groupId);

  const clientId = pick(row, "client_id", "CLIENT_ID", "clientId", "clientid");
  const clientLbl = nameOrId(clientId, pick(row, "id", "ID"));

  const scopeName = pick(row, "name", "scope_name", "SCOPE_NAME");
  const scopeId = pick(row, "client_scope_id", "CLIENT_SCOPE_ID", "scopeId");
  const scopeLbl = nameOrId(scopeName, scopeId);

  const mapperName = pick(row, "name", "mapper_name");
  const mapperLbl = nameOrId(mapperName, pick(row, "id", "ID"));

  const realmName = pick(row, "realm", "realm_name", "name");
  const key = pick(row, "key", "KEY", "attribute_name", "name");
  const value = pick(row, "value", "VALUE");

  switch (action) {
    case "GRANT_ROLES":
      return `Grant role ${roleLbl} to user ${userLbl}`;
    case "REVOKE_ROLES":
      return `Revoke role ${roleLbl} from user ${userLbl}`;
    case "JOIN_GROUPS":
      return `Add user ${userLbl} to group ${groupLbl}`;
    case "LEAVE_GROUPS":
      return `Remove user ${userLbl} from group ${groupLbl}`;
    case "GROUP_GRANT_ROLES":
      return `Grant role ${roleLbl} to group ${groupLbl}`;
    case "GROUP_REVOKE_ROLES":
      return `Revoke role ${roleLbl} from group ${groupLbl}`;
    case "ADD_COMPOSITE": {
      const parent = pick(row, "parent_role_name", "parent_role_id", "parent");
      const child = pick(row, "child_role_name", "child_role_id", "child");
      return `Add ${nameOrId(child, null)} as a child of ${nameOrId(parent, null)}`;
    }
    case "REMOVE_COMPOSITE": {
      const parent = pick(row, "parent_role_name", "parent_role_id", "parent");
      const child = pick(row, "child_role_name", "child_role_id", "child");
      return `Remove ${nameOrId(child, null)} as a child of ${nameOrId(parent, null)}`;
    }
    case "ASSIGN_SCOPE":
      return `Assign client scope ${scopeLbl} to client ${clientLbl}`;
    case "REMOVE_SCOPE":
      return `Remove client scope ${scopeLbl} from client ${clientLbl}`;
    case "ADD_PROTOCOL_MAPPER":
      return `Add protocol mapper ${mapperLbl} to ${clientLbl || scopeLbl}`;
    case "UPDATE_PROTOCOL_MAPPER":
      return `Update protocol mapper ${mapperLbl} on ${clientLbl || scopeLbl}`;
    case "REMOVE_PROTOCOL_MAPPER":
      return `Remove protocol mapper ${mapperLbl} from ${clientLbl || scopeLbl}`;
    case "SCOPE_ADD_ROLE":
      return `Add role ${roleLbl} to client scope ${scopeLbl}`;
    case "SCOPE_REMOVE_ROLE":
      return `Remove role ${roleLbl} from client scope ${scopeLbl}`;
    case "CREATE_USER":
      return `Create user ${userLbl}`;
    case "CREATE_ROLE":
      return `Create role ${roleLbl}`;
    case "CREATE_GROUP":
      return `Create group ${groupLbl}`;
    case "CREATE_CLIENT":
      return `Create client ${clientLbl}`;
    case "CREATE_CLIENT_SCOPE":
      return `Create client scope ${scopeLbl}`;
    case "SET_REALM_CONFIG":
      return value !== null
        ? `Change realm setting \`${key ?? "?"}\` to \`${value}\``
        : `Change realm setting \`${key ?? "?"}\``;
    case "SET_USER_ATTRIBUTE":
      return `Set attribute \`${key ?? "?"}\` on user ${userLbl} to \`${value ?? ""}\``;
    case "REMOVE_USER_ATTRIBUTE":
      return `Remove attribute \`${key ?? "?"}\` from user ${userLbl}`;
    case "SET_GROUP_ATTRIBUTE":
      return `Set attribute \`${key ?? "?"}\` on group ${groupLbl} to \`${value ?? ""}\``;
    case "REMOVE_GROUP_ATTRIBUTE":
      return `Remove attribute \`${key ?? "?"}\` from group ${groupLbl}`;
    case "SET_CLIENT_ATTRIBUTE":
      return `Set attribute \`${key ?? "?"}\` on client ${clientLbl} to \`${value ?? ""}\``;
    case "REMOVE_CLIENT_ATTRIBUTE":
      return `Remove attribute \`${key ?? "?"}\` from client ${clientLbl}`;
    case "SET_REALM_ATTRIBUTE":
      return `Set attribute \`${key ?? "?"}\` on realm ${nameOrId(realmName, null)} to \`${value ?? ""}\``;
    case "REMOVE_REALM_ATTRIBUTE":
      return `Remove attribute \`${key ?? "?"}\` from realm ${nameOrId(realmName, null)}`;
    case "UPDATE_CLIENT_WEB_ORIGINS":
      return `Update web origins for client ${clientLbl}`;
    case "UPDATE_CLIENT_REDIRECT_URIS":
      return `Update redirect URIs for client ${clientLbl}`;
    case "ADD_REALM_DEFAULT_GROUP":
      return `Add ${groupLbl} as a default group`;
    case "REMOVE_REALM_DEFAULT_GROUP":
      return `Remove ${groupLbl} as a default group`;
    case "BASELINE_APPROVAL":
      return `Baseline approval for realm ${nameOrId(realmName, null)}`;
    case "REQUEST_SERVER_CERT":
      return `Request a server certificate`;
    case "INSTALL_LICENSE":
      return `Install license`;
    case "ROTATE_LICENSE":
      return `Rotate license`;
    default: {
      const entity = entityTypeLabel(cr.entityType);
      const tail = cr.entityId ? ` ${cr.entityId}` : "";
      return `${actionTypeLabel(cr.actionType)}${entity ? ` on ${entity}` : ""}${tail}`;
    }
  }
}
