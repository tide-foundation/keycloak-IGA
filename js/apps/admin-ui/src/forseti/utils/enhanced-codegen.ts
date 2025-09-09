import type { BuilderState, Group, Clause } from "../types/policy-builder-types";

function csString(s: string): string { return s.replace(/\\/g, "\\\\").replace(/"/g, '\\"'); }
function fieldExpr(c: Clause): string {
  switch (c.kind) {
    case "claim": return `(ctx.GetClaim("${csString(c.key || "")}") ?? string.Empty)`;
    case "path": return `(ctx.Path ?? string.Empty)`;
    case "method": return `(ctx.Method ?? string.Empty)`;
  }
}
function comparisonFor(c: Clause): string { return c.kind === "method" ? "StringComparison.OrdinalIgnoreCase" : "StringComparison.Ordinal"; }
function compileClause(c: Clause): string {
  const left = fieldExpr(c); const value = `"${csString(c.value)}"`;
  switch (c.op) {
    case "eq": return `string.Equals(${left}, ${value}, ${comparisonFor(c)})`;
    case "neq": return `!string.Equals(${left}, ${value}, ${comparisonFor(c)})`;
    case "contains": return `${left}.IndexOf(${value}, StringComparison.OrdinalIgnoreCase) >= 0`;
    case "starts": return `${left}.StartsWith(${value}, StringComparison.OrdinalIgnoreCase)`;
    default: return "true";
  }
}

export type Span = { start: number; end: number; path: string; kind: "group" | "clause" };
export type SpanMeta = { path: string; kind: "group" | "clause"; depth: number; op?: "AND"|"OR"; groupOp?: "AND"|"OR"; clauseCount?: number; groupCount?: number };

/**
 * Pure emitter with stable, non-overlapping spans;
 * returns code, spans (absolute within expr), and metadata per path.
 */
function buildExpr(g: Group, path: string): { code: string; spans: Span[]; meta: Record<string, SpanMeta> } {
  type Emit = { code: string; spans: Span[]; meta: Record<string, SpanMeta> };
  const join = (a: Emit, b: Emit): Emit => ({ code: a.code + b.code, spans: a.spans.concat(b.spans), meta: { ...a.meta, ...b.meta } });
  const lit = (s: string): Emit => ({ code: s, spans: [], meta: {} });
  const depth = (p: string) => (p === "0" ? 0 : p.split(".").length - 1);

  const emitClause = (c: Clause, p: string): Emit => {
    const code = `(${compileClause(c)})`;
    const sp: Span = { start: 0, end: code.length, path: p, kind: "clause" };
    const meta: SpanMeta = { path: p, kind: "clause", depth: depth(p) };
    return { code, spans: [sp], meta: { [p]: meta } };
  };

  const emitGroup = (gg: Group, p: string): Emit => {
    const clauseJoiner = gg.op === "AND" ? " && " : " || ";
    const groupJoiner = (gg.groupOp ?? gg.op) === "AND" ? " && " : " || ";

    const clauseEmits: Emit[] = [];
    const groupEmits: Emit[] = [];

    for (let i = 0; i < gg.items.length; i++) {
      const it: any = gg.items[i] as any;
      if (it && it.items) {
        const child = emitGroup(it as Group, `${p}.${i}`);
        const wrapped: Emit = {
          code: `(${child.code})`,
          spans: child.spans.map(sp => ({ ...sp, start: sp.start + 1, end: sp.end + 1 })),
          meta: child.meta,
        };
        groupEmits.push(wrapped);
      } else {
        clauseEmits.push(emitClause(it as Clause, `${p}.${i}`));
      }
    }

    const writeList = (list: Emit[], joiner: string, paren: boolean): Emit => {
      if (list.length === 0) return lit("");
      let acc: Emit = paren ? lit("(") : lit("");
      list.forEach((e, idx) => {
        const offset = acc.code.length;
        acc = join(acc, { code: e.code, spans: e.spans.map(sp => ({ ...sp, start: sp.start + offset, end: sp.end + offset })), meta: e.meta });
        if (idx < list.length - 1) acc = join(acc, lit(joiner));
      });
      if (paren) acc = join(acc, lit(")"));
      return acc;
    };

    const clausesBlock = writeList(clauseEmits, clauseJoiner, clauseEmits.length > 0);
    const groupsBlock  = writeList(groupEmits,  groupJoiner,  groupEmits.length  > 0);

    let expr: Emit;
    if (clausesBlock.code && groupsBlock.code) {
      expr = join(join(clausesBlock, lit(" && ")), groupsBlock);
    } else if (clausesBlock.code) {
      expr = clausesBlock;
    } else if (groupsBlock.code) {
      expr = groupsBlock;
    } else {
      expr = lit("true");
    }

    const full: Span = { start: 0, end: expr.code.length, path: p, kind: "group" };
    const meta: SpanMeta = {
      path: p, kind: "group", depth: depth(p),
      op: gg.op, groupOp: (gg.groupOp ?? gg.op),
      clauseCount: clauseEmits.length, groupCount: groupEmits.length
    };
    return { code: expr.code, spans: [full].concat(expr.spans), meta: { [p]: meta, ...expr.meta } };
  };

  return emitGroup(g, path);
}

function header(state: BuilderState, expr: string, desc: string) {
  const now = new Date().toISOString();
  return `using System;
using System.Collections.Generic;
using Forseti.Policies;

namespace Forseti.Policies
{
    /// <summary>
    /// Generated policy: ${state.entryType}
    /// SDK Version: ${state.sdkVersion}
    /// Generated on: ${now}
    /// </summary>
    public sealed class ${state.entryType} : IPolicy
    {
        public bool Evaluate(RequestContext ctx)
        {
            if (ctx == null) return false;
            return ${expr};
        }

        /// <summary>
        /// Helper method for debugging - returns human-readable policy description
        /// </summary>
        public string GetDescription()
        {
            return "${desc.replace(/"/g, '\\"')}";
        }
    }
}`;
}

export function explainPolicyEnhanced(root: Group): string {
  const walk = (g: Group): string => {
    const clauses: string[] = [];
    const groups: string[] = [];
    for (const it of g.items) {
      if ((it as any).items) groups.push(walk(it as Group));
      else {
        const c = it as Clause;
        const subj = c.kind === "claim" && c.key ? `"${c.key}"` : c.kind;
        const verb = c.op === "eq" ? "equals" : c.op === "neq" ? "does not equal" : c.op === "contains" ? "contains" : "starts with";
        clauses.push(`${subj} ${verb} "${c.value}"`);
      }
    }
    const clauseTxt = clauses.length ? `(${clauses.join(g.op === "AND" ? " AND " : " OR ")})` : "";
    const groupTxt = groups.length ? `(${groups.join((g.groupOp ?? g.op) === "AND" ? " AND " : " OR ")})` : "";
    if (clauseTxt && groupTxt) return `(${clauseTxt} AND ${groupTxt})`;
    return clauseTxt || groupTxt || "always true";
  };
  return walk(root);
}

export function generateEnhancedCSharpCode(state: BuilderState): string {
  const { code } = buildExpr(state.root, "0");
  return header(state, code, explainPolicyEnhanced(state.root));
}

export function generateCSharpWithMap(state: BuilderState): { code: string; spans: Span[]; meta: Record<string, SpanMeta> } {
  const exprBuilt = buildExpr(state.root, "0");
  const marker = "/*__FORS_EXPR_START__*/";
  const codeWithMarker = header(state, marker + exprBuilt.code, explainPolicyEnhanced(state.root));
  const start = codeWithMarker.indexOf(marker);
  const code = codeWithMarker.replace(marker, "");
  const offsetSpans = exprBuilt.spans.map(s => ({ ...s, start: s.start + start, end: s.end + start }));
  return { code, spans: offsetSpans, meta: exprBuilt.meta };
}
