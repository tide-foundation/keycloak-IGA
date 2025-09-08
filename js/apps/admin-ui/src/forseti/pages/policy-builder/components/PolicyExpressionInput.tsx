import {
  Card,
  CardTitle,
  CardBody,
  CardHeader,
  FormGroup,
  TextArea,
  Button,
  Alert,
  ExpandableSection,
  List,
  ListItem,
  Text as PFText,
  Badge,
  Chip,
  ChipGroup,
  FormSelect,
  FormSelectOption,
  TextInput,
  ClipboardCopy,
  Divider,
} from "@patternfly/react-core";
import {
  LightbulbIcon,
  CheckCircleIcon,
  ExclamationTriangleIcon,
  InfoCircleIcon,
} from "@patternfly/react-icons";
import { useState, useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { useDebounceCallback } from "usehooks-ts";
import {
  NaturalLanguageParser,
  syncAstToNaturalLanguage,
  syncNaturalLanguageToAst,
} from "../../../utils/natural-language-parser";
import type {
  BuilderState,
  Group,
  Clause,
  PolicyTemplate,
} from "../../../types/policy-builder-types";
import { DEFAULT_POLICY_TEMPLATES } from "../../../utils/policy-templates";

interface PolicyExpressionInputProps {
  state: BuilderState;
  onChange: (state: BuilderState) => void;
  templates?: PolicyTemplate[];
}

export function PolicyExpressionInput({
  state,
  onChange,
  templates = DEFAULT_POLICY_TEMPLATES,
}: PolicyExpressionInputProps) {
  const { t } = useTranslation();

  // Template selection / parameters
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>(() => {
    const match = templates.find((t) => t.state.entryType === state.entryType);
    return match?.id ?? templates[0]?.id ?? "";
  });

  const placeholderNames = useMemo(
    () => Array.from(detectPlaceholdersInState(state)),
    [state]
  );
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    setParams((old) => {
      const next: Record<string, string> = { ...old };
      for (const name of placeholderNames) if (!(name in next)) next[name] = "";
      for (const k of Object.keys(next)) if (!placeholderNames.includes(k)) delete next[k];
      return next;
    });
  }, [placeholderNames]);

  const selectedTemplate = useMemo(
    () => templates.find((t) => t.id === selectedTemplateId),
    [templates, selectedTemplateId]
  );

  const applyTemplate = useCallback(
    (template: PolicyTemplate) => onChange(cloneState(template.state)),
    [onChange]
  );

  // Natural language sync
  const [expression, setExpression] = useState("");
  const [showExamples, setShowExamples] = useState(false);
  const [isUpdatingFromAst, setIsUpdatingFromAst] = useState(false);

  useEffect(() => {
    if (!isUpdatingFromAst) setExpression(syncAstToNaturalLanguage(state));
    setIsUpdatingFromAst(false);
  }, [state, isUpdatingFromAst]);

  const debouncedParse = useDebounceCallback((newExpression: string) => {
    if (newExpression !== expression) {
      setIsUpdatingFromAst(true);
      const newState = syncNaturalLanguageToAst(newExpression, state);
      onChange(newState);
    }
  }, 300);

  const handleExpressionChange = useCallback(
    (value: string) => {
      setExpression(value);
      debouncedParse(value);
    },
    [debouncedParse]
  );

  const validation = useMemo(() => NaturalLanguageParser.validate(expression), [expression]);
  const examples = useMemo(() => NaturalLanguageParser.getExamples(), []);
  const currentConditions = useMemo(() => listReadableConditions(state), [state]);
  const parametrizedState = useMemo(() => replacePlaceholdersInState(state, params), [state, params]);
  const csharpCode = useMemo(() => astToCSharp(parametrizedState), [parametrizedState]);

  const handleExampleClick = useCallback((ex: string) => {
    handleExpressionChange(ex);
    setShowExamples(false);
  }, [handleExpressionChange]);

  const handleClear = useCallback(() => handleExpressionChange(""), [handleExpressionChange]);

  const handleParamChange = useCallback((k: string, v: string) => {
    setParams((p) => ({ ...p, [k]: v }));
  }, []);

  const handleTemplateChange = useCallback((v: string) => {
    setSelectedTemplateId(v);
    const t = templates.find((x) => x.id === v);
    if (t) applyTemplate(t);
  }, [templates, applyTemplate]);

  return (
    <Card className="pf-v5-u-box-shadow-md">
      <CardHeader>
        <div className="pf-v5-u-display-flex pf-v5-u-justify-content-space-between pf-v5-u-align-items-center pf-v5-u-w-100">
          <CardTitle className="pf-v5-u-font-size-lg">💬 Natural Language Policy + Template Assist</CardTitle>
          <div className="pf-v5-u-display-flex pf-v5-u-gap-sm">
            <Button variant="link" icon={<LightbulbIcon />} onClick={() => setShowExamples((s) => !s)} size="sm">
              {t("examples", "Examples")}
            </Button>
            <Button variant="link" onClick={handleClear} size="sm" isDisabled={!expression}>
              {t("clear", "Clear")}
            </Button>
          </div>
        </div>
      </CardHeader>

      <CardBody className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
        <PFText component="p" className="pf-v5-u-color-200">
          {t("forseti.policyBuilder.assistCopy", "Choose a template and fill the blanks, or type in plain English. We’ll keep everything in sync.")}
        </PFText>

        {templates.length > 0 && (
          <FormGroup label={t("forseti.policyBuilder.template", "Template")} fieldId="policy-template">
            <FormSelect id="policy-template" value={selectedTemplateId} onChange={(_, v) => handleTemplateChange(String(v))}>
              {templates.map((t) => (
                <FormSelectOption key={t.id} value={t.id} label={`${t.icon || "📄"} ${t.name}`} />
              ))}
            </FormSelect>
            {selectedTemplate && (
              <PFText component="small" className="pf-v5-u-color-200 pf-v5-u-mt-xs">
                {selectedTemplate.description}
              </PFText>
            )}
          </FormGroup>
        )}

        {placeholderNames.length > 0 && (
          <div className="pf-v5-u-background-color-100 pf-v5-u-border-radius-sm pf-v5-u-p-md">
            <PFText component="h4" className="pf-v5-u-mb-sm pf-v5-u-font-size-sm pf-v5-u-font-weight-bold">
              {t("forseti.policyBuilder.fillBlanks", "Fill in the blanks")}
            </PFText>
            <div className="pf-v5-u-grid pf-m-gutter">
              {placeholderNames.map((name) => (
                <FormGroup key={name} label={readableKey(name)} fieldId={`param-${name}`}>
                  <TextInput id={`param-${name}`} aria-label={readableKey(name)} value={params[name] ?? ""} onChange={(_, v) => handleParamChange(name, String(v))} placeholder={`${t("enter", "Enter")} ${readableKey(name)}`} />
                </FormGroup>
              ))}
            </div>
          </div>
        )}

        <FormGroup label={t("forseti.policyBuilder.expression", "Policy Expression")} fieldId="policy-expression">
          <TextArea
            id="policy-expression"
            aria-label={t("forseti.policyBuilder.expressionAria", "Policy expression")}
            value={expression}
            onChange={(_, value) => handleExpressionChange(String(value))}
            placeholder='Try: "allow only GET" or "claim role equals admin"'
            rows={3}
            className="pf-v5-u-font-family-monospace"
            validated={validation.isValid ? "default" : "error"}
          />
        </FormGroup>

        {currentConditions.length > 0 && (
          <div className="pf-v5-u-p-md pf-v5-u-background-color-100 pf-v5-u-border-radius-sm">
            <PFText component="h4" className="pf-v5-u-mb-sm pf-v5-u-font-size-sm pf-v5-u-font-weight-bold">
              {t("forseti.policyBuilder.currentConditions", "Current Conditions")} ({state.root.op})
            </PFText>
            <ChipGroup>
              {currentConditions.map((condition, index) => (
                <Chip key={index} isReadOnly>
                  {condition}
                </Chip>
              ))}
            </ChipGroup>
          </div>
        )}

        {!validation.isValid && validation.errors.length > 0 && (
          <Alert variant="danger" title={t("invalidExpression", "Invalid Expression")} isInline className="pf-v5-u-mb-md">
            <List>
              {validation.errors.map((error, index) => (
                <ListItem key={index}>{error}</ListItem>
              ))}
            </List>
          </Alert>
        )}
        {validation.suggestions.length > 0 && (
          <Alert variant="info" title={t("suggestions", "Suggestions")} isInline customIcon={<InfoCircleIcon />}>
            <List>
              {validation.suggestions.map((suggestion, index) => (
                <ListItem key={index}>{suggestion}</ListItem>
              ))}
            </List>
          </Alert>
        )}

        <div className="pf-v5-u-display-flex pf-v5-u-gap-sm pf-v5-u-align-items-center">
          {validation.isValid ? (
            <Badge screenReaderText={t("validExpression", "Valid expression")} className="pf-v5-u-background-color-success pf-v5-u-color-light-100">
              <CheckCircleIcon className="pf-v5-u-mr-xs" />
              {t("valid", "Valid")}
            </Badge>
          ) : (
            <Badge screenReaderText={t("invalidExpression", "Invalid expression")} className="pf-v5-u-background-color-warning pf-v5-u-color-dark-100">
              <ExclamationTriangleIcon className="pf-v5-u-mr-xs" />
              {t("needsAttention", "Needs attention")}
            </Badge>
          )}
          {expression && (
            <PFText component="small" className="pf-v5-u-color-200">
              {state.root.items.length} {t("conditionsParsed", "condition(s) parsed")}
            </PFText>
          )}
        </div>

        <Divider />

        <ExpandableSection toggleText={t("forseti.policyBuilder.showCSharp", "Show C# preview")} isExpanded>
          <FormGroup label={t("forseti.policyBuilder.generatedCSharp", "Generated C# (read-only)")} fieldId="csharp-preview">
            <ClipboardCopy isReadOnly variant="expansion" hoverTip={t("copy", "Copy")} clickTip={t("copied", "Copied")}>
              {csharpCode}
            </ClipboardCopy>
          </FormGroup>
        </ExpandableSection>
      </CardBody>
    </Card>
  );
}

