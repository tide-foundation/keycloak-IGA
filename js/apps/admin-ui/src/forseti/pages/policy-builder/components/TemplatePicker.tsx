import {
  Card,
  CardTitle,
  CardBody,
  CardHeader,
  Gallery,
  Button,
  Text as PFText,
  TextContent,
  Badge,
  FormGroup,
  TextInput,
  SearchInput
} from "@patternfly/react-core";
import { SearchIcon, TrashIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import { DEFAULT_POLICY_TEMPLATES } from "../../../utils/policy-templates";
import type { PolicyTemplate } from "../../../types/policy-builder-types";
import { useMemo, useState } from "react";

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
        <FormGroup fieldId="tp-search" label={t("search", "Search")}>
          <SearchInput
            id="tp-search"
            value={query}
            onChange={(_, v) => setQuery(v)}
            onClear={() => setQuery('')}
            aria-label="Search templates"
          />
        </FormGroup>
        <Button variant="link" icon={<TrashIcon />} onClick={onReset}>
          {t("forseti.policyBuilder.reset")}
        </Button>
      </div>

      <Gallery hasGutter minWidths={{ default: "300px", md: "360px" }}>
        {items.map((template) => (
          <Card
            key={template.id}
            isSelectable
            isClickable
            onClick={() => onTemplateSelect(template)}
            className="pf-v5-u-h-100 pf-v5-u-box-shadow-sm"
          >
            <CardHeader className="pf-v5-u-pb-sm">
              <CardTitle className="pf-v5-u-font-size-lg">
                <span className="pf-v5-u-mr-sm">{template.icon}</span>
                {template.name}
              </CardTitle>
            </CardHeader>
            <CardBody className="pf-v5-u-pt-0">
              <PFText component="p" className="pf-v5-u-color-200 pf-v5-u-mb-sm">
                {template.description}
              </PFText>
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
