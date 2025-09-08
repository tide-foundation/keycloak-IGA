import {
  Button,
  PageSection,
  ToolbarItem,
  AlertVariant,
} from "@patternfly/react-core";
import { PlusCircleIcon } from "@patternfly/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";

import {
  KeycloakDataTable,
  KeycloakSpinner,
  ListEmptyState,
  useAlerts,
} from "@keycloak/keycloak-ui-shared";
import { useRealm } from "../../../context/realm-context/RealmContext";
import { useForsetiRoutes } from "../../hooks/useForsetiData";
import { useForsetiApi } from "../../hooks/useForsetiApi";
import { toRouteDetail } from "../../routes/Routes";
import type { ForsetiPolicyRoute } from "../../types";

export default function RoutesSection() {
  const { t } = useTranslation();
  const { realm } = useRealm();
  const navigate = useNavigate();
  const { addAlert, addError } = useAlerts();
  const api = useForsetiApi();

  const [key, setKey] = useState(0);
  const refresh = () => setKey((value) => value + 1);

  const { data: routes = [], isLoading } = useForsetiRoutes();

  // TIDECLOAK IMPLEMENTATION START
  const handleDelete = async (route: ForsetiPolicyRoute) => {
    try {
      await api.deleteRoute(route.id);
      addAlert(t("forseti.routeDeleteSuccess"), AlertVariant.success);
      refresh();
    } catch (error) {
      addError("forseti.routeDeleteError", error);
    }
  };
  // TIDECLOAK IMPLEMENTATION END

  if (isLoading) {
    return <KeycloakSpinner />;
  }

  return (
    <PageSection variant="light">
      <KeycloakDataTable
        key={key}
        loader={() => Promise.resolve(routes)}
        ariaLabelKey="forseti.routes"
        searchPlaceholderKey="common.search"
        toolbarItem={
          <ToolbarItem>
            <Button
              data-testid="create-route"
              variant="primary"
              onClick={() => navigate(`/${realm}/forseti/routes/new`)}
            >
              <PlusCircleIcon className="pf-v5-u-mr-sm" />
              {t("forseti.createRoute")}
            </Button>
          </ToolbarItem>
        }
        actions={[
          {
            title: t("common.edit"),
            onRowClick: (route: ForsetiPolicyRoute) =>
              navigate(toRouteDetail({ realm, id: route.id.toString() }).pathname!),
          },
          {
            title: t("common.delete"),
            onRowClick: (route: ForsetiPolicyRoute) => handleDelete(route),
          },
        ]}
        columns={[
          {
            name: "order",
            displayKey: "forseti.order",
            cellRenderer: (route: ForsetiPolicyRoute) => route.order.toString(),
          },
          {
            name: "vvkId",
            displayKey: "forseti.vvkid",
            cellRenderer: (route: ForsetiPolicyRoute) => route.vvkId,
          },
          {
            name: "resourcePattern",
            displayKey: "forseti.resourcePattern",
            cellRenderer: (route: ForsetiPolicyRoute) => (
              <code className="pf-v5-u-font-family-monospace-sm">
                {route.resourcePattern}
              </code>
            ),
          },
          {
            name: "action",
            displayKey: "forseti.action",
            cellRenderer: (route: ForsetiPolicyRoute) => (
              <code className="pf-v5-u-font-family-monospace-sm">
                {route.action}
              </code>
            ),
          },
          {
            name: "authCombiner",
            displayKey: "forseti.authCombiner",
            cellRenderer: (route: ForsetiPolicyRoute) => (
              <span>
                {route.authCombiner}
                {route.authThresholdK && ` (K=${route.authThresholdK})`}
              </span>
            ),
          },
          {
            name: "signCombiner",
            displayKey: "forseti.signCombiner",
            cellRenderer: (route: ForsetiPolicyRoute) => (
              <span>
                {route.signCombiner}
                {route.signThresholdK && ` (K=${route.signThresholdK})`}
              </span>
            ),
          },
          {
            name: "overallCombiner",
            displayKey: "forseti.overallCombiner",
            cellRenderer: (route: ForsetiPolicyRoute) => route.overallCombiner,
          },
          {
            name: "itemsCount",
            displayKey: "forseti.itemsCount",
            cellRenderer: (route: ForsetiPolicyRoute) => (route.items?.length || 0).toString(),
          },
          {
            name: "active",
            displayKey: "forseti.active",
            cellRenderer: (route: ForsetiPolicyRoute) => (route.active ? t("common.yes") : t("common.no")),
          },
        ]}
        emptyState={
          <ListEmptyState
            message={t("forseti.noRoutes")}
            instructions={t("forseti.noRoutesInstructions")}
            primaryActionText={t("forseti.createRoute")}
            onPrimaryAction={() => navigate(`/${realm}/forseti/routes/new`)}
          />
        }
      />
    </PageSection>
  );
}