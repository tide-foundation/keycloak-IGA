import {
  Alert,
  Button,
  Card,
  CardBody,
  CardTitle,
  FileUpload,
  Form,
  FormGroup,
  PageSection,
  Split,
  SplitItem,
  TextInput,
  Title,
  AlertVariant,
} from "@patternfly/react-core";
import { UploadIcon } from "@patternfly/react-icons";
import { useState } from "react";
import { useTranslation } from "react-i18next";

import {
  useAlerts,
} from "@keycloak/keycloak-ui-shared";
import { useForsetiApi } from "../../hooks/useForsetiApi";
import type { CodeUploadResponse } from "../../types";

export default function CodeUploadsSection() {
  const { t } = useTranslation();
  const { addAlert, addError } = useAlerts();
  const api = useForsetiApi();

  const [vvkId, setVvkId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<CodeUploadResponse | null>(null);

  const handleFileUpload = (_event: any, file: File) => {
    setFile(file);
    setFileName(file.name);
  };

  const handleClearFile = () => {
    setFile(null);
    setFileName("");
  };

  const handleUpload = async () => {
    if (!file || !vvkId.trim()) {
      addError("forseti.uploadValidationError", new Error("Missing file or vvkId"));
      return;
    }

    setIsUploading(true);
    try {
      const result = await api.uploadCode(vvkId.trim(), file);
      setUploadResult(result);
      addAlert(t("forseti.codeUploadSuccess"), AlertVariant.success);
      
      // Reset form
      setFile(null);
      setFileName("");
      setVvkId("");
    } catch (error) {
      addError("forseti.codeUploadError", error);
    } finally {
      setIsUploading(false);
    }
  };

  return (
    <PageSection variant="light">
      <div className="pf-v5-u-mb-lg">
        <Title headingLevel="h1" size="xl">
          {t("forseti.code")}
        </Title>
        <p className="pf-v5-u-mt-sm pf-v5-u-color-200">
          {t("forseti.codeUploadDescription")}
        </p>
      </div>

      <Split hasGutter>
        <SplitItem isFilled>
          <Card>
            <CardTitle>{t("forseti.uploadDll")}</CardTitle>
            <CardBody>
              <Form>
                <FormGroup
                  label={t("forseti.vvkid")}
                  fieldId="vvkId"
                  isRequired
                >
                  <TextInput
                    id="vvkId"
                    value={vvkId}
                    onChange={(_event, value) => setVvkId(value)}
                    placeholder={t("forseti.vvkidPlaceholder")}
                  />
                </FormGroup>

                <FormGroup
                  label={t("forseti.dllFile")}
                  fieldId="dllFile"
                  isRequired
                >
                  <FileUpload
                    id="dll-file-upload"
                    value={file || undefined}
                    filename={fileName}
                    filenamePlaceholder={t("forseti.chooseFile")}
                    onFileInputChange={handleFileUpload}
                    onClearClick={handleClearFile}
                    browseButtonText={t("forseti.browse")}
                    clearButtonText={t("common.clear")}
                    accept=".dll"
                  />
                </FormGroup>

                <Button
                  variant="primary"
                  onClick={handleUpload}
                  isDisabled={!file || !vvkId.trim() || isUploading}
                  isLoading={isUploading}
                  icon={<UploadIcon />}
                >
                  {isUploading ? t("forseti.uploading") : t("forseti.upload")}
                </Button>
              </Form>
            </CardBody>
          </Card>
        </SplitItem>

        <SplitItem isFilled>
          <Card>
            <CardTitle>{t("forseti.uploadResult")}</CardTitle>
            <CardBody>
              {uploadResult ? (
                <div>
                  <Alert
                    variant="success"
                    title={t("forseti.uploadCompleted")}
                    className="pf-v5-u-mb-md"
                  />
                  
                  <Form>
                    <FormGroup label={t("forseti.codeBh")} fieldId="codeBh">
                      <TextInput
                        id="codeBh"
                        value={uploadResult.bh}
                        readOnly
                        className="pf-v5-u-font-family-monospace"
                      />
                    </FormGroup>
                    
                    {uploadResult.entryTypes && uploadResult.entryTypes.length > 0 && (
                      <FormGroup label={t("forseti.entryTypes")} fieldId="entryTypes">
                        <div>
                          {uploadResult.entryTypes.map((type, index) => (
                            <div key={index} className="pf-v5-u-mb-xs">
                              <code className="pf-v5-u-font-family-monospace-sm">
                                {type}
                              </code>
                            </div>
                          ))}
                        </div>
                      </FormGroup>
                    )}
                  </Form>
                </div>
              ) : (
                <Alert
                  variant="info"
                  title={t("forseti.noUploadResult")}
                  actionClose={<></>}
                />
              )}
            </CardBody>
          </Card>
        </SplitItem>
      </Split>
    </PageSection>
  );
}