function detectPlaceholdersInString(s: string): Set<string> {
  const names = new Set<string>();
  const re = /\$\{([^}]+)\}/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s))) names.add(m[1]);
  return names;
}

function detectPlaceholdersInState(state: BuilderState): Set<string> {
  const names = new Set<string>();
  const visit = (node: Group | Clause) => {
    if (isGroup(node)) node.items.forEach(visit);
    else detectPlaceholdersInString(node.value).forEach((n) => names.add(n));
  };
  visit(state.root);
  return names;
}

function replacePlaceholdersInState(state: BuilderState, params: Record<string, string>): BuilderState {
  const replace = (value: string) => value.replace(/\$\{([^}]+)\}/g, (_, k) => (params[k] ?? "").toString());
  const cloneNode = (node: Group | Clause): Group | Clause => {
    if (isGroup(node)) return { op: node.op, items: node.items.map(cloneNode) } as Group;
    const c = node as Clause;
    return { kind: c.kind, key: c.key, op: c.op, value: replace(c.value) } as Clause;
  };
  return { entryType: state.entryType, sdkVersion: state.sdkVersion, root: cloneNode(state.root) as Group };
}

function listReadableConditions(state: BuilderState): string[] {
  const conditions: string[] = [];
  const extract = (node: Group | Clause) => {
    if (isGroup(node)) node.items.forEach(extract);
    else {
      const subject = node.kind === "claim" && node.key ? `${node.key} claim` : node.kind;
      const verb = node.op === "eq" ? "equals" : node.op === "neq" ? "≠" : node.op === "contains" ? "contains" : node.op === "starts" ? "starts with" : node.op;
      conditions.push(`${subject} ${verb} "${node.value}"`);
    }
  };
  extract(state.root);
  return conditions;
}

