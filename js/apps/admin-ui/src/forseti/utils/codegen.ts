import type {
    BuilderState,
    Group,
    Clause,
    CompileResult,
} from "../types/policy-builder-types";

/** Check if a node is a Group (vs. Clause). */
function isGroup(node: Clause | Group): node is Group {
    return "op" in node && "items" in node;
}

/** Basic validation of the policy state. */
export function validateState(state: BuilderState): string[] {
    const errors: string[] = [];
    
    if (!state.entryType) {
        errors.push("Entry type is required");
    }
    
    if (!state.sdkVersion) {
        errors.push("SDK version is required");
    }
    
    if (!state.root) {
        errors.push("Root group is required");
    }
    
    return errors;
}

/** Convert BuilderState to canonical JSON string. */
export function toCanonicalJson(state: BuilderState): string {
    return JSON.stringify(state, null, 2);
}

/** Convert string to UTF-8 bytes. */
export function utf8Bytes(str: string): Uint8Array {
    return new TextEncoder().encode(str);
}

/** Convert bytes to base64 (browser or Node compatible). */
export function toBase64(bytes: Uint8Array): string {
    // Browser
    if (typeof btoa !== "undefined") {
        let binary = "";
        const len = bytes.byteLength;
        const chunk = 8192;
        for (let i = 0; i < len; i += chunk) {
            binary += String.fromCharCode.apply(
                null as unknown as any,
                Array.from(bytes.subarray(i, i + chunk))
            );
        }
        return btoa(binary);
    }
    // Node
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const { Buffer } = require("buffer");
        return Buffer.from(bytes).toString("base64");
    } catch {
        throw new Error("No base64 encoder available in this environment");
    }
}

/** SHA-256 of bytes -> hex string (browser or Node) */
export async function sha256Hex(bytes: Uint8Array): Promise<string> {
    // Browser WebCrypto
    if (typeof crypto !== "undefined" && crypto.subtle) {
        const digest = await crypto.subtle.digest("SHA-256", bytes);
        const view = new Uint8Array(digest);
        return Array.from(view)
            .map((b) => b.toString(16).padStart(2, "0"))
            .join("");
    }
    // Node
    try {
        // eslint-disable-next-line @typescript-eslint/no-var-requires
        const nodeCrypto = require("crypto");
        const hex = nodeCrypto.createHash("sha256").update(bytes).digest("hex");
        return hex;
    } catch {
        throw new Error("No SHA-256 available in this environment");
    }
}

/** Optional human-readable expression (useful in logs/diagnostics). */
export function toExpr(node: Clause | Group): string {
    if (isGroup(node)) {
        return `${node.op}(${node.items.map(toExpr).join(", ")})`;
    }
    const lhs =
        node.kind === "claim" ? `claim.${node.key}` : node.kind === "path" ? "path" : "method";
    const opMap: Record<string, string> = {
        eq: "==",
        neq: "!=",
        contains: "CONTAINS",
        starts: "STARTS",
    };
    return `${lhs} ${opMap[node.op]} "${node.value}"`;
}

/** Generate C# code from policy state. */
export function generateCSharpCode(state: BuilderState): string {
    const className = state.entryType.split('.').pop() || 'Policy';
    
    return `using Forseti.Core;
using System.Threading.Tasks;

namespace ${state.entryType.substring(0, state.entryType.lastIndexOf('.'))}
{
    public class ${className} : IPolicy
    {
        public string Name => "${className}";
        public string Version => "${state.sdkVersion}";
        
        public Task<PolicyResult> EvaluateAsync(PolicyContext context)
        {
            // Generated from policy builder
            ${generateConditionCode(state.root, 3)}
            
            return Task.FromResult(PolicyResult.Allow());
        }
        
        ${generateHelperMethods()}
    }
}`;
}

function generateConditionCode(node: Group | Clause, indent: number = 0): string {
    const spaces = " ".repeat(indent * 4);
    
    if (isGroup(node)) {
        const operator = node.op === "AND" ? "&&" : "||";
        const conditions = node.items.map(item => generateConditionCode(item, 0)).join(` ${operator} `);
        return `${spaces}if (${conditions})`;
    } else {
        switch (node.kind) {
            case "claim":
                return `context.Claims["${node.key}"]?.Value ${getOperatorSymbol(node.op)} "${node.value}"`;
            case "path":
                return `context.Resource.Path ${getOperatorSymbol(node.op)} "${node.value}"`;
            case "method":
                return `context.Request.Method ${getOperatorSymbol(node.op)} "${node.value}"`;
            default:
                return "true";
        }
    }
}

function getOperatorSymbol(op: string): string {
    switch (op) {
        case "eq": return "==";
        case "neq": return "!=";
        case "contains": return ".Contains";
        case "starts": return ".StartsWith";
        default: return "==";
    }
}

function generateHelperMethods(): string {
    return `private bool HasClaim(PolicyContext context, string claimType, string expectedValue)
        {
            return context.Claims.ContainsKey(claimType) && 
                   context.Claims[claimType].Value == expectedValue;
        }`;
}

/** Explain policy in human-readable form. */
export function explainPolicy(node: Group | Clause): string {
    if (isGroup(node)) {
        const conjunction = node.op === "AND" ? "and" : "or";
        const explanations = node.items.map(explainPolicy);
        if (explanations.length === 1) return explanations[0];
        if (explanations.length === 2) return explanations.join(` ${conjunction} `);
        return explanations.slice(0, -1).join(", ") + `, ${conjunction} ${explanations[explanations.length - 1]}`;
    }
    
    const subject = node.kind === "claim" ? `claim "${node.key}"` : node.kind;
    const verb = getVerbForOperator(node.op);
    return `${subject} ${verb} "${node.value}"`;
}

function getVerbForOperator(op: string): string {
    switch (op) {
        case "eq": return "equals";
        case "neq": return "does not equal";
        case "contains": return "contains";
        case "starts": return "starts with";
        default: return "matches";
    }
}

/** Create a CompileResult fully on the client. */
export async function compileClientSide(state: BuilderState): Promise<CompileResult> {
    const diags = validateState(state);
    const source = toCanonicalJson(state);
    const bytes = utf8Bytes(source);
    const bh = await sha256Hex(bytes);
    const assemblyBase64 = toBase64(bytes);
    return {
        assemblyBase64,
        bh,
        entryType: state.entryType,
        sdkVersion: state.sdkVersion,
        diagnostics: diags.length ? diags.join("\n") : `OK: ${toExpr(state.root)}`,
    };
}