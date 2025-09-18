export type ReplayStatus =
  | "PENDING"
  | "APPROVED"
  | "DENIED"
  | "APPLIED"
  | "FAILED"
  | "CANCELLED";

export type ReplayKind =
  | "USER_CREATE" | "USER_UPDATE" | "USER_DELETE"
  | "ROLE_CREATE" | "ROLE_UPDATE" | "ROLE_DELETE"
  | "ROLE_ASSIGN_USER" | "ROLE_ASSIGN_GROUP"
  | "GROUP_CREATE" | "GROUP_UPDATE" | "GROUP_DELETE"
  | "GROUP_ADD_CHILD" | "GROUP_REMOVE_CHILD"
  | "CLIENT_CREATE" | "CLIENT_UPDATE" | "CLIENT_DELETE"
  | "CLIENT_ROLE_CREATE" | "CLIENT_ROLE_UPDATE" | "CLIENT_ROLE_DELETE"
  | "CLIENT_SCOPE_CREATE" | "CLIENT_SCOPE_UPDATE" | "CLIENT_SCOPE_DELETE"
  | "REALM_UPDATE"
  | "BUNDLE";

export interface Replay {
  id: string;
  kind: ReplayKind;
  status: ReplayStatus;
  actor?: string;
  createdAt: number; // epoch millis
  bundleId?: string;
  summary?: string;
  message?: string;
  payload?: unknown;
  error?: string | null;
}

export interface ListParams {
  first?: number;
  max?: number;
  status?: ReplayStatus[] | "all";
  kind?: ReplayKind[] | "all";
  bundleId?: string;
  actor?: string;
  from?: number;
  to?: number;
  order?: "asc" | "desc";
  q?: string;
}
