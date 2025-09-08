import type {
  BuilderState,
  Group,
  Clause,
  CompileResult,
} from "../types/policy-builder-types";
import { 
  validateState, 
  utf8Bytes, 
  toBase64, 
  sha256Hex,
  toExpr 
} from "./codegen";

/** Enhanced C# code generation with better formatting and proper IPolicy implementation. */
export function generateEnhancedCSharpCode(state: BuilderState): string {
  const className = sanitizeClassName(state.entryType);
  const namespace = extractNamespace(state.entryType);
  
  return `using System;
using System.Collections.Generic;
using Forseti.Policies;

namespace ${namespace}
{
    /// <summary>
    /// Generated policy: ${className}
    /// SDK Version: ${state.sdkVersion}
    /// Generated on: ${new Date().toISOString()}
    /// </summary>
    public sealed class ${className} : IPolicy
    {
        public bool Evaluate(RequestContext ctx)
        {
            if (ctx == null)
                return false;
            
            ${generateGroupEvaluation(state.root, 3)}
        }
        
        ${generateHelperMethods()}
    }
}`;
}

function sanitizeClassName(entryType: string): string {
  // Extract class name from full type name
  const parts = entryType.split('.');
  const className = parts[parts.length - 1] || 'Policy';
  
  // Ensure valid C# identifier
  return className.replace(/[^a-zA-Z0-9_]/g, '_');
}

function extractNamespace(entryType: string): string {
  const parts = entryType.split('.');
  if (parts.length > 1) {
    return parts.slice(0, -1).join('.');
  }
  return 'Forseti.Policies';
}

function generateGroupEvaluation(group: Group, indentLevel: number = 0): string {
  const indent = ' '.repeat(indentLevel * 4);
  
  if (group.items.length === 0) {
    return `${indent}return false; // Empty group always denies`;
  }
  
  if (group.items.length === 1) {
    const item = group.items[0];
    return generateItemEvaluation(item, indentLevel);
  }
  
  const operator = group.op === "AND" ? "&&" : "||";
  const evaluations = group.items.map(item => generateItemEvaluation(item, 0));
  
  return `${indent}return ${evaluations.join(`\n${indent}    ${operator} `)};`;
}

function generateItemEvaluation(item: Clause | Group, indentLevel: number = 0): string {
  const indent = ' '.repeat(indentLevel * 4);
  
  if ("kind" in item) {
    // It's a Clause
    return generateClauseEvaluation(item as Clause, indentLevel);
  } else {
    // It's a Group - wrap in parentheses
    const groupEval = generateGroupEvaluation(item as Group, 0);
    return `${indent}(${groupEval.trim()})`;
  }
}

function generateClauseEvaluation(clause: Clause, indentLevel: number = 0): string {
  const indent = ' '.repeat(indentLevel * 4);
  
  switch (clause.kind) {
    case "claim": {
      const key = clause.key || "";
      const value = escapeString(clause.value);
      
      switch (clause.op) {
        case "eq":
          return `${indent}string.Equals(ctx.GetClaim("${key}"), "${value}", StringComparison.Ordinal)`;
        case "neq":
          return `${indent}!string.Equals(ctx.GetClaim("${key}"), "${value}", StringComparison.Ordinal)`;
        case "contains":
          return `${indent}ctx.GetClaim("${key}").Contains("${value}", StringComparison.Ordinal)`;
        case "starts":
          return `${indent}ctx.GetClaim("${key}").StartsWith("${value}", StringComparison.Ordinal)`;
      }
      break;
    }
    
    case "path": {
      const value = escapeString(clause.value);
      
      switch (clause.op) {
        case "eq":
          return `${indent}string.Equals(ctx.Path, "${value}", StringComparison.Ordinal)`;
        case "neq":
          return `${indent}!string.Equals(ctx.Path, "${value}", StringComparison.Ordinal)`;
        case "contains":
          return `${indent}ctx.Path.Contains("${value}", StringComparison.Ordinal)`;
        case "starts":
          return `${indent}ctx.Path.StartsWith("${value}", StringComparison.Ordinal)`;
      }
      break;
    }
    
    case "method": {
      const value = escapeString(clause.value);
      
      switch (clause.op) {
        case "eq":
          return `${indent}string.Equals(ctx.Method, "${value}", StringComparison.OrdinalIgnoreCase)`;
        case "neq":
          return `${indent}!string.Equals(ctx.Method, "${value}", StringComparison.OrdinalIgnoreCase)`;
        case "contains":
          return `${indent}ctx.Method.Contains("${value}", StringComparison.OrdinalIgnoreCase)`;
        case "starts":
          return `${indent}ctx.Method.StartsWith("${value}", StringComparison.OrdinalIgnoreCase)`;
      }
      break;
    }
  }
  
  return `${indent}false; // Unsupported clause: ${clause.kind} ${clause.op}`;
}

