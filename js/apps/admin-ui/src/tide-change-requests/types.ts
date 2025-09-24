export type ActionType = "ADD" | "REMOVE" | "UPDATE";
export type DraftStatus =
  | "DRAFT"
  | "PENDING"
  | "APPROVED"
  | "ACTIVE"
  | "DENIED"
  | "UNKNOWN";

export interface ChangeRequestRow {
  draftRecordId: string; // changeSetId
  changeSetType: "USER" | "ROLE" | "CLIENT" | string;
  actionType: ActionType;
  userId?: string;
  clientId?: string;
  roleId?: string;
  permissionId?: string;
  payload?: any;
  status?: DraftStatus;
}

export interface MergedContext {
  key: string; // `${userId}|${clientId ?? ""}`
  userId?: string;
  clientId?: string;
  actions: ChangeRequestRow[]; // normalized (deduped) requests
  sourceRows: ChangeRequestRow[]; // original rows that fed into this context
}

export interface MergeResult {
  merged: MergedContext[];
  untouched: ChangeRequestRow[];
}
