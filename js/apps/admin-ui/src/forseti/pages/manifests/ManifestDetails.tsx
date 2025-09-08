import {
  Alert,
  AlertVariant,
  Button,
  Card,
  CardBody,
  CardTitle,
  Form,
  FormGroup,
  PageSection,
  Split,
  SplitItem,
  TextInput,
  Title,
} from "@patternfly/react-core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { useParams, useNavigate } from "react-router-dom";

import {
  KeycloakSpinner,
  useAlerts,
} from "@keycloak/keycloak-ui-shared";
import { useRealm } from "../../../context/realm-context/RealmContext";
import { useForsetiManifest } from "../../hooks/useForsetiData";
import { useForsetiApi } from "../../hooks/useForsetiApi";
import { toManifests } from "../../routes/Manifests";
import type { ManifestWithABI } from "../../types";

export default function ManifestDetails() {
  const { t } = useTranslation();
  const { realm } = useRealm();
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { addAlert, addError } = useAlerts();
  const api = useForsetiApi();

  const { data: manifest, isLoading, error } = useForsetiManifest(
    id ? parseInt(id, 10) : undefined
  );

  const [jsonContent, setJsonContent] = useState("");
  const [parsedManifest, setParsedManifest] = useState<ManifestWithABI | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);

  // Parse JSON when manifest loads
  useState(() => {
    if (manifest?.json) {
      setJsonContent(manifest.json);
      try {
        const parsed = JSON.parse(manifest.json);
        setParsedManifest(parsed);
        setParseError(null);
      } catch (e) {
        setParseError(e instanceof Error ? e.message : "Invalid JSON");
      }
    }
  });

  const handleActivate = async () => {
    if (!manifest) return;
    
    try {
      await api.activateManifest(manifest.id);
      addAlert(t("forseti.manifestActivateSuccess"), AlertVariant.success);
      navigate(toManifests({ realm }).pathname!);
    } catch (error) {
      addError("forseti.manifestActivateError", error);
    }
  };

  if (isLoading) {
    return <KeycloakSpinner />;
  }

  if (error || !manifest) {
    return (
      <PageSection variant="light">
        <Alert variant={AlertVariant.danger} title={t("common.notFound")}>
          {t("forseti.manifestNotFound")}
        </Alert>
      </PageSection>
    );
  }

  return (
    <PageSection variant="light">
      <div className="pf-v5-u-mb-lg">
        <Title headingLevel="h1" size="xl">
          {t("forseti.manifestDetails")}
        </Title>
        <p className="pf-v5-u-mt-sm pf-v5-u-color-200">
          {manifest.vvkId} - {manifest.policy}
        </p>
      </div>

      <Split hasGutter>
        <SplitItem isFilled>
          <Card>
            <CardTitle>{t("forseti.manifestInfo")}</CardTitle>
            <CardBody>
              <Form>
                <FormGroup label={t("forseti.vvkid")} fieldId="vvkId">
                  <TextInput
                    id="vvkId"
                    value={manifest.vvkId}
                    readOnly
                  />
                </FormGroup>
                
                <FormGroup label={t("forseti.policy")} fieldId="policy">
                  <TextInput
                    id="policy"
                    value={manifest.policy}
                    readOnly
                  />
                </FormGroup>
                
                <FormGroup label={t("forseti.hash")} fieldId="hash">
                  <TextInput
                    id="hash"
                    value={manifest.hash}
                    readOnly
                    className="pf-v5-u-font-family-monospace"
                  />
                </FormGroup>
                
                <FormGroup label={t("forseti.signerKid")} fieldId="signerKid">
                  <TextInput
                    id="signerKid"
                    value={manifest.signerKid}
                    readOnly
                  />
                </FormGroup>
                
                <FormGroup label={t("forseti.active")} fieldId="active">
                  <TextInput
                    id="active"
                    value={manifest.active ? t("common.yes") : t("common.no")}
                    readOnly
                  />
                </FormGroup>
                
                <FormGroup label={t("forseti.createdAt")} fieldId="createdAt">
                  <TextInput
                    id="createdAt"
                    value={new Date(manifest.createdAt).toLocaleString()}
                    readOnly
                  />
                </FormGroup>
              </Form>
            </CardBody>
          </Card>
        </SplitItem>

        <SplitItem isFilled>
          <Card>
            <CardTitle>{t("forseti.abiPreview")}</CardTitle>
            <CardBody>
              {parseError ? (
                <Alert variant="danger" title={t("forseti.invalidJson")}>
                  {parseError}
                </Alert>
              ) : parsedManifest?.abi ? (
                <div>
                  <div className="pf-v5-u-mb-md">
                    <strong>{t("forseti.policy")}:</strong> {parsedManifest.abi.policy}
                    <br />
                    <strong>{t("forseti.stage")}:</strong> {parsedManifest.abi.stage}
                    <br />
                    <strong>SDK Version:</strong> {parsedManifest.abi.sdkVersion}
                  </div>
                  
                  {parsedManifest.abi.description && (
                    <div className="pf-v5-u-mb-md">
                      <strong>{t("forseti.description")}:</strong>
                      <p className="pf-v5-u-mt-xs">{parsedManifest.abi.description}</p>
                    </div>
                  )}
                  
                  {parsedManifest.abi.requires?.length > 0 && (
                    <div className="pf-v5-u-mb-md">
                      <strong>{t("forseti.requires")}:</strong>
                      <ul className="pf-v5-u-mt-xs">
                        {parsedManifest.abi.requires.map((req, index) => (
                          <li key={index}>
                            <code>{req.name}</code> ({req.type})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                  
                  {parsedManifest.abi.optional?.length > 0 && (
                    <div className="pf-v5-u-mb-md">
                      <strong>{t("forseti.optional")}:</strong>
                      <ul className="pf-v5-u-mt-xs">
                        {parsedManifest.abi.optional.map((opt, index) => (
                          <li key={index}>
                            <code>{opt.name}</code> ({opt.type})
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              ) : (
                <Alert variant="info" title={t("forseti.noAbi")} />
              )}
            </CardBody>
          </Card>
        </SplitItem>
      </Split>

      <div className="pf-v5-u-mt-lg">
        {!manifest.active && (
          <Button
            variant="primary"
            onClick={handleActivate}
            className="pf-v5-u-mr-md"
          >
            {t("forseti.activate")}
          </Button>
        )}
        <Button
          variant="secondary"
          onClick={() => navigate(toManifests({ realm }).pathname!)}
        >
          {t("common.back")}
        </Button>
      </div>
    </PageSection>
  );
}