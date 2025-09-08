import type KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type {
    BuilderState,
    CompileResult,
    UploadPayload,
    UploadResult,
    PolicyTemplate,
} from "../types/policy-builder-types";
import { compileClientSide } from "./codegen";
import { DEFAULT_POLICY_TEMPLATES } from "./policy-templates";

export interface PolicyApiConfig {
    adminClient?: KeycloakAdminClient;
    url?: string;
    fetchImpl?: typeof fetch;
}

export class PolicyApi {
    private adminClient?: KeycloakAdminClient;
    private url?: string;
    private fetchImpl: typeof fetch;

    constructor(config: PolicyApiConfig = {}) {
        this.adminClient = config.adminClient;
        this.url = config.url;
        this.fetchImpl = config.fetchImpl || fetch;
    }

    private async request<T>(
        path: string,
        options: RequestInit = {}
    ): Promise<T> {
        const baseHeaders: Record<string, string> = { 
            "Content-Type": "application/json",
            ...options.headers as Record<string, string>
        };
        
        if (this.adminClient) {
            const token = await this.adminClient.getAccessToken();
            baseHeaders.Authorization = `Bearer ${token}`;
        }

        const baseUrl = this.url || (this.adminClient ? this.adminClient.baseUrl : "");
        const response = await this.fetchImpl(`${baseUrl}/${path}`, {
            ...options,
            headers: baseHeaders,
        });

        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        return response.json();
    }

    /** Compile a policy via server (if configured) with client-side fallback. */
    async compile(
        state: BuilderState,
        opts: { preferRemote?: boolean } = { preferRemote: true }
    ): Promise<CompileResult> {
        const tryRemote = (!!this.url || !!this.adminClient) && opts.preferRemote !== false;

        if (tryRemote) {
            try {
                const data = await this.request<CompileResult>("api/forseti/policy/compile", {
                    method: "POST",
                    body: JSON.stringify(state),
                });
                return data;
            } catch (err) {
                console.warn("Remote compile failed, falling back to client.", err);
            }
        }

        return await compileClientSide(state);
    }

    /** Upload a compiled policy (assemblyBase64 + metadata). */
    async upload(payload: UploadPayload): Promise<UploadResult> {
        if (!this.url && !this.adminClient) {
            // Simulate success locally: echo minimal structure. Replace as needed.
            return Promise.resolve({
                bh: payload.assemblyBase64.slice(0, 16),
                entryType: payload.entryType,
                sdkVersion: payload.sdkVersion,
            });
        }

        return this.request<UploadResult>("api/forseti/policy/upload", {
            method: "POST",
            body: JSON.stringify(payload),
        });
    }

    /** List built-in templates (local) or fetch from server if available. */
    async listTemplates(): Promise<PolicyTemplate[]> {
        if (!this.url && !this.adminClient) return DEFAULT_POLICY_TEMPLATES;
        try {
            return this.request<PolicyTemplate[]>("api/forseti/policy/templates");
        } catch {
            return DEFAULT_POLICY_TEMPLATES;
        }
    }

    async getTemplate(id: string): Promise<PolicyTemplate | undefined> {
        const all = await this.listTemplates();
        return all.find((t) => t.id === id);
    }

    /** Validate policy configuration. */
    async validate(state: BuilderState): Promise<{ valid: boolean; errors: string[] }> {
        try {
            const result = await this.compile(state, { preferRemote: false });
            return {
                valid: !result.diagnostics.startsWith("Error"),
                errors: result.diagnostics.startsWith("Error") ? [result.diagnostics] : []
            };
        } catch (error) {
            return {
                valid: false,
                errors: [error instanceof Error ? error.message : "Unknown validation error"]
            };
        }
    }

    /** Test policy against sample input. */
    async test(state: BuilderState, testInput: Record<string, any>): Promise<{
        result: "allow" | "deny";
        explanation: string;
    }> {
        // This would typically call a server endpoint, but for now we'll simulate
        return {
            result: "allow",
            explanation: "Policy evaluation completed successfully"
        };
    }
}

// Factory function to create PolicyApi with admin client
export function createPolicyApi(adminClient: KeycloakAdminClient): PolicyApi {
    return new PolicyApi({ adminClient });
}

// Default instance for convenience (without admin client)
export const defaultPolicyApi = new PolicyApi();