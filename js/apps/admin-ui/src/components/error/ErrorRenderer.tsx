import { NetworkError } from "@keycloak/keycloak-admin-client";
import {
  getTideErrorInfo,
  useEnvironment,
  type FallbackProps,
} from "@keycloak/keycloak-ui-shared";
import {
  Alert,
  AlertActionLink,
  AlertVariant,
  DescriptionList,
  DescriptionListDescription,
  DescriptionListGroup,
  DescriptionListTerm,
  PageSection,
} from "@patternfly/react-core";
import { useTranslation } from "react-i18next";

export const ErrorRenderer = ({ error }: FallbackProps) => {
  const { keycloak } = useEnvironment();
  const { t } = useTranslation();
  const isPermissionError =
    error instanceof NetworkError && error.response.status === 403;

  let message;
  if (isPermissionError) {
    message = t("forbiddenAdminConsole");
  } else {
    message = error.message;
  }

  // TIDECLOAK IMPLEMENTATION: surface standardised Tide error metadata.
  const info = !isPermissionError ? getTideErrorInfo(error) : undefined;
  const hasTideInfo = Boolean(info?.code);
  const title = hasTideInfo ? info!.displayMessage : message;

  return (
    <PageSection>
      <Alert
        isInline
        variant={AlertVariant.danger}
        title={title}
        actionLinks={
          isPermissionError ? (
            <AlertActionLink onClick={async () => await keycloak.logout()}>
              {t("signOut")}
            </AlertActionLink>
          ) : (
            <AlertActionLink onClick={() => location.reload()}>
              {t("reload")}
            </AlertActionLink>
          )
        }
      >
        {hasTideInfo && info && (
          <DescriptionList isCompact isHorizontal>
            {info.code && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t("errorCodeLabel")}</DescriptionListTerm>
                <DescriptionListDescription>
                  <code>{info.code}</code>
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
            {info.traceId && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t("errorTraceLabel")}</DescriptionListTerm>
                <DescriptionListDescription>
                  <code>{info.traceId}</code>
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
            {info.source && (
              <DescriptionListGroup>
                <DescriptionListTerm>{t("errorSourceLabel")}</DescriptionListTerm>
                <DescriptionListDescription>
                  <code>{info.source}</code>
                </DescriptionListDescription>
              </DescriptionListGroup>
            )}
          </DescriptionList>
        )}
      </Alert>
    </PageSection>
  );
};
