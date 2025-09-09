import {
  Card, CardHeader, CardTitle, CardBody, CodeBlock, CodeBlockCode, ClipboardCopy,
  Text as PFText, Switch, Tooltip, Radio
} from "@patternfly/react-core";
import { CodeIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import { generateCSharpWithMap, Span } from "../../../utils/enhanced-codegen";
import type { BuilderState } from "../../../types/policy-builder-types";
import React from "react";

type HLMode = "groups" | "clauses";

function hashColor(seed: string, offset=0): { bg: string; outline: string } {
  let h = 0;
  for (let i=0;i<seed.length;i++) h = (h*31 + seed.charCodeAt(i)) >>> 0;
  const hue = (h + offset*37) % 360;
  const bg = `hsla(${hue}, 85%, 80%, .22)`;
  const outline = `2px solid hsla(${hue}, 85%, 45%, .55)`;
  return { bg, outline };
}

export function CodePreview({ state, highlightPath, onHoverPath, onSelectPath }: {
  state: BuilderState; highlightPath?: string | null; onHoverPath?: (p: string | null) => void; onSelectPath?: (p: string | null) => void;
}) {
  const { t } = useTranslation();
  const [showAll, setShowAll] = React.useState(false);
  const [hovered, setHovered] = React.useState<string | null>(null);
  const [mode, setMode] = React.useState<HLMode>("groups");

  const mapped = generateCSharpWithMap(state);
  const code = mapped.code;
  const spans = mapped.spans;
  const meta = mapped.meta as any;

  const depth = (p: string) => (p === "0" ? 0 : p.split(".").length - 1);
  const kindSpan = (mode === "groups") ? spans.filter(s => s.kind === "group") : spans.filter(s => s.kind === "clause");

  const boundaries = new Set<number>([0, code.length]);
  kindSpan.forEach(s => { boundaries.add(s.start); boundaries.add(s.end); });
  const sorted = Array.from(boundaries).sort((a,b) => a-b);

  const chooseActive = (a: number, b: number) => {
    const active = kindSpan.filter(s => s.start < b && s.end > a);
    if (active.length === 0) return null;
    const pref = (highlightPath || hovered);
    if (pref) {
      const exact = active.find(s => s.path === pref);
      if (exact) return exact;
    }
    return active.reduce((best, s) => (depth(s.path) > depth(best.path) ? s : best), active[0]);
  };

  const legendItems = [
    { label: "Root", sample: hashColor("0") },
    { label: "L1", sample: hashColor("0.1") },
    { label: "L2+", sample: hashColor("0.1.1") },
  ];

  const nodes: React.ReactNode[] = [];
  for (let i = 0; i < sorted.length - 1; i++) {
    const a = sorted[i], b = sorted[i+1];
    if (a === b) continue;
    const text = code.slice(a, b);
    const active = chooseActive(a, b);
    const key = `seg-${i}-${a}-${b}`;

    if (!active) {
      nodes.push(<span key={key}>{text}</span>);
      continue;
    }

    const siblingPrefix = active.path.split(".").slice(0, -1).join(".") || "0";
    const myIndex = active.path.split(".").slice(-1)[0] || "0";
    const col = hashColor(siblingPrefix, parseInt(myIndex, 10) || 0);

    const painted = showAll || (highlightPath && active.path === highlightPath) || (hovered && active.path === hovered);
    const style: React.CSSProperties = painted ? { background: col.bg, outline: col.outline, padding: "0 .125rem", borderRadius: 2 } : {};

    const info = meta?.[active.path];
    const tooltip = info && info.kind === "group"
      ? `${info.path === "0" ? "Root" : "Group"} — clauses: ${info.clauseCount ?? 0}, subgroups: ${info.groupCount ?? 0} (clauses ${info.op}, groups ${info.groupOp})`
      : `Clause (${active.path})`;

    nodes.push(
      <Tooltip key={key} content={tooltip}>
        <span
          style={style}
          onMouseEnter={() => { setHovered(active.path); onHoverPath && onHoverPath(active.path); }}
          onMouseLeave={() => { setHovered(null); onHoverPath && onHoverPath(null); }}
          onClick={() => { onSelectPath && onSelectPath(active.path); }}
        >
          {text}
        </span>
      </Tooltip>
    );
  }

  return (
    <Card className="pf-v5-u-box-shadow-md">
      <CardHeader>
        <CardTitle className="pf-v5-u-font-size-lg"><CodeIcon className="pf-v5-u-mr-sm" />{t("forseti.policyBuilder.codePreview", "Generated C# Preview")}</CardTitle>
      </CardHeader>
      <CardBody className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
        <PFText component="small" className="pf-v5-u-color-200">
          {t("forseti.policyBuilder.codePreviewHint", "Hover code to see which group produced it. Click to pin/focus.")}
        </PFText>

        <div className="pf-v5-u-display-flex pf-v5-u-align-items-center pf-v5-u-gap-md pf-v5-u-flex-wrap">
          <Switch id="show-all-hl" label="Show all" isChecked={showAll} onChange={(_, v) => setShowAll(v)} />
          <div className="pf-v5-u-display-flex pf-v5-u-align-items-center pf-v5-u-gap-sm">
            {legendItems.map((it, i) => (
              <span key={i} style={{display:"inline-flex", alignItems:"center"}}>
                <span style={{width:12,height:12,background:it.sample.bg,outline:it.sample.outline,display:"inline-block",borderRadius:2,marginRight:6}} />
                {it.label}
              </span>
            ))}
          </div>
          <div className="pf-v5-u-display-flex pf-v5-u-align-items-center pf-v5-u-gap-sm pf-v5-u-ml-md">
            <PFText component="small" className="pf-v5-u-mr-sm">Highlight:</PFText>
            <Radio name="hl-mode" id="hl-groups" label="Groups" isChecked={mode==="groups"} onChange={() => setMode("groups")} />
            <Radio name="hl-mode" id="hl-clauses" label="Clauses" isChecked={mode==="clauses"} onChange={() => setMode("clauses")} />
          </div>
        </div>

        <CodeBlock style={{maxHeight: 520, overflow: "auto"}}>
          <CodeBlockCode>
            <span style={{whiteSpace:"pre-wrap", fontFamily:"var(--pf-v5-global--FontFamily--monospace)"}}>
              {nodes}
            </span>
          </CodeBlockCode>
        </CodeBlock>

        <ClipboardCopy isReadOnly isCode isExpanded variant="expansion" style={{whiteSpace:"pre-wrap"}}>{code}</ClipboardCopy>
      </CardBody>
    </Card>
  );
}
