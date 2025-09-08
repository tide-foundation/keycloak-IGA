import type { BuilderState, Clause, Group } from "../types/policy-builder-types";

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: string[];
}

export interface ValidationError {
  type: "error" | "warning";
  message: string;
  path?: string;
  severity: "high" | "medium" | "low";
}

export interface ValidationWarning extends ValidationError {
  type: "warning";
}

export class PolicyValidator {
  static validate(state: BuilderState): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];
    const suggestions: string[] = [];

    // Basic state validation
    if (!state.entryType?.trim()) {
      errors.push({
        type: "error",
        message: "Policy name (entry type) is required",
        severity: "high"
      });
    } else if (!/^[a-zA-Z][a-zA-Z0-9._]*[a-zA-Z0-9]$/.test(state.entryType)) {
      errors.push({
        type: "error",
        message: "Policy name must be a valid C# class name (letters, numbers, dots, underscores)",
        severity: "medium"
      });
    }

    if (!state.sdkVersion?.trim()) {
      warnings.push({
        type: "warning",
        message: "SDK version should be specified",
        severity: "low"
      });
    }

    // Validate root group
    this.validateGroup(state.root, "root", errors, warnings, suggestions);

    // Security validation
    this.validateSecurity(state, errors, warnings, suggestions);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      suggestions: suggestions.length ? suggestions : this.getDefaultSuggestions()
    };
  }

  private static validateGroup(
    group: Group, 
    path: string, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ) {
    if (group.items.length === 0) {
      warnings.push({
        type: "warning",
        message: `Empty group at ${path} will always deny access`,
        path,
        severity: "high"
      });
      suggestions.push("Add at least one condition to define when access should be allowed");
    }

    group.items.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;
      
      if ("kind" in item) {
        this.validateClause(item as Clause, itemPath, errors, warnings, suggestions);
      } else {
        this.validateGroup(item as Group, itemPath, errors, warnings, suggestions);
      }
    });

    // Check for overly complex groups
    if (group.items.length > 10) {
      warnings.push({
        type: "warning",
        message: `Group at ${path} has many conditions (${group.items.length}) - consider simplifying`,
        path,
        severity: "medium"
      });
      suggestions.push("Break complex policies into smaller, more manageable groups");
    }
  }

  private static validateClause(
    clause: Clause, 
    path: string, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ) {
    // Required field validation
    if (!clause.value?.trim()) {
      errors.push({
        type: "error",
        message: `Empty value in ${clause.kind} condition at ${path}`,
        path,
        severity: "high"
      });
    }

    if (clause.kind === "claim" && !clause.key?.trim()) {
      errors.push({
        type: "error",
        message: `Missing claim name at ${path}`,
        path,
        severity: "high"
      });
      suggestions.push('Specify which claim to check (e.g., "role", "sub", "email")');
    }

    // Kind-specific validation
    switch (clause.kind) {
      case "method":
        this.validateMethodClause(clause, path, errors, warnings, suggestions);
        break;
      case "path":
        this.validatePathClause(clause, path, errors, warnings, suggestions);
        break;
      case "claim":
        this.validateClaimClause(clause, path, errors, warnings, suggestions);
        break;
    }

    // Operator-specific validation
    if (clause.op === "contains" && clause.value && clause.value.length < 3) {
      warnings.push({
        type: "warning",
        message: `Very short "contains" pattern "${clause.value}" may match unexpectedly`,
        path,
        severity: "low"
      });
    }
  }

  private static validateMethodClause(
    clause: Clause, 
    path: string, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ) {
    const validMethods = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];
    const upperValue = clause.value?.toUpperCase();
    
    if (clause.value && !validMethods.includes(upperValue)) {
      warnings.push({
        type: "warning",
        message: `"${clause.value}" may not be a standard HTTP method`,
        path,
        severity: "medium"
      });
      suggestions.push(`Consider using standard HTTP methods: ${validMethods.join(", ")}`);
    }

    if (clause.op === "contains" || clause.op === "starts") {
      warnings.push({
        type: "warning",
        message: `Using "${clause.op}" with HTTP method may be unexpected`,
        path,
        severity: "low"
      });
      suggestions.push("HTTP methods are usually checked for exact equality");
    }
  }

  private static validatePathClause(
    clause: Clause, 
    path: string, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ) {
    if (clause.value && !clause.value.startsWith("/")) {
      warnings.push({
        type: "warning",
        message: `Path "${clause.value}" should typically start with "/"`,
        path,
        severity: "medium"
      });
      suggestions.push('Use absolute paths like "/api/users" rather than relative paths');
    }

    if (clause.value === "/" && clause.op === "eq") {
      warnings.push({
        type: "warning",
        message: "Checking for exact root path may be too restrictive",
        path,
        severity: "low"
      });
      suggestions.push('Consider using "starts with" for broader path matching');
    }

    // Check for potentially dangerous patterns
    if (clause.value && (clause.value.includes("..") || clause.value.includes("~"))) {
      errors.push({
        type: "error",
        message: `Path "${clause.value}" contains potentially dangerous characters`,
        path,
        severity: "high"
      });
    }
  }

  private static validateClaimClause(
    clause: Clause, 
    path: string, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ) {
    const commonClaims = ["sub", "role", "email", "name", "groups", "aud", "iss"];
    
    if (clause.key && !commonClaims.includes(clause.key.toLowerCase())) {
      // This is just informational, not an error
      suggestions.push(`"${clause.key}" is a custom claim - ensure it's available in your tokens`);
    }

    if (clause.key === "sub" && clause.op === "contains") {
      warnings.push({
        type: "warning",
        message: 'Using "contains" with "sub" claim may match unintended users',
        path,
        severity: "medium"
      });
      suggestions.push('Subject claims are typically checked for exact equality');
    }

    if (clause.value && clause.value.includes("@") && clause.key !== "email") {
      warnings.push({
        type: "warning",
        message: `Value "${clause.value}" looks like an email but claim is "${clause.key}"`,
        path,
        severity: "low"
      });
    }
  }

  private static validateSecurity(
    state: BuilderState, 
    errors: ValidationError[], 
    warnings: ValidationWarning[], 
    suggestions: string[]
  ) {
    // Check for overly permissive policies
    if (this.isAllowAllPattern(state.root)) {
      warnings.push({
        type: "warning",
        message: "This policy may allow all requests - review carefully",
        severity: "high"
      });
      suggestions.push("Ensure your policy is not more permissive than intended");
    }

    // Check for common security patterns
    const hasAuthCheck = this.hasAuthenticationCheck(state.root);
    if (!hasAuthCheck) {
      warnings.push({
        type: "warning",
        message: "Policy doesn't seem to check user authentication",
        severity: "medium"
      });
      suggestions.push('Consider adding a check for authenticated users (e.g., claim "sub" not empty)');
    }

    // Check for potential injection vulnerabilities
    if (this.hasInjectionRisk(state.root)) {
      errors.push({
        type: "error",
        message: "Policy contains values that may be vulnerable to injection attacks",
        severity: "high"
      });
      suggestions.push("Avoid using user-controlled input directly in policy conditions");
    }
  }

  private static isAllowAllPattern(group: Group): boolean {
    // Simple heuristics for overly permissive policies
    if (group.items.length === 0) return false;
    
    // Check for very broad OR conditions
    if (group.op === "OR" && group.items.length > 5) return true;
    
    // Check for overly broad individual conditions
    return group.items.some(item => {
      if ("kind" in item) {
        const clause = item as Clause;
        return (clause.kind === "path" && (clause.value === "/" || clause.value === "/*" || clause.value === "*")) ||
               (clause.kind === "method" && clause.value === "*");
      }
      return false;
    });
  }

  private static hasAuthenticationCheck(group: Group): boolean {
    return group.items.some(item => {
      if ("kind" in item) {
        const clause = item as Clause;
        return clause.kind === "claim" && 
               (clause.key === "sub" || clause.key === "aud" || clause.key === "iss") &&
               clause.op === "neq" && clause.value === "";
      } else {
        return this.hasAuthenticationCheck(item as Group);
      }
    });
  }

  private static hasInjectionRisk(group: Group): boolean {
    return group.items.some(item => {
      if ("kind" in item) {
        const clause = item as Clause;
        const value = clause.value?.toLowerCase() || "";
        return value.includes("'") || 
               value.includes("\"") || 
               value.includes(";") ||
               value.includes("--") ||
               value.includes("/*") ||
               value.includes("*/") ||
               value.includes("${");
      } else {
        return this.hasInjectionRisk(item as Group);
      }
    });
  }

  private static getDefaultSuggestions(): string[] {
    return [
      "Start with simple conditions and build complexity gradually",
      "Test your policy with different scenarios before deployment",
      "Consider using templates for common patterns",
      "Document the purpose and expected behavior of your policy"
    ];
  }
}