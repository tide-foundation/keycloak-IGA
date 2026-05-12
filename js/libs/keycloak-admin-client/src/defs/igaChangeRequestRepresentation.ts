/* TIDECLOAK IMPLEMENTATION */
export type IgaChangeRequestStatus = "PENDING" | "APPROVED" | "DENIED";

export type IgaScopeMode = "any" | "all";

export default interface IgaChangeRequest {
  id: string;
  realmId: string;
  status: IgaChangeRequestStatus;
  actionType: string;
  entityType: string;
  entityId: string | null;
  rowsJson: string;
  authCount: number;
  threshold: number;
  requiredApproverRoles: string[];
  scopeMode: IgaScopeMode;
  createdBy: string | null;
  createdAt: number;
  finalSignature: string | null;
  denyReason: string | null;
}
