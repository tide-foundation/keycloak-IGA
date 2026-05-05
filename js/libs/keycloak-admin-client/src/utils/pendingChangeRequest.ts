// TIDECLOAK IMPLEMENTATION
// When the backend intercepts an entity-create call for IGA approval, it
// responds with HTTP 202 + a JSON body of this shape instead of the usual
// 201 + Location header. The admin-client surfaces the body verbatim via
// the helpers below so callers can show a friendly notice and skip the
// usual "navigate to the new entity" step.

export type PendingChangeRequest = {
  status: "PENDING";
  changeRequestId: string;
  entityType?: string;
  actionType?: string;
  message?: string;
};

export function isPendingChangeRequest(
  value: unknown,
): value is PendingChangeRequest {
  if (typeof value !== "object" || value === null) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    candidate.status === "PENDING" &&
    typeof candidate.changeRequestId === "string"
  );
}

export function pendingChangeRequestFromResponse(
  data: unknown,
): PendingChangeRequest | undefined {
  return isPendingChangeRequest(data) ? data : undefined;
}
