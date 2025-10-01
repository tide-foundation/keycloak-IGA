// src/tide-change-requests/utils/bundleUtils.ts
export interface BundledRequest<T = any> {
  draftRecordId: string;     // normalized id key for UI
  requests: T[];
  status: string;            // DRAFT | PENDING | APPROVED | ACTIVE | DENIED | MIXED
  requestedBy: string;       // best-effort
  count: number;
}

/**
 * Works with:
 *  - SDK rows (RequestedChanges / RoleChangeRequest / CompositeRoleChangeRequest) → have draftRecordId
 *  - IGA envelopes (/tide-admin/change-set/.../requests) → have changeSetId, status, affectedUsers, userContextsPreview
 */
export function groupRequestsByDraftId<T extends Record<string, any>>(rows: T[]): BundledRequest<T>[] {
  if (!Array.isArray(rows) || rows.length === 0) return [];

  // Choose an id for grouping (prefer draftRecordId, fallback changeSetId)
  const getId = (r: any) => (r?.draftRecordId || r?.changeSetId || r?.id || "unknown") as string;

  // Group by id
  const grouped = rows.reduce((acc, r) => {
    const id = getId(r);
    (acc[id] ||= []).push(r);
    return acc;
  }, {} as Record<string, T[]>);

  // Normalize a single row's status
  const getRowStatus = (r: any): string => {
    // SDK rows: status / deleteStatus; envelopes: status already present
    const s = (r?.status ?? "").toString();
    const del = (r?.deleteStatus ?? "").toString();
    // Treat ACTIVE+deleteStatus specially if you show that elsewhere; otherwise return s
    return s || "DRAFT";
  };

  // Try to pull a "requested by" label
  const getRequestedBy = (rs: any[]): string => {
    // SDK rows: userRecord[0]?.username
    const fromUserRecord = rs.find(x => Array.isArray(x?.userRecord) && x.userRecord[0]?.username)?.userRecord?.[0]?.username;
    if (fromUserRecord) return fromUserRecord;

    // Envelopes: might have affectedUsers; no usernames unless you resolve them - show first id
    const firstWithAffected = rs.find(x => Array.isArray(x?.affectedUsers) && x.affectedUsers.length > 0);
    if (firstWithAffected) return firstWithAffected.affectedUsers[0];

    // Fallback
    return "Unknown";
  };

  return Object.entries(grouped).map(([id, requests]) => {
    const statuses = Array.from(new Set(requests.map(getRowStatus)));
    const status = statuses.length > 1 ? "MIXED" : statuses[0] || "DRAFT";

    return {
      draftRecordId: id,
      requests,
      status,
      requestedBy: getRequestedBy(requests),
      count: requests.length,
    };
  });
}
