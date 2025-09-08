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
import { useForsetiManifests } from "../../hooks/useForsetiData";
import { useForsetiApi } from "../../hooks/useForsetiApi";
import { toManifestDetail } from "../../routes/Manifests";
import type { ForsetiPolicyManifest } from "../../types";

export default function ManifestsSection() {
  const { t } = useTranslation();
  const { realm } = useRealm();
  const navigate = useNavigate();
  const { addAlert, addError } = useAlerts();
  const api = useForsetiApi();

  const [key, setKey] = useState(0);
  const refresh = () => setKey((value) => value + 1);

  const { data: manifests = [], isLoading } = useForsetiManifests();

  // TIDECLOAK IMPLEMENTATION START
  const handleActivate = async (manifest: ForsetiPolicyManifest) => {
    try {
      await api.activateManifest(manifest.id);
      addAlert(t("forseti.manifestActivateSuccess"), AlertVariant.success);
      refresh();
    } catch (error) {
      addError("forseti.manifestActivateError", error);
    }
  };
  // TIDECLOAK IMPLEMENTATION END

  if (isLoading) {
    return <KeycloakSpinner />;
  }

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleString();
  };

  return (
    <PageSection variant="light">
      <KeycloakDataTable
        key={key}
        loader={() => Promise.resolve(manifests)}
        ariaLabelKey="forseti.manifests"
        searchPlaceholderKey="common.search"
        toolbarItem={
          <ToolbarItem>
            <Button
              data-testid="create-manifest"
              variant="primary"
              onClick={() => navigate(`/${realm}/forseti/manifests/new`)}
            >
              <PlusCircleIcon className="pf-v5-u-mr-sm" />
              {t("forseti.createManifest")}
            </Button>
          </ToolbarItem>
        }
        actions={[
          {
            title: t("common.view"),
            onRowClick: (manifest: ForsetiPolicyManifest) =>
              navigate(toManifestDetail({ realm, id: manifest.id.toString() }).pathname!),
          },
          {
            title: t("forseti.activate"),
            onRowClick: (manifest: ForsetiPolicyManifest) => handleActivate(manifest),
          },
        ]}
        columns={[
          {
            name: "createdAt",
            displayKey: "forseti.createdAt",
            cellRenderer: (manifest: ForsetiPolicyManifest) => formatDate(manifest.createdAt),
          },
          {
            name: "vvkId",
            displayKey: "forseti.vvkid",
            cellRenderer: (manifest: ForsetiPolicyManifest) => manifest.vvkId,
          },
          {
            name: "policy",
            displayKey: "forseti.policy",
            cellRenderer: (manifest: ForsetiPolicyManifest) => manifest.policy,
          },
          {
            name: "hash",
            displayKey: "forseti.hash",
            cellRenderer: (manifest: ForsetiPolicyManifest) => (
              <code className="pf-v5-u-font-family-monospace-sm">
                {manifest.hash.substring(0, 16)}...
              </code>
            ),
          },
          {
            name: "signerKid",
            displayKey: "forseti.signerKid",
            cellRenderer: (manifest: ForsetiPolicyManifest) => manifest.signerKid,
          },
          {
            name: "active",
            displayKey: "forseti.active",
            cellRenderer: (manifest: ForsetiPolicyManifest) => (manifest.active ? t("common.yes") : t("common.no")),
          },
        ]}
        emptyState={
          <ListEmptyState
            message={t("forseti.noManifests")}
            instructions={t("forseti.noManifestsInstructions")}
            primaryActionText={t("forseti.createManifest")}
            onPrimaryAction={() => navigate(`/${realm}/forseti/manifests/new`)}
          />
        }
      />
    </PageSection>
  );
}