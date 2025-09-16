// // TIDECLOAK IMPLEMENTATION
export interface TokenPreviewSpec {
  userId?: string;
  clientId: string;
  defaultClientContext?: boolean;
  expectedActiveRev?: number;

  includeDefaultScopes?: boolean;
  includeOptionalScopes?: boolean;
  addOptionalClientScopes?: string[];
  removeOptionalClientScopes?: string[];
  extraClientScopes?: string[];
  scopeParam?: string;

  userSessionNotes?: Record<string,string>;
  clientSessionNotes?: Record<string,string>;
  authTimeEpoch?: number;
  acr?: string;
  amr?: string[];

  realmAttributes?: Record<string,string>;
  clientAttributes?: Record<string,string>;

  userAttributePatches?: { key: string; values: string[] }[];

  addGroups?: string[];
  removeGroups?: string[];

  addUserRoles?: { roleName: string; clientId?: string }[];
  removeUserRoles?: { roleName: string; clientId?: string }[];

  addToComposite?: { compositeRoleName: string; compositeClientId?: string; childRoleName: string; childClientId?: string }[];
  removeFromComposite?: { compositeRoleName: string; compositeClientId?: string; childRoleName: string; childClientId?: string }[];
}
