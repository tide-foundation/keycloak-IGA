import {
  PageSection,
  Title,
  Wizard,
  WizardStep,
  Alert,
  AlertActionCloseButton,
  Badge, Label,
} from "@patternfly/react-core";
import { useState, useEffect, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { TemplatePicker } from "./components/TemplatePicker";
import { RuleBuilder } from "./components/RuleBuilder";
import { CompileActions } from "./components/CompileActions";
import type { BuilderState, PolicyTemplate } from "../../types/policy-builder-types";
import { useAlerts } from "@keycloak/keycloak-ui-shared";

const STORAGE_KEY = "forseti-policy-builder-state";

const initialState: BuilderState = {
  entryType: "CustomPolicy",
  sdkVersion: "1.0.0",
  root: { op: "AND", items: [] },
};

export default function PolicyBuilderPage() {
  const { t } = useTranslation();
  const { addAlert } = useAlerts();
  const [currentStep, setCurrentStep] = useState(1);
  const [state, setState] = useState<BuilderState>(initialState);
  const [showResetAlert, setShowResetAlert] = useState(false);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try { setState(JSON.parse(saved)); } catch { /* ignore */ }
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state]);

  const handleTemplateSelect = useCallback((tpl: PolicyTemplate) => {
    setState(tpl.state);
    setCurrentStep(2);
    addAlert(t("forseti.policyBuilder.templateSelected", { name: tpl.name }));
  }, [addAlert, t]);

  const steps = [
    {
      id: 1,
      name: t("forseti.policyBuilder.steps.template"),
      component: <TemplatePicker onTemplateSelect={handleTemplateSelect} onReset={() => setShowResetAlert(true)} />,
    },
    {
      id: 2,
      name: t("forseti.policyBuilder.steps.rules"),
      component: <RuleBuilder state={state} onChange={setState} />,
      canJumpTo: state.entryType.length > 0,
    },
    {
      id: 3,
      name: t("forseti.policyBuilder.steps.compile"),
      component: <CompileActions state={state} />,
      canJumpTo: state.entryType.length > 0 && state.root.items.length > 0,
    },
  ];

  return (
    <div className="pf-v5-u-background-color-100 pf-v5-u-min-height-100vh">
      <PageSection variant="light" className="pf-v5-u-pb-0">
        <div className="pf-v5-u-display-flex pf-v5-u-justify-content-space-between pf-v5-u-align-items-start pf-v5-u-mb-lg">
          <div>
            <Title headingLevel="h1" size="2xl" className="pf-v5-u-mb-sm">{t("forseti.policyBuilder.title")}</Title>
            <p className="pf-v5-u-color-200 pf-v5-u-font-size-lg">{t("forseti.policyBuilder.description")}</p>
          </div>
          <div className="pf-v5-u-display-flex pf-v5-u-gap-sm">
            <Label color="blue" icon={null} aria-label={t("forseti.policyBuilder.currentStep", "Current step")} className="pf-v5-u-font-size-sm">
              {t("forseti.policyBuilder.stepXofY", "Step {{x}} of {{y}}", { x: currentStep, y: steps.length })}
            </Label>
          </div>
        </div>

        {showResetAlert && (
          <Alert
            variant="warning"
            title={t("forseti.policyBuilder.resetConfirmTitle")}
            className="pf-v5-u-mb-lg"
            actionClose={<AlertActionCloseButton onClose={() => setShowResetAlert(false)} />}
            actionLinks={<>
              <button className="pf-v5-c-button pf-v5-m-danger" onClick={() => { setState(initialState); setCurrentStep(1); localStorage.removeItem(STORAGE_KEY); setShowResetAlert(false); }}>
                {t("forseti.policyBuilder.resetConfirm")}
              </button>
              <button className="pf-v5-c-button pf-v5-m-link" onClick={() => setShowResetAlert(false)}>
                {t("cancel")}
              </button>
            </>}
          >
            {t("forseti.policyBuilder.resetWarning")}
          </Alert>
        )}
      </PageSection>

      <PageSection variant="default" className="pf-v5-u-pt-0">
        <div className="pf-v5-u-background-color-200 pf-v5-u-border-radius-lg pf-v5-u-box-shadow-lg">
          <Wizard height="auto" className="pf-v5-u-border-radius-lg" onStepChange={(_, current) => setCurrentStep(Number(current.id))}>
            {steps.map((s) => (
              <WizardStep key={s.id} id={s.id} name={s.name} isDisabled={s.canJumpTo === false}>
                <div className="pf-v5-u-min-height-500px">{currentStep === s.id && s.component}</div>
              </WizardStep>
            ))}
          </Wizard>
        </div>
      </PageSection>
    </div>
  );
}
