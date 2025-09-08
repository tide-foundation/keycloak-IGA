import {
  Alert,
  AlertVariant,
  Button,
  Form,
  FormGroup,
  PageSection,
  Tab,
  Tabs,
  TabTitleText,
  Title,
} from "@patternfly/react-core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";

import {
  FormErrorText,
  KeycloakSpinner,
  useAlerts,
} from "@keycloak/keycloak-ui-shared";
import { useRealm } from "../../../context/realm-context/RealmContext";
import { useForsetiRoute } from "../../hooks/useForsetiData";
import { useForsetiApi } from "../../hooks/useForsetiApi";
import { toRoutes } from "../../routes/Routes";

export default function RouteDetails() {
  const { t } = useTranslation();
  const { realm } = useRealm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addAlert, addError } = useAlerts();
  const api = useForsetiApi();

  const [activeTabKey, setActiveTabKey] = useState<string | number>(0);

  const { data: route, isLoading, error } = useForsetiRoute(id ? parseInt(id, 10) : undefined);

  const handleDelete = async () => {
    if (!route) return;
    
    try {
      await api.deleteRoute(route.id);
      addAlert(t("forseti.routeDeleteSuccess"), AlertVariant.success);
      navigate(toRoutes({ realm }).pathname!);
    } catch (error) {
      addError("forseti.routeDeleteError", error);
    }
  };

  if (isLoading) {
    return <KeycloakSpinner />;
  }

  if (error || !route) {
    return (
      <PageSection variant="light">
        <Alert variant={AlertVariant.danger} title={t("common.notFound")}>
          {t("forseti.routeNotFound")}
        </Alert>
      </PageSection>
    );
  }

  return (
    <PageSection variant="light">
      <div className="pf-v5-u-mb-lg">
        <Title headingLevel="h1" size="xl">
          {t("forseti.routeDetails")}
        </Title>
        <p className="pf-v5-u-mt-sm pf-v5-u-color-200">
          {route.vvkId} - {route.resourcePattern} {route.action}
        </p>
      </div>

      <Tabs
        activeKey={activeTabKey}
        onSelect={(_, tabIndex) => setActiveTabKey(tabIndex)}
        className="pf-v5-u-mb-lg"
      >
        <Tab eventKey={0} title={<TabTitleText>{t("forseti.basicInfo")}</TabTitleText>}>
          <Form className="pf-v5-u-mt-md">
            <FormGroup label={t("forseti.vvkid")} fieldId="vvkId">
              <span className="pf-v5-c-form-control">
                {route.vvkId}
              </span>
            </FormGroup>
            
            <FormGroup label={t("forseti.resourcePattern")} fieldId="resourcePattern">
              <code className="pf-v5-c-form-control pf-v5-u-font-family-monospace">
                {route.resourcePattern}
              </code>
            </FormGroup>
            
            <FormGroup label={t("forseti.action")} fieldId="action">
              <code className="pf-v5-c-form-control pf-v5-u-font-family-monospace">
                {route.action}
              </code>
            </FormGroup>
            
            <FormGroup label={t("forseti.order")} fieldId="order">
              <span className="pf-v5-c-form-control">
                {route.order}
              </span>
            </FormGroup>
            
            <FormGroup label={t("forseti.active")} fieldId="active">
              <span className="pf-v5-c-form-control">
                {route.active ? t("common.yes") : t("common.no")}
              </span>
            </FormGroup>
          </Form>
        </Tab>

        <Tab eventKey={1} title={<TabTitleText>{t("forseti.combiners")}</TabTitleText>}>
          <Form className="pf-v5-u-mt-md">
            <FormGroup label={t("forseti.authCombiner")} fieldId="authCombiner">
              <span className="pf-v5-c-form-control">
                {route.authCombiner}
                {route.authThresholdK && ` (K=${route.authThresholdK})`}
              </span>
            </FormGroup>
            
            <FormGroup label={t("forseti.signCombiner")} fieldId="signCombiner">
              <span className="pf-v5-c-form-control">
                {route.signCombiner}
                {route.signThresholdK && ` (K=${route.signThresholdK})`}
              </span>
            </FormGroup>
            
            <FormGroup label={t("forseti.overallCombiner")} fieldId="overallCombiner">
              <span className="pf-v5-c-form-control">
                {route.overallCombiner}
              </span>
            </FormGroup>
          </Form>
        </Tab>

        <Tab eventKey={2} title={<TabTitleText>{t("forseti.items")} ({route.items?.length || 0})</TabTitleText>}>
          <div className="pf-v5-u-mt-md">
            {route.items?.length > 0 ? (
              <div className="pf-v5-c-data-list">
                {route.items.map((item: any, index: number) => (
                  <div key={item.id || index} className="pf-v5-c-data-list__item">
                    <div className="pf-v5-c-data-list__item-content">
                      <div className="pf-v5-c-data-list__cell">
                        <strong>{item.stage}</strong> - {item.policy}
                        <br />
                        <small className="pf-v5-u-color-200">
                          {item.entryType} | {item.mode}
                        </small>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <Alert variant="info" title={t("forseti.noItems")} />
            )}
          </div>
        </Tab>
      </Tabs>

      <div className="pf-v5-u-mt-lg">
        <Button
          variant="danger"
          onClick={handleDelete}
          className="pf-v5-u-mr-md"
        >
          {t("common.delete")}
        </Button>
        <Button
          variant="secondary"
          onClick={() => navigate(toRoutes({ realm }).pathname!)}
        >
          {t("common.back")}
        </Button>
      </div>
    </PageSection>
  );
}