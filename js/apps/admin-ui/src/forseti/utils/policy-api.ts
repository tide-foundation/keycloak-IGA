import type { BuilderState, UploadPayload, UploadResult, CompileResult } from "../types/policy-builder-types";
import { generateEnhancedCSharpCode } from "./enhanced-codegen";

// DEMO stub. Replace with your real API client.
export const defaultPolicyApi = {
  async compile(state: BuilderState, _opts?: { preferRemote?: boolean }): Promise<CompileResult> {
    // Fake compile: generate code and return base64.
    const code = generateEnhancedCSharpCode(state);
    const asmB64 = btoa(unescape(encodeURIComponent(code)));
    const bh = (Math.random().toString(16).slice(2) + Math.random().toString(16).slice(2)).slice(0, 32);
    return {
      assemblyBase64: asmB64,
      bh,
      entryType: state.entryType,
      sdkVersion: state.sdkVersion,
      diagnostics: "OK",
    };
    },
  async upload(payload: UploadPayload): Promise<UploadResult> {
    return { bh: payload.assemblyBase64.slice(0, 16), entryType: payload.entryType, sdkVersion: payload.sdkVersion };
  }
};
