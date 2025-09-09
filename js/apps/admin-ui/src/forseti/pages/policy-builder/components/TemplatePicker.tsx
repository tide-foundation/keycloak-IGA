import {
  Card, CardTitle, CardBody, CardHeader, Gallery, Button, Text as PFText, TextContent,
  Badge, FormGroup, TextInput
} from "@patternfly/react-core";
import { TrashIcon, CodeIcon, KeyIcon, RouteIcon, ShieldAltIcon, FileCodeIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import type { PolicyTemplate } from "../../../types/policy-builder-types";
import { useMemo, useState } from "react";
import { DEFAULT_POLICY_TEMPLATES } from "../../../utils/policy-templates";

interface TemplatePickerProps {
  onTemplateSelect: (template: PolicyTemplate) => void;
  onReset: () => void;
}

export function TemplatePicker({ onTemplateSelect, onReset }: TemplatePickerProps) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");

  const items = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return DEFAULT_POLICY_TEMPLATES;
    return DEFAULT_POLICY_TEMPLATES.filter((tpl) =>
      [tpl.name, tpl.description, tpl.id, tpl.state.entryType].some((s) =>
        (s || "").toLowerCase().includes(q)
      )
    );
  }, [query]);

  return (
    <div className="pf-v5-u-p-xl">
      <div className="pf-v5-u-text-align-center pf-v5-u-mb-lg">
        <TextContent>
          <PFText component="h2" className="pf-v5-u-font-size-2xl pf-v5-u-mb-sm">
            {t("forseti.policyBuilder.chooseTemplate")}
          </PFText>
          <PFText component="p" className="pf-v5-u-color-200 pf-v5-u-font-size-lg">
            {t("forseti.policyBuilder.templateDescription")}
          </PFText>
        </TextContent>
      </div>

      <div className="pf-v5-u-display-flex pf-v5-u-justify-content-space-between pf-v5-u-align-items-end pf-v5-u-mb-md">
        <FormGroup fieldId="tp-search" label={t("common:search", "Search")}>
          <TextInput id="tp-search" value={query} onChange={(_, v) => setQuery(String(v))} aria-label="Search templates" />
        </FormGroup>
        <Button variant="link" icon={<TrashIcon />} onClick={onReset}>
          {t("forseti.policyBuilder.reset")}
        </Button>
      </div>

      <Gallery hasGutter>
        {items.map((template) => (
          <Card key={template.id} isSelectable isClickable onClick={() => onTemplateSelect(template)} className="pf-v5-u-h-100 pf-v5-u-box-shadow-sm">
            <CardHeader className="pf-v5-u-pb-sm">
              <CardTitle className="pf-v5-u-font-size-lg pf-v5-u-display-flex pf-v5-u-align-items-center">
                <span className="pf-v5-u-mr-sm"><TemplateIcon name={template.name} id={template.id} iconKey={template.icon} /></span>
                {template.name}
              </CardTitle>
            </CardHeader>
            <CardBody className="pf-v5-u-pt-0">
              <PFText component="p" className="pf-v5-u-color-200 pf-v5-u-mb-sm">{template.description}</PFText>
              <div className="pf-v5-u-display-flex pf-v5-u-gap-sm pf-v5-u-align-items-center">
                <Badge isRead>{template.state.entryType}</Badge>
                <Badge isRead>SDK {template.state.sdkVersion}</Badge>
              </div>
              <div className="pf-v5-u-mt-md">
                <Button variant="primary" onClick={() => onTemplateSelect(template)}>
                  {t("forseti.policyBuilder.useTemplate", "Use template")}
                </Button>
              </div>
            </CardBody>
          </Card>
        ))}
      </Gallery>
    </div>
  );
}

function TemplateIcon({ name, id, iconKey }: { name?: string; id?: string; iconKey?: string }) {
  const key = String(iconKey || "").toLowerCase();
  const nm = String(name || "").toLowerCase();
  const ident = String(id || "").toLowerCase();
  const pick = (s: string) =>
    s.includes("path") || s.includes("route") ? "route" :
    s.includes("claim") || s.includes("role") || s.includes("key") ? "key" :
    s.includes("policy") || s.includes("guard") || s.includes("shield") ? "shield" :
    s.includes("code") || s.includes("c#") || s.includes("csharp") ? "code" : "";
  const choice = pick(key) || pick(nm) || pick(ident) || "file";
  switch (choice) {
    case "route": return <RouteIcon />;
    case "key": return <KeyIcon />;
    case "shield": return <ShieldAltIcon />;
    case "code": return <CodeIcon />;
    default: return <FileCodeIcon />;
  }
}
