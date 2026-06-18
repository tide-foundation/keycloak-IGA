import type IdentityProviderRepresentation from "@keycloak/keycloak-admin-client/lib/defs/identityProviderRepresentation";
import {
  ActionGroup,
  AlertVariant,
  Button,
  PageSection,
  Grid,
  GridItem,
} from "@patternfly/react-core";
import { useMemo, useEffect, useRef } from "react";
import { FormProvider, useForm } from "react-hook-form";
import { useTranslation } from "react-i18next";
import { Link, useNavigate } from "react-router-dom";
import { useAdminClient } from "../../admin-client";
import { useAlerts } from "@keycloak/keycloak-ui-shared";
import { DynamicComponents } from "../../components/dynamic/DynamicComponents";
import { FormAccess } from "../../components/form/FormAccess";
import { ViewHeader } from "../../components/view-header/ViewHeader";
import { useRealm } from "../../context/realm-context/RealmContext";
import { useServerInfo } from "../../context/server-info/ServerInfoProvider";
import { toUpperCase } from "../../util";
import { useParams } from "../../utils/useParams";
import { toIdentityProvider } from "../routes/IdentityProvider";
import type { IdentityProviderCreateParams } from "../routes/IdentityProviderCreate";
import { toIdentityProviders } from "../routes/IdentityProviders";
import { GeneralSettings } from "./GeneralSettings";

export default function AddIdentityProvider() {
  const { adminClient } = useAdminClient();

  const { t } = useTranslation();
  const { providerId } = useParams<IdentityProviderCreateParams>();
  const form = useForm<IdentityProviderRepresentation>({ mode: "onChange" });
  const serverInfo = useServerInfo();

  const providerInfo = useMemo(() => {
    const namespaces = [
      "org.keycloak.broker.social.SocialIdentityProvider",
      "org.keycloak.broker.provider.IdentityProvider",
    ];

    for (const namespace of namespaces) {
      const social = serverInfo.componentTypes?.[namespace]?.find(
        ({ id }) => id === providerId,
      );

      if (social) {
        return social;
      }
    }
  }, [serverInfo, providerId]);

  const {
    handleSubmit,
    formState: { isValid },
  } = form;

  const { addAlert, addError } = useAlerts();
  const navigate = useNavigate();
  const { realm } = useRealm();

  /** TIDECLOAK IMPLEMENTATION START */
  // For the `tide` provider, do NOT create the IdP piecemeal (toggle-ragnarok +
  // identityProviders.create + sign-idp-settings). Instead call the backend
  // `setUpTideRealm` endpoint once with `skipLicense=true`: it creates the
  // `tide` IdP, the tide-vendor-key component, and signs the IdP settings —
  // WITHOUT acquiring a license. Licensing is a separate, manual Stripe Checkout
  // step performed later from the licensing tab (where Stripe collects the email
  // and T&Cs), so no email is collected here.
  const setUpTideRealm = async (provider: IdentityProviderRepresentation) => {
    try {
      const data = new FormData();
      data.append("skipLicense", "true");
      data.append("isRagnarokEnabled", "true");
      await adminClient.tideAdmin.setUpTideRealm(data);

      addAlert(t("createIdentityProviderSuccess"), AlertVariant.success);
      navigate(
        toIdentityProvider({
          realm,
          providerId,
          alias: provider.alias!,
          tab: "settings",
        }),
      );
    } catch (error) {
      addError("createError", error);
    }
  };

  // Auto-provision the `tide` IdP on mount. Selecting "Tide" in the IdP list
  // navigates here; there are no form fields to fill (email/licensing is a
  // separate manual Stripe step), so there is no Add button for tide and the
  // submit-button path can never fire (the form is never "dirty"/valid). Instead
  // we call `setUpTideRealm` exactly once when the page loads. The ref guard
  // prevents re-runs across re-renders / React 18 StrictMode double-invoke.
  const tideProvisioned = useRef(false);
  useEffect(() => {
    if (providerId !== "tide" || tideProvisioned.current) {
      return;
    }
    tideProvisioned.current = true;
    void setUpTideRealm({
      alias: providerId,
    } as IdentityProviderRepresentation);
  }, [providerId]);
  /** TIDECLOAK IMPLEMENTATION END */

  const onSubmit = async (provider: IdentityProviderRepresentation) => {
    /** TIDECLOAK IMPLEMENTATION START */
    if (providerId === "tide") {
      await setUpTideRealm(provider);
      return;
    }
    /** TIDECLOAK IMPLEMENTATION END */
    try {
      await adminClient.identityProviders.create({
        ...provider,
        config: {
          ...provider.config,
        },
        providerId,
        alias: provider.alias!,
      });

      addAlert(t("createIdentityProviderSuccess"), AlertVariant.success);
      navigate(
        toIdentityProvider({
          realm,
          providerId,
          alias: provider.alias!,
          tab: "settings",
        }),
      );
    } catch (error) {
      addError("createError", error);
    }
  };

  /** TIDECLOAK IMPLEMENTATION END */
  const alias = form.getValues("alias");

  if (!alias) {
    form.setValue("alias", providerId);
  }

  return (
    <>
      <ViewHeader
        titleKey={t("addIdentityProvider", {
          provider: toUpperCase(providerId),
        })}
      />
      <PageSection variant="light">
        <Grid hasGutter>
          <GridItem span={12} md={8}>
            <FormAccess
              role="manage-identity-providers"
              isHorizontal
              onSubmit={handleSubmit(onSubmit)}
            >
              <FormProvider {...form}>
                <GeneralSettings id={providerId} />
                {providerInfo && (
                  <DynamicComponents
                    stringify
                    properties={providerInfo.properties}
                    isTideProvider={providerId === "tide"}
                  />
                )}
              </FormProvider>
              <ActionGroup>
                {/** TIDECLOAK: tide auto-provisions on mount, no submit button */}
                {providerId !== "tide" && (
                  <Button
                    isDisabled={!isValid}
                    variant="primary"
                    type="submit"
                    data-testid="createProvider"
                  >
                    {t("add")}
                  </Button>
                )}
                <Button
                  variant="link"
                  data-testid="cancel"
                  component={(props) => (
                    <Link {...props} to={toIdentityProviders({ realm })} />
                  )}
                >
                  {t("cancel")}
                </Button>
              </ActionGroup>
            </FormAccess>
          </GridItem>
        </Grid>
      </PageSection>
    </>
  );
}
