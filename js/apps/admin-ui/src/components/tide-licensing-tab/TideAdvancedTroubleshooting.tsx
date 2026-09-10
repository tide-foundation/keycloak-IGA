import React, { useState } from "react";
import {
  AlertVariant,
  Button,
  ExpandableSection,
  Spinner,
  Text,
  TextContent,
  TextVariants,
} from "@patternfly/react-core";
import { SyncAltIcon } from "@patternfly/react-icons";
import { getTideErrorInfo, useAlerts } from "@keycloak/keycloak-ui-shared";
import { useTranslation } from "react-i18next";
import { useAdminClient } from "../../admin-client";
import styles from "./tide-license-checkout.module.css";

// TIDECLOAK IMPLEMENTATION
// Manual recovery actions for a realm whose VRK rotation did not complete,
// kept collapsed so they stay out of the way of the normal licensing flow.
//
// Each button maps to one force-* route on VendorResource. Those routes run
// every guard before touching the realm, so a refusal leaves state untouched —
// which is why a failure here is reported rather than rolled back.
type TideAdvancedTroubleshootingProps = {
  /** Called after an action succeeds, so the parent can re-read the component. */
  onCompleted?: () => void | Promise<void>;
  /** Disables every action, e.g. while the parent is mid-flight. */
  isBusy?: boolean;
};

export const TideAdvancedTroubleshooting: React.FC<
  TideAdvancedTroubleshootingProps
> = ({ onCompleted, isBusy = false }) => {
  const { t } = useTranslation();
  const { adminClient } = useAdminClient();
  const { addAlert } = useAlerts();

  const [isExpanded, setIsExpanded] = useState(false);
  const [runningId, setRunningId] = useState<string | null>(null);

  // What the server has recorded, via latest-rotation-error. This is the panel's
  // source of truth.
  const [serverError, setServerError] = useState<string | null>(null);
  const [hasLoadedError, setHasLoadedError] = useState(false);
  const [isLoadingError, setIsLoadingError] = useState(false);
  // A failure raised by one of the buttons below. Only shown when the server has
  // nothing recorded, so a failure the server did not persist is still visible.
  const [actionError, setActionError] = useState<string | null>(null);

  /**
   * Render a failure as a readable block. The vendor routes answer with an
   * RFC 7807 problem, so the code, trace id and source are worth keeping
   * alongside the message — they are what support will ask for.
   */
  const formatFailure = (label: string, error: unknown) => {
    const info = getTideErrorInfo(error);
    const lines = [
      `[${new Date().toLocaleString()}] ${label}`,
      info.displayMessage,
    ];
    if (info.code) lines.push(`code: ${info.code}`);
    if (info.httpStatus) lines.push(`status: ${info.httpStatus}`);
    if (info.traceId) lines.push(`traceId: ${info.traceId}`);
    if (info.source) lines.push(`source: ${info.source}`);
    return lines.join("\n");
  };

  /**
   * Read the recorded rotation error. Reported inside the panel rather than as
   * a toast: this runs on expand, and a toast for a background read the
   * operator did not ask for is noise.
   */
  const loadRotationError = async () => {
    setIsLoadingError(true);
    try {
      const recorded = await adminClient.tideAdmin.getLatestRotationError();
      // The route answers with an empty body when no rotation has failed.
      setServerError((recorded ?? "").trim() || null);
    } catch (error) {
      setServerError(formatFailure(t("Could not read the rotation error"), error));
    } finally {
      setHasLoadedError(true);
      setIsLoadingError(false);
    }
  };

  const onToggle = (expanded: boolean) => {
    setIsExpanded(expanded);
    // Loaded lazily: the panel is collapsed by default, and most visits to the
    // licensing tab never open it.
    if (expanded && !hasLoadedError && !isLoadingError) {
      void loadRotationError();
    }
  };

  const run = async (
    id: string,
    label: string,
    request: () => Promise<string>,
  ) => {
    setRunningId(id);
    try {
      await request();
      addAlert(
        t("{{action}} succeeded", { action: label }),
        AlertVariant.success,
      );
      setActionError(null);
      await onCompleted?.();
    } catch (error) {
      // Kept locally as well as raised as a toast: the toast is gone by the time
      // the operator wants to copy the trace id out.
      setActionError(formatFailure(label, error));
      addAlert(getTideErrorInfo(error).displayMessage, AlertVariant.danger);
    } finally {
      setRunningId(null);
      // Either outcome can change what the server has recorded.
      await loadRotationError();
    }
  };

  const actions = [
    {
      id: "generate-vrk",
      label: t("Generate VRK"),
      request: () => adminClient.tideAdmin.forceGenVrk(),
    },
    {
      id: "sign-vrk",
      label: t("Sign VRK"),
      request: () => adminClient.tideAdmin.forceRotateVrk(),
    },
    {
      id: "switch-vrk",
      label: t("Switch VRK"),
      request: () => adminClient.tideAdmin.forceSwitchVrk(),
    },
  ];

  // The server's record wins; a local failure fills in only when it has none.
  const displayedError = serverError ?? actionError;
  const isDisabled = isBusy || runningId !== null;

  return (
    <div className={styles.troubleshooting}>
      <ExpandableSection
        data-testid="advanced-troubleshooting"
        isExpanded={isExpanded}
        onToggle={(_event, expanded) => onToggle(expanded)}
        toggleTextCollapsed={t("Show advanced actions")}
        toggleTextExpanded={t("Hide advanced actions")}
      >
        <TextContent>
          <Text component={TextVariants.small}>
            {t("Manual steps for recovering a stalled key rotation.")}
          </Text>
        </TextContent>

        <div className={styles.troubleshootingActions}>
          {actions.map((action) => (
            <Button
              key={action.id}
              data-testid={action.id}
              variant="secondary"
              isDanger
              isDisabled={isDisabled}
              isLoading={runningId === action.id}
              spinnerAriaValueText={t("Running")}
              onClick={() => run(action.id, action.label, action.request)}
            >
              {action.label}
            </Button>
          ))}
        </div>

        <div className={styles.rotationErrorHeading}>
          <TextContent>
            <Text component={TextVariants.h4}>{t("Latest Rotation Error")}</Text>
          </TextContent>
          <Button
            variant="link"
            isInline
            data-testid="refresh-rotation-error"
            icon={<SyncAltIcon />}
            isDisabled={isLoadingError}
            onClick={() => void loadRotationError()}
          >
            {t("refresh")}
          </Button>
        </div>

        {isLoadingError && !hasLoadedError ? (
          <Spinner size="md" aria-label={t("Loading")} />
        ) : displayedError ? (
          <pre className={styles.rotationError} data-testid="rotation-error-log">
            {displayedError}
          </pre>
        ) : (
          <TextContent>
            <Text
              component={TextVariants.small}
              data-testid="rotation-error-log"
            >
              {t("No rotation errors recorded.")}
            </Text>
          </TextContent>
        )}
      </ExpandableSection>
    </div>
  );
};
