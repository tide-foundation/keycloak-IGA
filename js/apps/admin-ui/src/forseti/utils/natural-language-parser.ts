import type {
  BuilderState,
  Clause,
  Group,
  ClauseKind,
  ClauseOperator,
  GroupOperator,
} from "../types/policy-builder-types";

// Natural Language to AST Parser
export class NaturalLanguageParser {
  private static readonly PATTERNS = {
    // Basic patterns for clause recognition
    CLAIM_PATTERN: /(?:claim|user)\s+"?([^"]+)"?\s+(equals?|eq|is|==|not equals?|neq|!=|contains?|starts with)\s+"?([^"]+)"?/i,
    PATH_PATTERN: /(?:path|url|route)\s+(equals?|eq|is|==|not equals?|neq|!=|contains?|starts with)\s+"?([^"]+)"?/i,
    METHOD_PATTERN: /(?:method|http method|request method)\s+(equals?|eq|is|==|not equals?|neq|!=|contains?|starts with)\s+"?([^"]+)"?/i,
    
    // Simplified patterns
    ALLOW_ONLY_GET: /allow\s+only\s+GET/i,
    ALLOW_ONLY_POST: /allow\s+only\s+POST/i,
    PATH_STARTS: /path\s+starts\s+with\s+"?([^"]+)"?/i,
    CLAIM_ROLE_ADMIN: /(?:claim\s+)?role\s+(?:equals?|is|==)\s+"?admin"?/i,
    
    // Logical operators
    AND_PATTERN: /\s+and\s+/i,
    OR_PATTERN: /\s+or\s+/i,
  };

  static parse(input: string): Group {
    if (!input.trim()) {
      return { op: "AND", items: [] };
    }

    try {
      // Split by logical operators first
      const segments = this.splitByLogicalOperators(input);
      
      if (segments.length === 1) {
        // Single clause
        const clause = this.parseClause(segments[0].text);
        return clause ? { op: "AND", items: [clause] } : { op: "AND", items: [] };
      }

      // Multiple clauses with operators
      const items: (Clause | Group)[] = [];
      let currentOperator: GroupOperator = "AND";

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        
        if (segment.type === "clause") {
          const clause = this.parseClause(segment.text);
          if (clause) {
            items.push(clause);
          }
        } else if (segment.type === "operator") {
          currentOperator = segment.text.toLowerCase().includes("or") ? "OR" : "AND";
        }
      }

      return { op: currentOperator, items };
    } catch (error) {
      console.warn("Failed to parse natural language input:", error);
      return { op: "AND", items: [] };
    }
  }

  private static splitByLogicalOperators(input: string): Array<{type: "clause" | "operator", text: string}> {
    const segments: Array<{type: "clause" | "operator", text: string}> = [];
    const parts = input.split(/(\s+(?:and|or)\s+)/i);
    
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i].trim();
      if (!part) continue;
      
      if (this.PATTERNS.AND_PATTERN.test(part) || this.PATTERNS.OR_PATTERN.test(part)) {
        segments.push({ type: "operator", text: part });
      } else {
        segments.push({ type: "clause", text: part });
      }
    }
    
    return segments;
  }

  private static parseClause(text: string): Clause | null {
    const trimmed = text.trim();
    
    // Handle simplified patterns first
    if (this.PATTERNS.ALLOW_ONLY_GET.test(trimmed)) {
      return { kind: "method", op: "eq", value: "GET" };
    }
    
    if (this.PATTERNS.ALLOW_ONLY_POST.test(trimmed)) {
      return { kind: "method", op: "eq", value: "POST" };
    }
    
    const pathStartsMatch = trimmed.match(this.PATTERNS.PATH_STARTS);
    if (pathStartsMatch) {
      return { kind: "path", op: "starts", value: pathStartsMatch[1] };
    }
    
    if (this.PATTERNS.CLAIM_ROLE_ADMIN.test(trimmed)) {
      return { kind: "claim", key: "role", op: "eq", value: "admin" };
    }

    // Handle detailed patterns
    const claimMatch = trimmed.match(this.PATTERNS.CLAIM_PATTERN);
    if (claimMatch) {
      return {
        kind: "claim",
        key: claimMatch[1],
        op: this.parseOperator(claimMatch[2]),
        value: claimMatch[3],
      };
    }

    const pathMatch = trimmed.match(this.PATTERNS.PATH_PATTERN);
    if (pathMatch) {
      return {
        kind: "path",
        op: this.parseOperator(pathMatch[1]),
        value: pathMatch[2],
      };
    }

    const methodMatch = trimmed.match(this.PATTERNS.METHOD_PATTERN);
    if (methodMatch) {
      return {
        kind: "method",
        op: this.parseOperator(methodMatch[1]),
        value: methodMatch[2],
      };
    }

    return null;
  }

  private static parseOperator(opText: string): ClauseOperator {
    const lower = opText.toLowerCase().trim();
    
    if (lower.includes("not") || lower.includes("!=") || lower.includes("neq")) {
      return "neq";
    }
    if (lower.includes("contains")) {
      return "contains";
    }
    if (lower.includes("starts")) {
      return "starts";
    }
    
    return "eq"; // default
  }

  // AST to Natural Language Stringifier
  static stringify(group: Group): string {
    if (!group.items.length) {
      return "";
    }

    const parts = group.items.map(item => {
      if ("kind" in item) {
        return this.stringifyClause(item as Clause);
      } else {
        return `(${this.stringify(item as Group)})`;
      }
    });

    const conjunction = group.op === "AND" ? " and " : " or ";
    return parts.join(conjunction);
  }

  private static stringifyClause(clause: Clause): string {
    const subject = clause.kind === "claim" && clause.key
      ? `claim "${clause.key}"`
      : clause.kind;
    
    const verb = this.getVerbForOperator(clause.op);
    
    return `${subject} ${verb} "${clause.value}"`;
  }

  private static getVerbForOperator(op: ClauseOperator): string {
    switch (op) {
      case "eq": return "equals";
      case "neq": return "does not equal";
      case "contains": return "contains";
      case "starts": return "starts with";
      default: return "equals";
    }
  }

  // Validation helpers
  static validate(input: string): { isValid: boolean; errors: string[]; suggestions: string[] } {
    const errors: string[] = [];
    const suggestions: string[] = [];

    if (!input.trim()) {
      return { isValid: true, errors, suggestions };
    }

    try {
      const parsed = this.parse(input);
      
      if (parsed.items.length === 0) {
        errors.push("Could not parse any conditions from the input");
        suggestions.push('Try: "allow only GET" or "claim role equals admin"');
      }

      // Check for incomplete clauses
      for (const item of parsed.items) {
        if ("kind" in item) {
          const clause = item as Clause;
          if (!clause.value) {
            errors.push(`Missing value for ${clause.kind} condition`);
          }
          if (clause.kind === "claim" && !clause.key) {
            errors.push("Claim conditions require a claim name");
          }
        }
      }

    } catch (error) {
      errors.push("Failed to parse the expression");
      suggestions.push("Check syntax and try simpler phrases");
    }

    return {
      isValid: errors.length === 0,
      errors,
      suggestions: suggestions.length ? suggestions : [
        'Examples: "allow only GET", "path starts with /api", "claim role equals admin"'
      ]
    };
  }

  // Get example expressions for help
  static getExamples(): Array<{ expression: string; description: string }> {
    return [
      {
        expression: "allow only GET",
        description: "Allow only HTTP GET requests"
      },
      {
        expression: "path starts with /api/private",
        description: "Allow paths starting with /api/private"
      },
      {
        expression: "claim role equals admin",
        description: "Allow users with admin role"
      },
      {
        expression: "method equals POST and path contains /users",
        description: "POST requests to paths containing /users"
      },
      {
        expression: "claim role equals admin or claim sub equals resource.owner",
        description: "Admin users or resource owners"
      }
    ];
  }
}

// Utility to sync between AST and natural language
export function syncAstToNaturalLanguage(state: BuilderState): string {
  return NaturalLanguageParser.stringify(state.root);
}

export function syncNaturalLanguageToAst(
  expression: string, 
  currentState: BuilderState
): BuilderState {
  const newRoot = NaturalLanguageParser.parse(expression);
  return {
    ...currentState,
    root: newRoot
  };
}