function isGroup(x: Group | Clause): x is Group {
  return (x as Group).items !== undefined;
}

function readableKey(k: string) {
  return k.replace(/[.\_\-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}

function cloneState(s: BuilderState): BuilderState {
  return JSON.parse(JSON.stringify(s)) as BuilderState;
}

function astToCSharp(state: BuilderState): string {
  const fullName = state.entryType || "Forseti.Policies.GeneratedPolicy";
  const dot = fullName.lastIndexOf(".");
  const ns = dot > 0 ? fullName.slice(0, dot) : "Forseti.Policies";
  const cls = dot > 0 ? fullName.slice(dot + 1) : fullName;
  const body = emitGroup(state.root);
  return `using System;
using System.Collections.Generic;

namespace ${ns}
{
    public interface IPolicy
    {
        bool Evaluate(RequestContext ctx);
    }

    public sealed class RequestContext
    {
        public string Method { get; }
        public string Path { get; }
        public IReadOnlyDictionary<string, string> Claims { get; }

        public RequestContext(string method, string path, IReadOnlyDictionary<string, string> claims)
        {
            Method = method ?? string.Empty;
            Path = path ?? string.Empty;
            Claims = claims ?? new Dictionary<string, string>();
        }

        public string GetClaim(string key) => Claims.TryGetValue(key, out var v) ? v : string.Empty;
    }

    public sealed class ${cls} : IPolicy
    {
        public bool Evaluate(RequestContext ctx)
        {
            return ${body};
        }
    }
}`;
}

function emitGroup(g: Group): string {
  if (!g.items || g.items.length === 0) return "false";
  const op = g.op === "AND" ? "&&" : "||";
  const parts = g.items.map((n) => (isGroup(n) ? `(${emitGroup(n)})` : emitClause(n as Clause)));
  return parts.length === 1 ? parts[0] : parts.join(` ${op} `);
}

function emitClause(c: Clause): string {
  const lit = csString(c.value);
  switch (c.kind) {
    case "method":
      return emitStringOp(`ctx.Method`, c.op, lit, true);
    case "path":
      return emitStringOp(`ctx.Path`, c.op, lit, false);
    case "claim":
      return emitStringOp(`ctx.GetClaim(${csString(c.key ?? "")})`, c.op, lit, false);
    default:
      return "false";
  }
}

function emitStringOp(lhs: string, op: Clause["op"], rhs: string, caseInsensitive: boolean): string {
  const eq = `string.Equals(${lhs}, ${rhs}, ${caseInsensitive ? "StringComparison.OrdinalIgnoreCase" : "StringComparison.Ordinal"})`;
  const contains = `${lhs}.Contains(${rhs}, StringComparison.Ordinal)`;
  const starts = `${lhs}.StartsWith(${rhs}, StringComparison.Ordinal)`;
  switch (op) {
    case "eq": return eq;
    case "neq": return `!(${eq})`;
    case "contains": return contains;
    case "starts": return starts;
    default: return "false";
  }
}

function csString(s: string | undefined): string {
  const v = (s ?? "").replace(/\\/g, "\\\\").replace(/"/g, '\\"');
  return `"${v}"`;
}
