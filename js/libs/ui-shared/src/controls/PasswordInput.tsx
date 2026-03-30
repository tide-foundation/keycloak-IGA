import {
  Button,
  InputGroup,
  InputGroupItem,
  TextInput,
  type TextInputProps,
} from "@patternfly/react-core";
import { EyeIcon, EyeSlashIcon } from "@patternfly/react-icons";
import { MutableRefObject, Ref, forwardRef, useState } from "react";
import { useTranslation } from "react-i18next";

export type PasswordInputProps = TextInputProps & {
  hasReveal?: boolean;
<<<<<<< HEAD
  isTideIdp?: boolean; // TIDECLOAK IMPLEMENTATION
=======
  isTideIdp?: boolean;
>>>>>>> origin/release/0.13.26
};

const PasswordInputBase = ({
  hasReveal = true,
  innerRef,
<<<<<<< HEAD
  isTideIdp = false, // TIDECLOAK IMPLEMENTATION
=======
  isTideIdp = false,
>>>>>>> origin/release/0.13.26
  ...rest
}: PasswordInputProps) => {
  const { t } = useTranslation();
  const [hidePassword, setHidePassword] = useState(true);
  return (
    <>
      {/** TIDECLOAK IMPLEMENTATION */}
      <InputGroup style={{ display: isTideIdp ? 'none' : undefined }}>
<<<<<<< HEAD
      <InputGroupItem isFill>
        <TextInput
          {...rest}
          type={hidePassword ? "password" : "text"}
          ref={innerRef}
        />
      </InputGroupItem>
      {hasReveal && (
        <Button
          variant="control"
          aria-label={t("showPassword")}
          onClick={() => setHidePassword(!hidePassword)}
        >
          {hidePassword ? <EyeIcon /> : <EyeSlashIcon />}
        </Button>
      )}
    </InputGroup>
=======
        <InputGroupItem isFill>
          <TextInput
            {...rest}
            type={hidePassword ? "password" : "text"}
            ref={innerRef}
          />
        </InputGroupItem>
        {hasReveal && (
          <Button
            variant="control"
            aria-label={t("showPassword")}
            onClick={() => setHidePassword(!hidePassword)}
          >
            {hidePassword ? <EyeIcon /> : <EyeSlashIcon />}
          </Button>
        )}
      </InputGroup>
>>>>>>> origin/release/0.13.26
    </>
  );
};

export const PasswordInput = forwardRef(
  (props: PasswordInputProps, ref: Ref<HTMLInputElement>) => (
    <PasswordInputBase {...props} innerRef={ref as MutableRefObject<any>} />
  ),
);
PasswordInput.displayName = "PasswordInput";
