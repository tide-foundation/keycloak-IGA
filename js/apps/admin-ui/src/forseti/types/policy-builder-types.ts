export type ClauseKind = "claim" | "path" | "method";
export type ClauseOperator = "eq" | "neq" | "contains" | "starts";
export type GroupOperator = "AND" | "OR";


export interface Clause {
kind: ClauseKind;
key?: string;
op: ClauseOperator;
value: string;
}


export interface Group {
op: GroupOperator;
items: (Clause | Group)[];
}


export interface BuilderState {
entryType: string;
sdkVersion: string;
root: Group;
}


export interface PolicyTemplate {
id: string;
name: string;
description: string;
icon: string;
state: BuilderState;
}


export interface CompileResult {
assemblyBase64: string;
bh: string;
entryType: string;
sdkVersion: string;
diagnostics: string;
}


export interface UploadPayload {
assemblyBase64: string;
entryType: string;
sdkVersion: string;
publisherSig?: string | null;
}


export interface UploadResult {
bh: string;
entryType: string;
sdkVersion: string;
}


export type CompileStatus = "idle" | "compiling" | "success" | "error";
export type PublishStatus = "idle" | "uploading" | "success" | "error";