import {
  AlertGroup,
  Alert,
  AlertActionCloseButton,
  AlertVariant,
  ExpandableSection,
} from "@patternfly/react-core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import type { AlertEntry } from "./Alerts";

export type AlertPanelProps = {
  alerts: AlertEntry[];
  onCloseAlert: (id: number) => void;
};

export function AlertPanel({ alerts, onCloseAlert }: AlertPanelProps) {
  return (
    <AlertGroup
      data-testid="global-alerts"
      isToast
      style={{ whiteSpace: "pre-wrap" }}
    >
      {alerts.map(
        ({ id, variant, message, description, actionLinks }, index) => (
          <Alert
            key={id}
            data-testid={index === 0 ? "last-alert" : undefined}
            isLiveRegion
            variant={AlertVariant[variant]}
            component="p"
            variantLabel=""
            title={message}
            actionClose={
              <AlertActionCloseButton
                title={message}
                onClose={() => onCloseAlert(id)}
              />
            }
            // TIDECLOAK IMPLEMENTATION
            actionLinks={actionLinks}
          >
            {description && <p>{description}</p>}
          </Alert>
        ),
      )}
    </AlertGroup>
  );
}

type AlertItemProps = {
  alert: AlertEntry;
  isFirst: boolean;
  onClose: () => void;
};

function AlertItem({ alert, isFirst, onClose }: AlertItemProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  const { variant, message, description, code, traceId, source } = alert;
  const hasTideMetadata = Boolean(code || traceId || source);

  return (
    <Alert
      data-testid={isFirst ? "last-alert" : undefined}
      isLiveRegion
      variant={AlertVariant[variant]}
      component="p"
      variantLabel=""
      title={message}
      actionClose={
        <AlertActionCloseButton title={message} onClose={onClose} />
      }
    >
      {description && <p>{description}</p>}
      {hasTideMetadata && (
        <>
          {(code || traceId) && (
            <p data-testid="tide-error-code-line">
              {code && (
                <>
                  <strong>{t("errorCodeLabel")}:</strong> <code>{code}</code>
                </>
              )}
              {code && traceId && " — "}
              {traceId && (
                <>
                  <strong>{t("errorTraceLabel")}:</strong>{" "}
                  <code>{traceId}</code>
                </>
              )}
            </p>
          )}
          {source && (
            <ExpandableSection
              toggleText={
                expanded
                  ? t("errorHideDetails")
                  : t("errorShowDetails")
              }
              onToggle={(_event, isExpanded) => setExpanded(isExpanded)}
              isExpanded={expanded}
            >
              <p>
                <strong>{t("errorSourceLabel")}:</strong>{" "}
                <code>{source}</code>
              </p>
            </ExpandableSection>
          )}
        </>
      )}
    </Alert>
  );
}
