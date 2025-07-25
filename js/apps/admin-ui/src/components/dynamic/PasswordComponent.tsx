import { useTranslation } from "react-i18next";
import { PasswordControl } from "@keycloak/keycloak-ui-shared";
import type { ComponentProps } from "./components";

export const PasswordComponent = ({
  name,
  label,
  helpText,
  defaultValue,
  required,
  isDisabled = false,
  convertToName,
  isHidden = false, // TIDECLOAK IMPLEMENTATION
}: ComponentProps) => {
  const { t } = useTranslation();

  return (
    <PasswordControl
      style={{ display: isHidden ? 'none' : undefined }} // TIDECLOAK IMPLEMENTATION
      name={convertToName(name!)}
      label={t(label!)}
      labelIcon={t(helpText!)}
      isDisabled={isDisabled}
      defaultValue={defaultValue?.toString()}
      rules={{
        required: { value: !!required, message: t("required") },
      }}
    />
  );
};
