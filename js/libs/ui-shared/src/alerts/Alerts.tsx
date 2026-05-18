import { AlertVariant } from "@patternfly/react-core";
import { PropsWithChildren, useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";

import { createNamedContext } from "../utils/createNamedContext";
import {
  getErrorDescription,
  getErrorMessage,
  getTideErrorInfo,
} from "../utils/errors";
import { generateId } from "../utils/generateId";
import { useRequiredContext } from "../utils/useRequiredContext";
import { useSetTimeout } from "../utils/useSetTimeout";
import { AlertPanel } from "./AlertPanel";

const ALERT_TIMEOUT = 8000;

export type AddAlertFunction = (
  message: string,
  variant?: AlertVariant,
  description?: string,
) => void;

/**
 * Two-form signature:
 *  - Legacy: `addError(messageKey, error)` — keeps existing template-style
 *    callers working unchanged.
 *  - New:    `addError(error)` — surfaces a `TideError` / `NetworkError`
 *    using its `displayMessage` directly, with `code` / `traceId` /
 *    `source` rendered alongside.
 */
export type AddErrorFunction = {
  (messageKey: string, error: unknown): void;
  (error: unknown): void;
};

export type AlertProps = {
  addAlert: AddAlertFunction;
  addError: AddErrorFunction;
};

const AlertContext = createNamedContext<AlertProps | undefined>(
  "AlertContext",
  undefined,
);

export const useAlerts = () => useRequiredContext(AlertContext);

export type AlertEntry = {
  id: number;
  message: string;
  variant: AlertVariant;
  description?: string;
  /** Tide error code (e.g. `TIDE-ORK-SIG-VERIFY_FAILED`) if known. */
  code?: string;
  /** Distributed-trace correlation id, when the backend provided one. */
  traceId?: string;
  /** Server-side origin (`File:Line` or class:method) for triage. */
  source?: string;
};

export const AlertProvider = ({ children }: PropsWithChildren) => {
  const { t } = useTranslation();
  const setTimeout = useSetTimeout();
  const [alerts, setAlerts] = useState<AlertEntry[]>([]);

  const removeAlert = (id: number) =>
    setAlerts((alerts) => alerts.filter((alert) => alert.id !== id));

  const addAlert = useCallback<AddAlertFunction>(
    (message, variant = AlertVariant.success, description) => {
      const alert: AlertEntry = {
        id: generateId(),
        message,
        variant,
        description,
      };

      setAlerts((alerts) => [alert, ...alerts]);
      setTimeout(() => removeAlert(alert.id), ALERT_TIMEOUT);
    },
    [setTimeout],
  );

  const pushAlert = useCallback(
    (entry: Omit<AlertEntry, "id">) => {
      const alert: AlertEntry = { ...entry, id: generateId() };
      setAlerts((alerts) => [alert, ...alerts]);
      setTimeout(() => removeAlert(alert.id), ALERT_TIMEOUT);
    },
    [setTimeout],
  );

  const addError = useCallback(
    (messageKeyOrError: unknown, maybeError?: unknown) => {
      let messageKey: string | undefined;
      let error: unknown;
      // Distinguish overloads by argument count + first-arg type. The legacy
      // signature is `(messageKey: string, error: unknown)`; the new one is
      // `(error: unknown)` and accepts a string as the error itself.
      const isLegacyCall =
        typeof messageKeyOrError === "string" && maybeError !== undefined;
      if (isLegacyCall) {
        messageKey = messageKeyOrError as string;
        error = maybeError;
      } else {
        error = messageKeyOrError;
      }

      const info = getTideErrorInfo(error);

      // New-style or upgraded path: render with code / traceId / source.
      if (info.code) {
        const title = messageKey
          ? t(messageKey, { error: info.displayMessage })
          : info.displayMessage;
        pushAlert({
          message: title,
          variant: AlertVariant.danger,
          description:
            info.displayMessage !== title ? info.displayMessage : undefined,
          code: info.code,
          traceId: info.traceId,
          source: info.source,
        });
        return;
      }

      // Legacy fallback path — preserve previous behaviour exactly.
      if (messageKey) {
        const message = t(messageKey, { error: getErrorMessage(error) });
        const description = getErrorDescription(error);
        addAlert(message, AlertVariant.danger, description);
        return;
      }

      // Single-arg call with no code — surface the displayMessage directly.
      addAlert(info.displayMessage, AlertVariant.danger);
    },
    [addAlert, pushAlert, t],
  ) as AddErrorFunction;

  const value = useMemo(() => ({ addAlert, addError }), [addAlert, addError]);

  return (
    <AlertContext.Provider value={value}>
      <AlertPanel alerts={alerts} onCloseAlert={removeAlert} />
      {children}
    </AlertContext.Provider>
  );
};
