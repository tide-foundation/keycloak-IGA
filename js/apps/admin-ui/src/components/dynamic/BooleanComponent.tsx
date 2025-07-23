import { FormGroup, Switch, AlertVariant } from "@patternfly/react-core";
import { Controller, useFormContext } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { HelpItem, useAlerts } from "@keycloak/keycloak-ui-shared";
import type { ComponentProps } from "./components";
import { useAdminClient } from "../../admin-client";


export const BooleanComponent = ({
  name,
  label,
  helpText,
  isDisabled = false,
  defaultValue,
  isNew = true,
  convertToName,
}: ComponentProps) => {
  const { t } = useTranslation();
  const { control } = useFormContext();
  const { adminClient } = useAdminClient();
  const { addError } = useAlerts();
  

  const handleOnChange = async (name: string, value: any) => {
    if (name === "backupOn") {
      try {
        const data = new FormData();
        data.append("isBifrostEnabled", value.toString());
        await adminClient.tideAdmin.toggleBifrost(data)
      } catch (e) {
        const error = e as Error;
        addError(`Could not toggle bifrost: ${error.message}`, "");
        return false
      }
    }
    return true;
  }

  return (
    <FormGroup
      hasNoPaddingTop
      label={t(label!)}
      fieldId={name!}
      labelIcon={<HelpItem helpText={t(helpText!)} fieldLabelId={`${label}`} />}
    >
      <Controller
        name={convertToName(name!)}
        data-testid={name}
        defaultValue={isNew ? defaultValue : false}
        control={control}
        render={({ field }) => (
          <Switch
            id={name!}
            isDisabled={isDisabled}
            label={t("on")}
            labelOff={t("off")}
            isChecked={
              field.value === "true" ||
              field.value === true ||
              field.value?.[0] === "true"
            }
            onChange={async (_event, value) => {
              const changed = await handleOnChange(name!, value)
              if (changed) field.onChange("" + value)
            }}
            data-testid={name}
            aria-label={t(label!)}
          />
        )}
      />
    </FormGroup>
  );
};
