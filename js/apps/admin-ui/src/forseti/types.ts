export type Combiner =
  | "DenyOverrides"
  | "AllMustPass"
  | "AnyMayPass"
  | "FirstApplicable"
  | "PermitOverrides"
  | "ExactlyOnePass"
  | "ThresholdKOfN";

export type Stage = "auth" | "sign";
export type Mode = "enforce" | "shadow";

export interface ForsetiPolicyRoute {
  id: number;
  vvkId: string;
  resourcePattern: string;
  action: string;
  authCombiner: Combiner;
  authThresholdK: number | null;
  signCombiner: Combiner;
  signThresholdK: number | null;
  overallCombiner: Combiner;
  order: number;
  active: boolean;
  items: ForsetiPolicyRouteItem[];
}

export interface ForsetiPolicyRouteItem {
  id: number;
  routeId: number;
  stage: Stage;
  policy: string;
  manifestHash: string;
  entryType: string;
  codeBh: string;
  mode: Mode;
  order: number;
  active: boolean;
}

export interface ForsetiPolicyManifest {
  id: number;
  vvkId: string;
  policy: string;
  hash: string;
  json: string;
  signatureB64: string;
  signerKid: string;
  active: boolean;
  createdAt: string;
}

export interface PolicyABI {
  policy: string;
  sdkVersion: string;
  stage: Stage;
  requires: { name: string; type: string }[];
  optional: { name: string; type: string }[];
  description: string;
}

export interface ManifestWithABI {
  abi?: PolicyABI;
  [key: string]: any;
}

export interface CatalogItem {
  policy: string;
  entryType: string;
  codeBh: string;
  sdkVersion: string;
}

export interface CodeUploadResponse {
  bh: string;
  entryTypes?: string[];
}

export interface CreateRouteRequest {
  vvkId: string;
  resourcePattern: string;
  action: string;
  authCombiner: Combiner;
  authThresholdK: number | null;
  signCombiner: Combiner;
  signThresholdK: number | null;
  overallCombiner: Combiner;
  order: number;
  active: boolean;
  items: Omit<ForsetiPolicyRouteItem, "id" | "routeId">[];
}

export interface CreateManifestRequest {
  vvkId: string;
  policy: string;
  json: string;
  signatureB64: string;
  signerKid: string;
}

export interface RevokeCodeRequest {
  vvkId: string;
  bh: string;
  reason: string;
}

export interface SimulationRequest {
  vvkId: string;
  resource: string;
  action: string;
  authVersion?: string;
  signVersion?: string;
  claims: Record<string, any>;
}