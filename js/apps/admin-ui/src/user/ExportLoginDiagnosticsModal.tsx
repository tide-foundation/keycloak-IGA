/** TIDECLOAK IMPLEMENTATION */

import { fetchWithError } from "@keycloak/keycloak-admin-client";
import {
  SelectControl,
  TextControl,
  useAlerts,
} from "@keycloak/keycloak-ui-shared";
import {
  Button,
  ButtonVariant,
  Form,
  Modal,
  ModalVariant,
  Text,
  TextContent,
} from "@patternfly/react-core";
import { saveAs } from "file-saver";
import { useState } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAdminClient } from "../admin-client";
import { ClientSelect } from "../components/client/ClientSelect";
import { getAuthorizationHeaders } from "../utils/getAuthorizationHeaders";
import { joinPath } from "../utils/joinPath";

type ExportLoginDiagnosticsModalProps = {
  userId: string;
  username: string;
  onClose: () => void;
};

type FormFields = {
  clientId: string;
  scope: string;
  tokenType: "access" | "id";
};

/**
 * Dialog driving the iga-tve "synthesize" TVE-bundle producer for a single
 * user. The admin picks a client, scope, and token type; we POST
 * {@code POST /admin/realms/{realm}/iga-tve/tve-bundle} in synthesize mode with
 * {@code Accept: application/json} (the endpoint defaults to CBOR otherwise) and
 * download the returned JSON bundle for the user to hand to a developer.
 *
 * The synthesize request body shape is fixed by IgaTveBundleResource: it
 * requires {clientId, userId} and accepts optional {scope, tokenType}; mode is
 * "synthesize".
 */
export const ExportLoginDiagnosticsModal = ({
  userId,
  username,
  onClose,
}: ExportLoginDiagnosticsModalProps) => {
  const { adminClient } = useAdminClient();
  const { addError } = useAlerts();
  const { t } = useTranslation();
  const [isWorking, setIsWorking] = useState(false);

  const form = useForm<FormFields>({
    mode: "onChange",
    defaultValues: { clientId: "", scope: "openid", tokenType: "access" },
  });
  const { handleSubmit } = form;

  const onSubmit = async (data: FormFields) => {
    setIsWorking(true);
    try {
      const accessToken = await adminClient.getAccessToken();
      const response = await fetchWithError(
        joinPath(
          adminClient.baseUrl,
          "admin/realms",
          encodeURIComponent(adminClient.realmName),
          "iga-tve/tve-bundle",
        ),
        {
          method: "POST",
          headers: {
            ...getAuthorizationHeaders(accessToken),
            "Content-Type": "application/json",
            // The producer defaults to CBOR; ask for JSON so we download a
            // human/dev-readable bundle.
            Accept: "application/json",
          },
          body: JSON.stringify({
            mode: "synthesize",
            clientId: data.clientId,
            userId,
            scope: data.scope,
            tokenType: data.tokenType,
          }),
        },
      );
      const blob = await response.blob();
      saveAs(blob, `login-diagnostic-${username}.json`);
      onClose();
    } catch (err) {
      addError("exportLoginDiagnosticsError", err);
    } finally {
      setIsWorking(false);
    }
  };

  return (
    <Modal
      variant={ModalVariant.small}
      title={t("exportLoginDiagnosticsTitle")}
      isOpen
      onClose={onClose}
      actions={[
        <Button
          key="export"
          variant={ButtonVariant.primary}
          isLoading={isWorking}
          isDisabled={isWorking}
          onClick={() => handleSubmit(onSubmit)()}
        >
          {t("exportLoginDiagnostics")}
        </Button>,
        <Button key="cancel" variant={ButtonVariant.link} onClick={onClose}>
          {t("cancel")}
        </Button>,
      ]}
    >
      <TextContent className="pf-v5-u-mb-md">
        <Text>{t("exportLoginDiagnosticsDescription")}</Text>
      </TextContent>
      <FormProvider {...form}>
        <Form
          id="export-login-diagnostics-form"
          onSubmit={handleSubmit(onSubmit)}
        >
          <ClientSelect
            name="clientId"
            label="exportLoginDiagnosticsClient"
            helpText="exportLoginDiagnosticsClientHelp"
            clientKey="clientId"
            variant="typeahead"
            isRequired
          />
          <TextControl
            name="scope"
            label={t("exportLoginDiagnosticsScope")}
            labelIcon={t("exportLoginDiagnosticsScopeHelp")}
          />
          <SelectControl
            name="tokenType"
            label={t("exportLoginDiagnosticsTokenType")}
            labelIcon={t("exportLoginDiagnosticsTokenTypeHelp")}
            controller={{ defaultValue: "access" }}
            options={[
              { key: "access", value: "access" },
              { key: "id", value: "id" },
            ]}
          />
        </Form>
      </FormProvider>
    </Modal>
  );
};
