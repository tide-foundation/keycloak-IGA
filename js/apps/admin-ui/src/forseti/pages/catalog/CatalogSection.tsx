import {
  PageSection,
} from "@patternfly/react-core";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  KeycloakDataTable,
  KeycloakSpinner,
  ListEmptyState,
} from "@keycloak/keycloak-ui-shared";
// TIDECLOAK IMPLEMENTATION START
import { usePolicyCatalog } from "../../hooks/useForsetiData";
import type { CatalogItem } from "../../types";
// TIDECLOAK IMPLEMENTATION END

export default function CatalogSection() {
  const { t } = useTranslation();

  const { data: policies = [], isLoading } = usePolicyCatalog();

  if (isLoading) {
    return <KeycloakSpinner />;
  }

  return (
    <PageSection variant="light">
      <KeycloakDataTable
        loader={() => Promise.resolve(policies)}
        ariaLabelKey="forseti.catalog"
        searchPlaceholderKey="common.search"
        columns={[
          {
            name: "policy",
            displayKey: "forseti.policy",
            cellRenderer: (item: CatalogItem) => item.policy,
          },
          {
            name: "sdkVersion",
            displayKey: "forseti.sdkVersion",
            cellRenderer: (item: CatalogItem) => item.sdkVersion,
          },
          {
            name: "entryType",
            displayKey: "forseti.entryType",
            cellRenderer: (item: CatalogItem) => (
              <code className="pf-v5-u-font-family-monospace-sm">
                {item.entryType}
              </code>
            ),
          },
          {
            name: "codeBh",
            displayKey: "forseti.codeBh",
            cellRenderer: (item: CatalogItem) => (
              <code className="pf-v5-u-font-family-monospace-sm">
                {item.codeBh.substring(0, 16)}...
              </code>
            ),
          },
        ]}
        emptyState={
          <ListEmptyState
            message={t("forseti.noPolicies")}
            instructions={t("forseti.noPoliciesInstructions")}
          />
        }
      />
    </PageSection>
  );
}