function generateHelperMethods(): string {
  return `/// <summary>
        /// Helper method for debugging - returns human-readable policy description
        /// </summary>
        public string GetDescription()
        {
            return "Generated policy with enhanced evaluation logic";
        }`;
}

function escapeString(str: string): string {
  return str
    .replace(/\\/g, '\\\\')  // Escape backslashes
    .replace(/"/g, '\\"')    // Escape quotes
    .replace(/\n/g, '\\n')   // Escape newlines
    .replace(/\r/g, '\\r')   // Escape carriage returns
    .replace(/\t/g, '\\t');  // Escape tabs
}

/** Enhanced compilation with better error reporting. */
export async function compileEnhanced(state: BuilderState): Promise<CompileResult> {
  const errors = validateState(state);
  
  // Enhanced validation
  const additionalErrors = validateEnhanced(state);
  errors.push(...additionalErrors);
  
  const source = generateEnhancedCSharpCode(state);
  const bytes = utf8Bytes(source);
  const bh = await sha256Hex(bytes);
  const assemblyBase64 = toBase64(bytes);
  
  return {
    assemblyBase64,
    bh,
    entryType: state.entryType,
    sdkVersion: state.sdkVersion,
    diagnostics: errors.length ? 
      `Errors found:\n${errors.join('\n')}` : 
      `Successfully compiled: ${toExpr(state.root)}`,
  };
}

function validateEnhanced(state: BuilderState): string[] {
  const errors: string[] = [];
  
  // Check for empty groups
  function validateGroup(group: Group, path: string = "root") {
    if (group.items.length === 0) {
      errors.push(`Empty group at ${path} - this will always deny access`);
    }
    
    group.items.forEach((item, index) => {
      if ("kind" in item) {
        // Validate clause
        const clause = item as Clause;
        const clausePath = `${path}[${index}]`;
        
        if (!clause.value.trim()) {
          errors.push(`Empty value in clause at ${clausePath}`);
        }
        
        if (clause.kind === "claim" && !clause.key?.trim()) {
          errors.push(`Missing claim key in clause at ${clausePath}`);
        }
        
        // Validate common mistakes
        if (clause.kind === "method" && !["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"].includes(clause.value.toUpperCase())) {
          errors.push(`Potentially invalid HTTP method "${clause.value}" at ${clausePath}`);
        }
        
        if (clause.kind === "path" && !clause.value.startsWith("/")) {
          errors.push(`Path "${clause.value}" should start with "/" at ${clausePath}`);
        }
      } else {
        // Validate nested group
        validateGroup(item as Group, `${path}[${index}]`);
      }
    });
  }
  
  validateGroup(state.root);
  
  // Check for potentially dangerous policies
  if (isAllowAllPolicy(state.root)) {
    errors.push("Warning: This policy may allow all requests - review carefully");
  }
  
  return errors;
}

function isAllowAllPolicy(group: Group): boolean {
  // Simple heuristic: if we have very permissive conditions
  if (group.op === "OR" && group.items.length > 5) {
    return true;
  }
  
  // Check for overly broad path or method conditions
  for (const item of group.items) {
    if ("kind" in item) {
      const clause = item as Clause;
      if (clause.kind === "path" && (clause.value === "/" || clause.value === "/*")) {
        return true;
      }
      if (clause.kind === "method" && clause.value === "*") {
        return true;
      }
    }
  }
  
  return false;
}

// Export enhanced explanation function
export function explainPolicyEnhanced(group: Group): string {
  function explain(node: Group | Clause, depth: number = 0): string {
    const indent = "  ".repeat(depth);
    
    if ("kind" in node) {
      // Clause
      const clause = node as Clause;
      const subject = clause.kind === "claim" ? `user's "${clause.key}" claim` : 
                      clause.kind === "path" ? "request path" : 
                      "HTTP method";
      
      const verb = clause.op === "eq" ? "equals" :
                   clause.op === "neq" ? "does not equal" :
                   clause.op === "contains" ? "contains" :
                   "starts with";
      
      return `${indent}- ${subject} ${verb} "${clause.value}"`;
    } else {
      // Group
      const group = node as Group;
      if (group.items.length === 0) {
        return `${indent}(empty group - always denies)`;
      }
      
      const conjunction = group.op === "AND" ? "ALL of the following" : "ANY of the following";
      const items = group.items.map(item => explain(item, depth + 1)).join('\n');
      
      return `${indent}${conjunction} must be true:\n${items}`;
    }
  }
  
  return `This policy allows access when:\n${explain(group)}`;
}