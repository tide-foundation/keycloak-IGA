/* TIDECLOAK IMPLEMENTATION */
export type IgaChangeRequestStatus = "PENDING" | "APPROVED" | "DENIED";

export type IgaScopeMode = "any" | "all";

export interface IgaCrAuthorizerRepresentation {
  username: string;
  timestamp: number;
}

export default interface IgaChangeRequest {
  id: string;
  realmId: string;
  status: IgaChangeRequestStatus;
  actionType: string;
  entityType: string;
  entityId: string | null;
  rowsJson: string;
  authCount: number;
  authorizationCount?: number;
  threshold: number;
  requiredApproverRoles: string[];
  scopeMode: IgaScopeMode;
  createdBy: string | null;
  createdAt: number;
  finalSignature: string | null;
  denyReason: string | null;
  authorizers: IgaCrAuthorizerRepresentation[];
  readyToCommit: boolean;
}
