/** TIDECLOAK IMPLEMENTATION */

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
