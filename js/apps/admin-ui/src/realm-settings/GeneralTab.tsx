import type RealmRepresentation from "@keycloak/keycloak-admin-client/lib/defs/realmRepresentation";
import {
  UnmanagedAttributePolicy,
  UserProfileConfig,
} from "@keycloak/keycloak-admin-client/lib/defs/userProfileMetadata";
import {
  FormErrorText,
  HelpItem,
  KeycloakSpinner,
  SelectControl,
  TextControl,
  useAlerts,
  useEnvironment,
  useFetch,
  useAlerts,
} from "@keycloak/keycloak-ui-shared";
import {
  AlertVariant,
  ClipboardCopy,
  FormGroup,
  PageSection,
  Stack,
  StackItem,
  Switch,
  Text,
} from "@patternfly/react-core";
import { useEffect, useState } from "react";
import { Controller, FormProvider, useForm, useWatch } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { useAdminClient } from "../admin-client";
import { DefaultSwitchControl } from "../components/SwitchControl";
import { FormattedLink } from "../components/external-link/FormattedLink";
import { FixedButtonsGroup } from "../components/form/FixedButtonGroup";
import { FormAccess } from "../components/form/FormAccess";
import { RealmLoAMapping } from "../components/realm-loa-mapping/RealmLoAMapping";
import { useRealm } from "../context/realm-context/RealmContext";
import {
  addTrailingSlash,
  convertAttributeNameToForm,
  convertToFormValues,
} from "../util";
import useIsFeatureEnabled, { Feature } from "../utils/useIsFeatureEnabled";
import { UIRealmRepresentation } from "./RealmSettingsTabs";
import { SIGNATURE_ALGORITHMS } from "../clients/add/SamlSignature";
import type { RealmLoAMappingType } from "../components/realm-loa-mapping/RealmLoAMapping";
import {
  deleteRealmSsfQueuedEvents,
  useSsfTransmitterDisableConfirmDialog,
} from "./ssf/SsfTransmitterDisableConfirmDialog";
import { IgaToggleProgressModal } from "./IgaToggleProgressModal"; // TIDECLOAK IMPLEMENTATION
import {
  SIGN_DEFAULTS_SWEEP,
  type IgaCommitFailure,
} from "./igaToggleWarnings"; // TIDECLOAK IMPLEMENTATION

type RealmSettingsGeneralTabProps = {
  realm: UIRealmRepresentation;
  save: (realm: UIRealmRepresentation) => Promise<void>;
  refresh: () => void; // TIDECLOAK IMPLEMENTATION
};

export const RealmSettingsGeneralTab = ({
  realm,
  refresh, // TIDECLOAK IMPLEMENTATION
  save,
}: RealmSettingsGeneralTabProps) => {
  const { adminClient } = useAdminClient();

  const { realm: realmName } = useRealm();
  const [userProfileConfig, setUserProfileConfig] =
    useState<UserProfileConfig>();

  useFetch(
    () => adminClient.users.getProfile({ realm: realmName }),
    (config) => setUserProfileConfig(config),
    [],
  );

  if (!userProfileConfig) {
    return <KeycloakSpinner />;
  }

  return (
    <RealmSettingsGeneralTabForm
      realm={realm}
      save={save}
      userProfileConfig={userProfileConfig}
      refresh={refresh} // TIDECLOAK IMPLEMENTATION
    />
  );
};

type RealmSettingsGeneralTabFormProps = {
  realm: UIRealmRepresentation;
  save: (realm: UIRealmRepresentation) => Promise<void>;
  userProfileConfig: UserProfileConfig;
  refresh: () => void; // TIDECLOAK IMPLEMENTATION
};

type FormFields = Omit<RealmRepresentation, "groups"> & {
  unmanagedAttributePolicy: UnmanagedAttributePolicy;
};

const REQUIRE_SSL_TYPES = ["all", "external", "none"];

