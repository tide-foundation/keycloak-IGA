import {
  Card,
  CardHeader,
  CardTitle,
  CardBody,
  CodeBlock,
  CodeBlockCode,
  ClipboardCopy,
  Text as PFText,
} from "@patternfly/react-core";
import { CodeIcon } from "@patternfly/react-icons";
import { useTranslation } from "react-i18next";
import { generateEnhancedCSharpCode } from "../../../utils/enhanced-codegen";
import type { BuilderState } from "../../../types/policy-builder-types";

export function CodePreview({ state }: { state: BuilderState }) {
  const { t } = useTranslation();
  const code = generateEnhancedCSharpCode(state);

  return (
    <Card className="pf-v5-u-box-shadow-md">
      <CardHeader>
        <CardTitle className="pf-v5-u-font-size-lg"><CodeIcon className="pf-v5-u-mr-sm" /> {t("forseti.policyBuilder.codePreview", "Generated C# Preview")}</CardTitle>
      </CardHeader>
      <CardBody className="pf-v5-u-display-flex pf-v5-u-flex-direction-column pf-v5-u-gap-md">
        <PFText component="small" className="pf-v5-u-color-200">
          {t("forseti.policyBuilder.codePreviewHint", "Copy and inspect the generated class before compiling.")}
        </PFText>
        <CodeBlock><CodeBlockCode>{code}</CodeBlockCode></CodeBlock>
        <ClipboardCopy isReadOnly variant="expansion">{code}</ClipboardCopy>
      </CardBody>
    </Card>
  );
}
