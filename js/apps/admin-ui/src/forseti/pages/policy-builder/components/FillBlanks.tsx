import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  FormGroup,
  TextInput,
  Alert,
  Chip,
  ChipGroup,
  Divider,
  Text as PFText,
} from "@patternfly/react-core";
import { useEffect, useMemo, useState } from "react";
import type { BuilderState, Group, Clause } from "../../../types/policy-builder-types";
import { useTranslation } from "react-i18next";

interface Props {
  state: BuilderState;
  onChange: (state: BuilderState) => void;
}

/**
 * Fill-in-the-blanks assist: scans all clause values for ${placeholders}
 * and renders a small form to populate them. Changes are applied to the AST.
 */
export function FillBlanks({ state, onChange }: Props) {
  const { t } = useTranslation();
  const names = useMemo(() => Array.from(scanPlaceholders(state)), [state]);
  const [params, setParams] = useState<Record<string, string>>({});

  // Sync param keys with detected placeholders
  useEffect(() => {
    setParams((old) => {
      const next: Record<string, string> = { ...old };
      for (const n of names) if (!(n in next)) next[n] = "";
      for (const k of Object.keys(next)) if (!names.includes(k)) delete next[k];
      return next;
    });
  }, [names]);

  // Apply replacement when params change
  useEffect(() => {
    const replaced = applyParams(state, params);
    onChange(replaced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  const conditions = useMemo(() => summarize(replaceNode(state.root, params)), [state, params]);

  return (
    <Card className="pf-v5-u-box-shadow-md">
      <CardHeader>
        <CardTitle className="pf-v5-u-font-size-lg"><span className="pf-v5-u-mr-sm pf-v5-u-vertical-align-middle"><svg className="pf-v5-svg" width="16" height="16" viewBox="0 0 512 512" aria-hidden="true"><path d="M255.8 8c-36.5 0-66.2 29.8-66.2 66.2 0 8.8 7.2 16 16 16h17.8c9.6 0 17.4 7.8 17.4 17.4v17.8c0 8.8 7.2 16 16 16h17.8c9.6 0 17.4 7.8 17.4 17.4v17.8c0 8.8 7.2 16 16 16h66.7c17.7 0 32 14.3 32 32V416c0 17.7-14.3 32-32 32H96c-17.7 0-32-14.3-32-32V224c0-17.7 14.3-32 32-32h66.7c8.8 0 16-7.2 16-16v-17.8c0-9.6 7.8-17.4 17.4-17.4h17.8c8.8 0 16-7.2 16-16V107.6c0-9.6 7.8-17.4 17.4-17.4H306c8.8 0 16-7.2 16-16C322.2 37.8 292.4 8 255.8 8z"/></svg></span> {t("forseti.policyBuilder.fillBlanks", "Fill in the blanks")}</CardTitle>
      </CardHeader>
      <CardBody className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
        {names.length === 0 ? (
          <Alert isInline variant="info" title={t("forseti.policyBuilder.noPlaceholders", "No placeholders found")}>
            {t("forseti.policyBuilder.noPlaceholdersHint", "This template doesn't require any extra values.")}
          </Alert>
        ) : (
          names.map((n) => (
            <FormGroup key={n} fieldId={`fb-${n}`} label={pretty(n)}>
              <TextInput
                id={`fb-${n}`}
                aria-label={pretty(n)}
                value={params[n] ?? ""}
                onChange={(_, v) => setParams((p) => ({ ...p, [n]: String(v) }))}
                placeholder={`${t("enter", "Enter")} ${pretty(n)}`}
              />
            </FormGroup>
          ))
        )}

        <Divider />

        <PFText component="h4" className="pf-v5-u-font-size-md pf-v5-u-mb-sm">
          {t("forseti.policyBuilder.previewConditions", "Preview conditions")}
        </PFText>
        <ChipGroup>
          {conditions.map((c, i) => (
            <Chip key={i} isReadOnly>
              {c}
            </Chip>
          ))}
        </ChipGroup>
      </CardBody>
    </Card>
  );
}

function scanPlaceholders(state: BuilderState): Set<string> {
  const set = new Set<string>();
  const re = /\$\{([^}]+)\}/g;
  const walk = (n: Group | Clause) => {
    if (isGroup(n)) n.items.forEach(walk);
    else {
      let m: RegExpExecArray | null;
      while ((m = re.exec(n.value))) set.add(m[1]);
    }
  };
  walk(state.root);
  return set;
}

function applyParams(state: BuilderState, params: Record<string, string>): BuilderState {
  return {
    entryType: state.entryType,
    sdkVersion: state.sdkVersion,
    root: replaceNode(state.root, params) as Group,
  };
}

function replaceNode(node: Group | Clause, params: Record<string, string>): Group | Clause {
  const replace = (s: string) => s.replace(/\$\{([^}]+)\}/g, (_, k) => (params[k] ?? ""));
  if (isGroup(node)) {
    return { op: node.op, items: node.items.map((i) => replaceNode(i as any, params)) } as Group;
  }
  return { ...node, value: replace(node.value) } as Clause;
}

function summarize(root: Group | Clause): string[] {
  const out: string[] = [];
  const walk = (n: Group | Clause) => {
    if (isGroup(n)) n.items.forEach(walk);
    else {
      const subj = n.kind === "claim" && n.key ? `${n.key} claim` : n.kind;
      const verb = n.op === "eq" ? "equals" : n.op === "neq" ? "≠" : n.op === "contains" ? "contains" : "starts with";
      out.push(`${subj} ${verb} "${n.value}"`);
    }
  };
  walk(root);
  return out;
}

function isGroup(x: Group | Clause): x is Group {
  return (x as Group).items !== undefined;
}

function pretty(k: string) {
  return k.replace(/[._-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase());
}