// TIDECLOAK IMPLEMENTATION
// Shape of the pending-approval payload iga-core returns (HTTP 202) when an
// admin tries to disable IGA: the disable is captured into a governed
// DISABLE_IGA change request that must be approved before IGA actually goes
// off.
type DisableIgaPending = {
  changeRequestId?: string;
  message?: string;
};

// TIDECLOAK IMPLEMENTATION
// `toggleIGA` is typed to return `Response`, but the admin-client agent has a
// generic 202 interceptor that may already have parsed/unwrapped the body
// before it reaches us. This normalises both cases and decides whether the
// disable was accepted as a pending change request:
//   - raw `Response`: pending iff status === 202; read the JSON body for
//     { changeRequestId, message } (tolerating a non-JSON body).
//   - already-parsed object: pending iff it carries a changeRequestId (the
//     PendingChangeRequest shape uses status === "PENDING" + changeRequestId).
// Returns the pending payload, or `null` when this was not a 202/pending
// response (i.e. a legacy synchronous disable).
async function readDisableIgaPending(
  result: unknown,
): Promise<DisableIgaPending | null> {
  if (result instanceof Response) {
    if (result.status !== 202) {
      return null;
    }
    try {
      const body = (await result.json()) as DisableIgaPending | null;
      return body ?? {};
    } catch {
      // 202 with an empty/non-JSON body still means "pending approval".
      return {};
    }
  }

  if (result && typeof result === "object") {
    const body = result as Record<string, unknown>;
    if (typeof body.changeRequestId === "string" || body.status === "PENDING") {
      return {
        changeRequestId:
          typeof body.changeRequestId === "string"
            ? body.changeRequestId
            : undefined,
        message: typeof body.message === "string" ? body.message : undefined,
      };
    }
  }

  return null;
}

// TIDECLOAK IMPLEMENTATION
// Shape of the ON-toggle POST response body when iga-core finishes
// `completed_with_warnings` (HTTP 200): some ADOPT change-requests could not be
// signed (e.g. ORK down) and were left PENDING. `commitFailures` lists each
// failure; the synthetic `actionType === "SIGN_DEFAULTS_SWEEP"` entry is the
// closure/converge sign rather than a per-CR failure.
type ToggleIgaWarnings = {
  state?: string;
  warningsSummary?: string;
  warnings?: { commitFailures?: IgaCommitFailure[] };
};

// TIDECLOAK IMPLEMENTATION
// Normalise the ON-toggle POST result (raw `Response` or an already-parsed
// body) into the warnings payload, or `null` when the run completed cleanly /
// the body carries no warning signal.
async function readToggleIgaWarnings(
  result: unknown,
): Promise<ToggleIgaWarnings | null> {
  let body: Record<string, unknown> | null = null;
  if (result instanceof Response) {
    try {
      body = (await result.clone().json()) as Record<string, unknown> | null;
    } catch {
      return null;
    }
  } else if (result && typeof result === "object") {
    body = result as Record<string, unknown>;
  }
  if (!body) {
    return null;
  }

  const warnings = body.warnings as
    | { commitFailures?: IgaCommitFailure[] }
    | undefined;
  const hasWarningSignal =
    body.state === "completed_with_warnings" ||
    typeof body.warningsSummary === "string" ||
    (Array.isArray(warnings?.commitFailures) &&
      warnings!.commitFailures!.length > 0);
  if (!hasWarningSignal) {
    return null;
  }
  return {
    state: typeof body.state === "string" ? body.state : undefined,
    warningsSummary:
      typeof body.warningsSummary === "string"
        ? body.warningsSummary
        : undefined,
    warnings,
  };
}

const UNMANAGED_ATTRIBUTE_POLICIES = [
  UnmanagedAttributePolicy.Disabled,
  UnmanagedAttributePolicy.Enabled,
  UnmanagedAttributePolicy.AdminView,
  UnmanagedAttributePolicy.AdminEdit,
];

