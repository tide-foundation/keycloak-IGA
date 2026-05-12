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
