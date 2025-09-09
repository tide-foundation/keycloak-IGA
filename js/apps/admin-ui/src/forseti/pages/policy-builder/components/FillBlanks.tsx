import {
  Card, CardHeader, CardTitle, CardBody, FormGroup, TextInput, Alert, Chip, ChipGroup, Divider,
  Text as PFText
} from "@patternfly/react-core";
import { PuzzlePieceIcon } from "@patternfly/react-icons";
import { useEffect, useMemo, useState } from "react";
import type { BuilderState, Group, Clause } from "../../../types/policy-builder-types";
import { useTranslation } from "react-i18next";

interface Props { state: BuilderState; onChange: (state: BuilderState) => void; }

export function FillBlanks({ state, onChange }: Props) {
  const { t } = useTranslation();
  const names = useMemo(() => Array.from(scanPlaceholders(state)), [state]);
  const [params, setParams] = useState<Record<string, string>>({});

  useEffect(() => {
    setParams((old) => {
      const next: Record<string, string> = { ...old };
      for (const n of names) if (!(n in next)) next[n] = "";
      for (const k of Object.keys(next)) if (!names.includes(k)) delete next[k];
      return next;
    });
  }, [names]);

  useEffect(() => {
    const replaced = applyParams(state, params);
    onChange(replaced);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  const conditions = useMemo(() => summarize(replaceNode(state.root, params)), [state, params]);

  return (
    <Card className="pf-v5-u-box-shadow-md">
      <CardHeader>
        <CardTitle className="pf-v5-u-font-size-lg"><PuzzlePieceIcon className="pf-v5-u-mr-sm" />{t("forseti.policyBuilder.fillBlanks", "Fill in the blanks")}</CardTitle>
      </CardHeader>
      <CardBody className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
        {names.length === 0 ? (
          <Alert isInline variant="info" title={t("forseti.policyBuilder.noPlaceholders", "No placeholders found")}>
            {t("forseti.policyBuilder.noPlaceholdersHint", "This template doesn't require any extra values.")}
          </Alert>
        ) : (
          names.map((n) => (
            <FormGroup key={n} fieldId={`fb-${n}`} label={pretty(n)}>
              <TextInput id={`fb-${n}`} aria-label={pretty(n)} value={params[n] ?? ""} onChange={(_, v) => setParams((p) => ({ ...p, [n]: String(v) }))} placeholder={`${t("common:enter", "Enter")} ${pretty(n)}`} />
            </FormGroup>
          ))
        )}

        <Divider />

        <PFText component="h4" className="pf-v5-u-font-size-md pf-v5-u-mb-sm">{t("forseti.policyBuilder.previewConditions", "Preview conditions")}</PFText>
        <ChipGroup>
          {conditions.map((c, i) => (<Chip key={i} isReadOnly>{c}</Chip>))}
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
    else { let m: RegExpExecArray | null; while ((m = re.exec(n.value))) set.add(m[1]); }
  };
  walk(state.root);
  return set;
}
function applyParams(state: BuilderState, params: Record<string, string>): BuilderState {
  return { entryType: state.entryType, sdkVersion: state.sdkVersion, root: replaceNode(state.root, params) as Group };
}
function replaceNode(node: Group | Clause, params: Record<string, string>): Group | Clause {
  const replace = (s: string) => s.replace(/\$\{([^}]+)\}/g, (_, k) => (params[k] ?? ""));
  if (isGroup(node)) return { op: node.op, groupOp: node.groupOp, items: node.items.map((i) => replaceNode(i as any, params)) } as Group;
  return { ...node, value: replace(node.value) } as Clause;
}
function summarize(root: Group | Clause): string[] {
  const out: string[] = [];
  const walk = (n: Group | Clause) => { if (isGroup(n)) n.items.forEach(walk); else { const subj = n.kind === "claim" && n.key ? `${n.key} claim` : n.kind; const verb = n.op === "eq" ? "equals" : n.op === "neq" ? "≠" : n.op === "contains" ? "contains" : "starts with"; out.push(`${subj} ${verb} "${n.value}"`); } };
  walk(root);
  return out;
}
function isGroup(x: Group | Clause): x is Group { return (x as Group).items !== undefined; }
function pretty(k: string) { return k.replace(/[._-]/g, " ").replace(/\b\w/g, (m) => m.toUpperCase()); }