function RealmSettingsGeneralTabForm({
  realm,
  refresh, // TIDECLOAK IMPLEMENTATION
  save,
  userProfileConfig,
}: RealmSettingsGeneralTabFormProps) {
  const {
    environment: { serverBaseUrl },
  } = useEnvironment();
  const { adminClient } = useAdminClient();

  const { t } = useTranslation();
  const { realm: realmName } = useRealm();
  const { adminClient } = useAdminClient();
  const { addAlert, addError } = useAlerts();
  const form = useForm<FormFields>();
  const {
    control,
    handleSubmit,
    setValue,
    formState: { errors },
  } = form;
  const isFeatureEnabled = useIsFeatureEnabled();
  const isOrganizationsEnabled = isFeatureEnabled(Feature.Organizations);
  const isAdminPermissionsV2Enabled = isFeatureEnabled(
    Feature.AdminFineGrainedAuthzV2,
  );
  const isOpenid4vciEnabled = isFeatureEnabled(Feature.OpenId4VCI);
  const isStepUpAuthenticationSaml = isFeatureEnabled(
    Feature.StepUpAuthenticationSaml,
  );
  const isScimApiEnabled = isFeatureEnabled(Feature.ScimApi);

  const isSsfEnabled = isFeatureEnabled(Feature.Ssf);

  const ssfTransmitterEnabled = useWatch({
    control,
    name: convertAttributeNameToForm<FormFields>(
      "attributes.ssf.transmitterEnabled",
    ) as any,
  });

  // Disabling the transmitter at the realm level has cascading effects
  // (silent receiver pause, queued events deferred or dead-lettered after
  // outbox-pending-max-age, all SSF endpoints 404). Surface those to the
  // admin so the off transition is a deliberate choice rather than an
  // accidental flip. The toggle's onChange below opens this dialog when
  // going from on to off; cancelling reverts the field back to "true".
  const [toggleSsfDisableDialog, SsfDisableConfirm] =
    useSsfTransmitterDisableConfirmDialog({
      onConfirm: () => {
        // No-op: the inner Controller already flipped the field to "false"
        // when the admin clicked the switch; confirming just lets that
        // value stand until the user hits the form's Save button.
      },
      onCancel: () => {
        setValue(
          convertAttributeNameToForm<FormFields>(
            "attributes.ssf.transmitterEnabled",
          ) as any,
          "true",
        );
      },
    });

  const { addAlert, addError } = useAlerts();

  // TIDECLOAK IMPLEMENTATION - IGA toggle progress state
  // While a toggle is in flight the switch is disabled. The ON-toggle opens a
  // ProgressStepper modal driven by polling toggle-iga/status/{jobId}; the
  // OFF-toggle stays on the synchronous path it has always used.
  const [igaToggleInFlight, setIgaToggleInFlight] = useState(false);
  const [igaProgressJobId, setIgaProgressJobId] = useState<string | null>(null);
  // Structured per-CR failures from the ON-toggle POST body, handed to the
  // progress modal so it can render a clean list (the polled status it sees has
  // only a flat error.message). Empty/cleared on a clean run.
  const [igaCommitFailures, setIgaCommitFailures] = useState<
    IgaCommitFailure[] | undefined
  >(undefined);

  // TIDECLOAK IMPLEMENTATION
  const updateSwitchValue = async (value: boolean) => {
    // OFF-toggle: disabling IGA is now governed. iga-core no longer disables
    // immediately — it creates a DISABLE_IGA change request and answers the
    // toggle POST with HTTP 202 + { changeRequestId, message } (pending
    // approval) in both firstAdmin and multiAdmin. So we must NOT flip the
    // switch optimistically or claim success: IGA is still ON until the CR is
    // committed. We surface an info alert and refresh() — which re-reads
    // realm state (isIGAEnabled still "true"), keeping the switch ON.
    if (!value) {
      try {
        const data = new FormData();
        data.append("isIGAEnabled", "false");
        const result = await adminClient.tideAdmin.toggleIGA(data);

        // `toggleIGA` is typed `Response`, but the admin-client agent may have
        // already intercepted a 202 and unwrapped the body (e.g. into a
        // PendingChangeRequest). Handle both: a raw Response (read .status /
        // .json()) and an already-parsed pending body.
        const pending = await readDisableIgaPending(result);
        if (pending) {
          addAlert(
            t("igaDisablePendingApprovalTitle"),
            AlertVariant.info,
            pending.message || t("igaDisablePendingApprovalMessage"),
          );
          // Do NOT flip optimistically. Realm state still reads
          // isIGAEnabled=true, so the switch stays ON after refresh.
          refresh();
          return;
        }

        // Non-202 (e.g. a legacy synchronous disable): IGA actually went off.
        addAlert(t("enableSwitchSuccess", { switch: t("IGA") }));
        refresh();
      } catch (error) {
        addError(t("enableSwitchError"), error);
      }
      return;
    }

    // ON-toggle: generate a jobId, open the progress modal, fire the POST and
    // let the modal poll the status endpoint until it resolves.
    const jobId = crypto.randomUUID();
    setIgaProgressJobId(jobId);
    setIgaToggleInFlight(true);
    try {
      const data = new FormData();
      data.append("isIGAEnabled", "true");
      data.append("jobId", jobId);
      const result = await adminClient.tideAdmin.toggleIGA(data);

      // POST resolved with HTTP 200. iga-core may have finished
      // `completed_with_warnings` — some ADOPT change-requests could not be
      // signed (e.g. ORK down) and were left PENDING. Inspect the body and tell
      // the user HOW MANY failed instead of claiming a clean success.
      const warnings = await readToggleIgaWarnings(result);
      if (warnings) {
        const failures = warnings.warnings?.commitFailures ?? [];
        // Per-CR failures exclude the synthetic converge/closure-sweep entry.
        const perCrFailures = failures.filter(
          (f) => f.actionType !== SIGN_DEFAULTS_SWEEP,
        );
        const count = perCrFailures.length;

        // Hand the structured failures to the still-open modal so it can render
        // the tidy headline + capped list + collapsible Details, and keep the
        // modal open (do NOT clear the jobId) so the user can read that detail.
        setIgaCommitFailures(failures);

        // The toast is just a concise headline — the scannable detail lives in
        // the modal, not in an auto-dismissing blob.
        if (count > 0) {
          addAlert(t("enableSwitchWarning", { count }), AlertVariant.warning);
        } else {
          addAlert(t("enableSwitchWarningClosure"), AlertVariant.warning);
        }
        setIgaToggleInFlight(false);
        refresh();
      } else {
        // Clean completion: keep the plain success toast and close the modal.
        // The modal also observes state=completed via polling.
        addAlert(t("enableSwitchSuccess", { switch: t("IGA") }));
        setIgaCommitFailures(undefined);
        setIgaToggleInFlight(false);
        setIgaProgressJobId(null);
        refresh();
      }
    } catch (error) {
      // POST failed: surface the error toast and leave the modal open so it
      // can render the failed stage (it stays mounted while jobId is set).
      addError(t("enableSwitchError"), error);
      setIgaToggleInFlight(false);
    }
  };

  const setupForm = () => {
    convertToFormValues(realm, setValue);
    setValue(
      "unmanagedAttributePolicy",
      userProfileConfig.unmanagedAttributePolicy ||
        UNMANAGED_ATTRIBUTE_POLICIES[0],
    );
    if (realm.attributes?.["acr.loa.map"]) {
      const acrLoaMap = Object.entries(
        JSON.parse(realm.attributes["acr.loa.map"]),
      ).flatMap(([acr, loa]) => ({ acr, loa }) as RealmLoAMappingType);

      if (isStepUpAuthenticationSaml && realm.attributes["acr.uri.map"]) {
        const acrUriMap = JSON.parse(realm.attributes["acr.uri.map"]);
        acrLoaMap.forEach((row) => (row.uri = acrUriMap?.[row.acr]));
      }

      setValue(
        convertAttributeNameToForm("attributes.acr.loa.map") as any,
        acrLoaMap,
      );
    }
  };

  useEffect(setupForm, []);

  const onSubmit = handleSubmit(
    async ({ unmanagedAttributePolicy, ...data }) => {
      const upConfig = { ...userProfileConfig };

      if (unmanagedAttributePolicy === UnmanagedAttributePolicy.Disabled) {
        delete upConfig.unmanagedAttributePolicy;
      } else {
        upConfig.unmanagedAttributePolicy = unmanagedAttributePolicy;
      }

      // Detect a true -> false transition on the SSF Transmitter realm
      // toggle so we can drop queued events as part of the same save
      // flow. Compare the persisted previous state to the new form
      // value — captured before save() so the comparison is well-defined
      // regardless of when the actual write happens.
      const wasSsfTransmitterEnabled =
        realm.attributes?.["ssf.transmitterEnabled"] === "true";
      const isSsfTransmitterEnabledAfter =
        ssfTransmitterEnabled?.toString() === "true";

      if (wasSsfTransmitterEnabled && !isSsfTransmitterEnabledAfter) {
        // Cleanup runs BEFORE save while the SSF admin resource is
        // still reachable. Once save() persists transmitterEnabled=false,
        // SsfAdminRealmResourceProviderFactory gates /ssf/* off and the
        // DELETE would 404. Best-effort: a cleanup failure surfaces as
        // a toast but doesn't block the disable — outbox-pending-max-age
        // backstops any leftover PENDING rows.
        try {
          await deleteRealmSsfQueuedEvents(adminClient, realmName);
          addAlert(t("ssfTransmitterDisableEventsCleared"));
        } catch (error) {
          addError("ssfTransmitterDisableEventsClearFailed", error);
        }
      }

      await save({ ...data, upConfig });
    },
  );

  return (
    <PageSection variant="light">
      <FormProvider {...form}>
        <FormAccess
          isHorizontal
          role="manage-realm"
          className="pf-u-mt-lg"
          onSubmit={onSubmit}
        >
          <FormGroup label={t("realmName")} fieldId="kc-realm-id" isRequired>
            <Controller
              name="realm"
              control={control}
              rules={{
                required: { value: true, message: t("required") },
              }}
              defaultValue=""
              render={({ field }) => (
                <ClipboardCopy
                  data-testid="realmName"
                  onChange={field.onChange}
                >
                  {field.value}
                </ClipboardCopy>
              )}
            />
            {errors.realm && (
              <FormErrorText
                data-testid="realm-id-error"
                message={errors.realm.message as string}
              />
            )}
          </FormGroup>
          {/* TIDECLOAK IMPLEMENTATION - IGA section */}
          <FormGroup
            label={t("Identity Governance and Administration (IGA)")}
            fieldId="tide-iga-section"
            hasNoPaddingTop
          >
            <Text component="p" className="pf-v5-u-color-200">
              {t(
                "Changing these while IGA is enabled creates a change request that must be approved.",
              )}
            </Text>
          </FormGroup>
          <FormGroup
            label={t("IGA enabled")}
            fieldId="tide-iga"
            labelIcon={
              <HelpItem
                helpText={t("some help text for iga")}
                fieldLabelId="igaEnabled"
              />
            }
            hasNoPaddingTop
          >
            <Switch
              id="tide-realm-iga-switch"
              data-testid="realm-iga-switch"
              value={
                realm.attributes?.["isIGAEnabled"]?.toLowerCase() === "true"
                  ? "on"
                  : "off"
              }
              label={t("on")}
              labelOff={t("off")}
              isChecked={
                realm.attributes?.["isIGAEnabled"]?.toLowerCase() === "true"
                  ? true
                  : false
              }
              isDisabled={igaToggleInFlight}
              onChange={(_event, value) => {
                void updateSwitchValue(value);
              }}
              aria-label={t("igaEnabled")}
            />
          </FormGroup>
          {/* TIDECLOAK IMPLEMENTATION - IGA toggle-on progress modal */}
          {igaProgressJobId && (
            <IgaToggleProgressModal
              jobId={igaProgressJobId}
              realm={realmName}
              isOpen={!!igaProgressJobId}
              commitFailures={igaCommitFailures}
              onComplete={(withWarnings) => {
                // Terminal state observed by the poll; the awaited POST handles
                // the toast/refresh. On a CLEAN completion, close the modal. On
                // `completed_with_warnings`, keep it open so the user can read
                // the headline + structured pending-CR list; they close it via
                // the Close button.
                setIgaToggleInFlight(false);
                if (!withWarnings) {
                  setIgaProgressJobId(null);
                }
                refresh();
              }}
              onClose={() => {
                setIgaProgressJobId(null);
                setIgaToggleInFlight(false);
                setIgaCommitFailures(undefined);
              }}
            />
          )}
          <TextControl
            name={convertAttributeNameToForm<FormFields>(
              "attributes.iga.threshold",
            )}
            type="number"
            label={t("IGA approval threshold")}
            labelIcon={t(
              "Number of distinct admin signatures required before a change request can be committed. A group/role/client/organization may override this with a higher per-entity iga.threshold. Values below 1 are treated as 1.",
            )}
            min={1}
            defaultValue={"1" as any}
          />
          <SelectControl
            name={convertAttributeNameToForm<FormFields>(
              "attributes.iga.scopeMode",
            )}
            label={t("IGA scope mode")}
            labelIcon={t(
              "any: an approver needs at least one of the required approver roles. all: the approver must hold every required role.",
            )}
            controller={{
              defaultValue: "any",
            }}
            options={[
              { key: "any", value: "any" },
              { key: "all", value: "all" },
            ]}
          />
          {/* TIDECLOAK IMPLEMENTATION - end IGA section */}
          <TextControl
            name="displayName"
            label={t("displayName")}
            labelIcon={t("realmDisplayNameHelp")}
          />
          <TextControl name="displayNameHtml" label={t("htmlDisplayName")} />
          <TextControl
            name={convertAttributeNameToForm("attributes.frontendUrl")}
            type="url"
            label={t("frontendUrl")}
            labelIcon={t("frontendUrlHelp")}
          />
          <SelectControl
            name="sslRequired"
            label={t("requireSsl")}
            labelIcon={t("requireSslHelp")}
            controller={{
              defaultValue: "none",
            }}
            options={REQUIRE_SSL_TYPES.map((sslType) => ({
              key: sslType,
              value: t(`sslType.${sslType}`),
            }))}
          />
          <FormGroup
            label={t("acrToLoAMapping")}
            fieldId="acrToLoAMapping"
            labelIcon={
              <HelpItem
                helpText={
                  isStepUpAuthenticationSaml
                    ? t("acrToLoAMappingRealmSamlHelp")
                    : t("acrToLoAMappingHelp")
                }
                fieldLabelId="acrToLoAMapping"
              />
            }
          >
            <RealmLoAMapping
              label={t("acrToLoAMapping")}
              name={convertAttributeNameToForm("attributes.acr.loa.map")}
              uri={isStepUpAuthenticationSaml}
            />
          </FormGroup>
          <DefaultSwitchControl
            name="userManagedAccessAllowed"
            label={t("userManagedAccess")}
            labelIcon={t("userManagedAccessHelp")}
          />
          {isOrganizationsEnabled && (
            <DefaultSwitchControl
              name="organizationsEnabled"
              label={t("organizationsEnabled")}
              labelIcon={t("organizationsEnabledHelp")}
            />
          )}
          {isAdminPermissionsV2Enabled && (
            <DefaultSwitchControl
              name="adminPermissionsEnabled"
              label={t("adminPermissionsEnabled")}
              labelIcon={t("adminPermissionsEnabledHelp")}
            />
          )}
          {isOpenid4vciEnabled && (
            <DefaultSwitchControl
              name="verifiableCredentialsEnabled"
              label={t("verifiableCredentialsEnabled")}
              labelIcon={t("verifiableCredentialsEnabledHelp")}
            />
          )}
          {isScimApiEnabled && (
            <DefaultSwitchControl
              name="scimApiEnabled"
              label={t("scimApiEnabled")}
              labelIcon={t("scimApiEnabledHelp")}
            />
          )}
          {isSsfEnabled && (
            <>
              <DefaultSwitchControl
                name={convertAttributeNameToForm<FormFields>(
                  "attributes.ssf.transmitterEnabled",
                )}
                label={t("ssfTransmitterEnabled")}
                labelIcon={t("ssfTransmitterEnabledHelp")}
                stringify
                onChange={(_e, checked) => {
                  // Off transition only — surface the consequences before
                  // the admin commits the form save. Cancelling reverts.
                  if (!checked) {
                    toggleSsfDisableDialog();
                  }
                }}
              />
              <SsfDisableConfirm />
            </>
          )}
          <SelectControl
            name="unmanagedAttributePolicy"
            label={t("unmanagedAttributes")}
            labelIcon={t("unmanagedAttributesHelpText")}
            controller={{
              defaultValue: UNMANAGED_ATTRIBUTE_POLICIES[0],
            }}
            options={UNMANAGED_ATTRIBUTE_POLICIES.map((policy) => ({
              key: policy,
              value: t(`unmanagedAttributePolicy.${policy}`),
            }))}
          />
          <SelectControl
            name={convertAttributeNameToForm<FormFields>(
              "attributes.saml.signature.algorithm",
            )}
            label={t("signatureAlgorithmIdentityProviderMetadata")}
            labelIcon={t("signatureAlgorithmIdentityProviderMetadataHelp")}
            controller={{
              defaultValue: "",
            }}
            options={[
              { key: "", value: t("choose") },
              ...SIGNATURE_ALGORITHMS.map((v) => ({ key: v, value: v })),
            ]}
          />
          <FormGroup
            label={t("endpoints")}
            labelIcon={
              <HelpItem
                helpText={t("endpointsHelp")}
                fieldLabelId="endpoints"
              />
            }
            fieldId="kc-endpoints"
          >
            <Stack>
              <StackItem>
                <FormattedLink
                  href={`${addTrailingSlash(
                    serverBaseUrl,
                  )}realms/${realmName}/.well-known/openid-configuration`}
                  title={t("openIDEndpointConfiguration")}
                />
              </StackItem>
              <StackItem>
                <FormattedLink
                  href={`${addTrailingSlash(
                    serverBaseUrl,
                  )}realms/${realmName}/protocol/saml/descriptor`}
                  title={t("samlIdentityProviderMetadata")}
                />
              </StackItem>
              {isOpenid4vciEnabled && realm.verifiableCredentialsEnabled && (
                <StackItem>
                  <FormattedLink
                    href={`${addTrailingSlash(
                      serverBaseUrl,
                    )}.well-known/openid-credential-issuer/realms/${realmName}`}
                    title={t("oid4vcIssuerMetadata")}
                  />
                </StackItem>
              )}
              {isSsfEnabled && ssfTransmitterEnabled?.toString() === "true" && (
                <StackItem>
                  <FormattedLink
                    href={`${addTrailingSlash(
                      serverBaseUrl,
                    )}realms/${realmName}/.well-known/ssf-configuration`}
                    title={t("ssfConfigurationMetadata")}
                  />
                </StackItem>
              )}
            </Stack>
          </FormGroup>
          <FixedButtonsGroup
            name="realmSettingsGeneralTab"
            reset={setupForm}
            isSubmit
          />
        </FormAccess>
      </FormProvider>
    </PageSection>
  );
}
