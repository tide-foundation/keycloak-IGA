import { useWatch, useForm } from "react-hook-form";
import {
  AlertVariant,
  FormGroup,
  ClipboardCopy,
  Label,
  Button,
  Text,
  Spinner,
} from "@patternfly/react-core";
import { HelpItem, ScrollForm } from "@keycloak/keycloak-ui-shared";
import { useState, FC, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { FormAccess } from "../form/FormAccess.js";
import { useRealm } from "../../context/realm-context/RealmContext.js";
import ComponentRepresentation from "@keycloak/keycloak-admin-client/lib/defs/componentRepresentation";
import { useAdminClient } from "../../admin-client.js";
import { useParams } from "../../utils/useParams.js";
import { useAlerts, useFetch } from "@keycloak/keycloak-ui-shared";
import { License, TideLicenseHistory } from "./TideLicenseHistory";
import { TideAdvancedTroubleshooting } from "./TideAdvancedTroubleshooting.js";
import { findTideComponent } from "../../identity-providers/utils/SignSettingsUtil.js";
import { EnterprisePricing } from "./pricing/EnterprisePricing";
import { ManageSubscriptionModal } from "./pricing/ManageSubscriptionModal";
import type { PricingQuote } from "./pricing/pricingApi";
import { environment } from "../../environment.js";

// TIDECLOAK IMPLEMENTATION
type TideLicensingTabProps = {
  refreshCallback?: () => Promise<void> | undefined;
};

enum LicensingTiers {
  Free = "FreeTier",
}

// `refreshCallback` stays on the props type for callers that already pass it,
// but is intentionally not destructured: nothing in this component has ever
// called it, and inventing a call site here would be a behaviour change.
/**
 * Pull the hosted-page URL out of a vendor redirect response.
 *
 * The admin client JSON-parses the body when it can and hands back the raw
 * string when it cannot, so these endpoints arrive as either `{redirectUrl}`,
 * `{url}`, or a bare URL depending on the server build. Throwing on an
 * unrecognised shape keeps the failure in the caller's catch, where it is
 * reported, instead of navigating the browser to "undefined".
 */
function readRedirectUrl(response: unknown): string {
  if (typeof response === "string") {
    const text = response.trim().replace(/^"|"$/g, "");
    if (/^https?:/i.test(text)) return text;
  } else if (response && typeof response === "object") {
    const { redirectUrl, url } = response as {
      redirectUrl?: string;
      url?: string;
    };
    const candidate = redirectUrl ?? url;
    if (candidate) return candidate;
  }
  throw new Error("The server did not return a redirect URL.");
}

// TIDECLOAK IMPLEMENTATION
// Sentinel bodies returned by the CreateTideVendorKey endpoint (text/plain).
// Any other body is the Stripe checkout URL, returned with HTTP 303.
const VENDOR_KEY_CREATED = "CREATED";
const VENDOR_KEY_NEEDS_PAYMENT = "NEED_PAYMENT";
/**
 * Run a vendor redirect call and land its hosted page in a new tab.
 *
 * The tab is opened BEFORE the request is issued: a `window.open` after an
 * await has lost user activation and the browser blocks it with no error. A
 * blocked open returns null, so that case falls back to this tab rather than
 * leaving the operator on a button that appears to do nothing.
 */
async function openRedirectInNewTab(
  request: () => Promise<unknown>,
): Promise<void> {
  // Not "noopener": that makes window.open return null and we need the handle.
  const tab = window.open("", "_blank");
  if (tab) tab.opener = null;
  try {
    const url = readRedirectUrl(await request());
    if (tab) tab.location.replace(url);
    else window.location.href = url;
  } catch (error) {
    tab?.close();
    throw error;
  }
}

// TIDECLOAK IMPLEMENTATION
// getSubscriptionStatus reports this when the vendor key exists but Stripe has
// not confirmed payment. The licensing tab treats it as "creation started but
// unfinished" and offers to resume rather than offering a fresh purchase.
const SUBSCRIPTION_AWAITING_PAYMENT = "awaiting_payment";

export const TideLicensingTab: FC<TideLicensingTabProps> = () => {
  const { t } = useTranslation();
  const { adminClient } = useAdminClient();

  const [activeLicenseDetails, setActiveLicenseDetails] = useState<string>("");
  const [licensingHistory, setLicensingHistory] = useState<License[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isPendingResign, setIsPendingResign] = useState<boolean>(false);
  const [isInitialCheckout, setIsInitialCheckout] = useState<boolean>(false);

  const [hasTideIdpPresent, setHasTideIdpPresent] = useState(false);
  // Whether the payer node supports package-based capacity changes. False for
  // an older payer, which has no Capabilities route — the control is then
  // HIDDEN rather than shown and allowed to fail quietly, because that payer
  // ignores unknown fields and would bill a single price for a bundle.
  const [canChangeCapacity, setCanChangeCapacity] = useState(false);
  const [isChangingCapacity, setIsChangingCapacity] = useState(false);
  const [isCapacityOpen, setIsCapacityOpen] = useState(false);
  // Set when the payer refuses for want of a card (402) — the free-tier case.
  // Null until asked. Drives whether the capacity change is offered at all,
  // so the operator is told what is missing BEFORE choosing a plan rather than
  // being refused after.
  const [hasPaymentMethod, setHasPaymentMethod] = useState<boolean | null>(
    null,
  );
  const [needsCard, setNeedsCard] = useState(false);
  // The subscription status behind an unlicensed realm, or null when it has not
  // been read yet / could not be read. Only consulted while `config.vvkId` is
  // blank, i.e. on the branch that would otherwise offer the pricing card.
  const [subscriptionStatus, setSubscriptionStatus] = useState<string | null>(
    null,
  );
  const [isCheckingSubscription, setIsCheckingSubscription] = useState(false);
  const [missingSigKeys, setMissingSigKeys] = useState<string[]>([]);

  const [key, setKey] = useState(0);
  const { realm } = useRealm();
  const { addAlert, addError } = useAlerts();
  const form = useForm<ComponentRepresentation>({
    mode: "onChange",
  });
  const { reset, control } = form;
  const [currentUsers, setCurrentUsers] = useState<string>("0");
  const [licenseExpiry, setLicenseExpiry] = useState<string>("0");
  const [licenseMaxUserAcc, setLicenseMaxUserAcc] = useState<string>("0");
  const { id } = useParams<{ id: string }>();

  const signSettings = async () => {
    const tideComponent = await findTideComponent(adminClient, realm);
    if (tideComponent) {
      try {
        await adminClient.tideAdmin.signIdpSettings();
        await refresh();
        addAlert(t("Configurations signed successfully"), AlertVariant.success);
      } catch (error) {
        addError("SignSettingsError", error);
      }
    }
  };

  const isBlank = (v: unknown) =>
    v == null || (typeof v === "string" && v.trim() === "");

  const checkTideIdpSecurity = async () => {
    try {
      const idp = await adminClient.identityProviders.findOne({
        alias: "tide",
      });
      const present = !!idp;
      setHasTideIdpPresent(present);

      if (!present) {
        setMissingSigKeys([]);
        return;
      }

      const cfg = (idp as any)?.config ?? {};
      const sigKeys = [
        "settingsSig",
        "loginURLSig",
        "linkTideURLSig",
        "changeSetURLSig",
      ];

      const missing = sigKeys.filter((k) => isBlank(cfg[k]));
      setMissingSigKeys(missing);
    } catch (e) {
      console.error("Failed to check Tide IDP security", e);
      setMissingSigKeys([]);
      setHasTideIdpPresent(false);
    }
  };

  useEffect(() => {
    void checkTideIdpSecurity();
  }, [realm, key]);

  // Function to ensure each watched field is a single string
  function getSingleValue(value: string | string[] | undefined): string {
    if (value === undefined) return "";
    return Array.isArray(value) ? value[0] : value;
  }

  // One `useWatch` per field, at the top level. This was previously a
  // `fieldNames.reduce(...)` that called the hook inside the callback: stable
  // in practice (fieldNames is a fixed const tuple, so the call order never
  // varied) but a rules-of-hooks violation, and it would break silently the
  // day fieldNames became conditional. Unrolled, it is the same hook order,
  // visibly so.
  const watchConfigGVRK = getSingleValue(
    useWatch({ control, name: "config.gVRK" }),
  );
  const watchConfigPayerPub = getSingleValue(
    useWatch({ control, name: "config.payerPublic" }),
  );
  const watchConfigPendingGVRK = getSingleValue(
    useWatch({ control, name: "config.pendingGVRK" }),
  );
  const watchConfigVVKId = getSingleValue(
    useWatch({ control, name: "config.vvkId" }),
  );
  const watchConfigCustomerId = getSingleValue(
    useWatch({ control, name: "config.customerId" }),
  );
  const watchConfigMaxUserAcc = getSingleValue(
    useWatch({ control, name: "config.maxUserAcc" }),
  );

  useFetch(
    async () => {
      if (id) return await adminClient.components.findOne({ id });
    },
    (result) => {
      if (result) {
        reset({ ...result });
      }
    },
    [],
  );

  // Helper functions
  const hasValue = (value: string) => value !== "";

  const retry = async (
    fn: () => Promise<boolean | undefined>,
    retries = 3,
    delay = 1000,
  ) => {
    for (let i = 0; i < retries; i++) {
      try {
        const result = await fn();
        if (result) {
          return result; // Success, return the result
        }
      } catch (error) {
        console.error(`Attempt ${i + 1} failed. Retrying...`, error);
      }
      // Wait before retrying
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    throw new Error(`Failed after ${retries} retries`);
  };

  const isLicensePending = () => {
    const hash = window.location.hash;
    const queryIndex = hash.indexOf("?");

    if (queryIndex !== -1) {
      const queryString = hash.substring(queryIndex + 1); // Remove the part before '?'
      const queryParams = new URLSearchParams(queryString);

      const retryLicenseActivation =
        queryParams.get("licensePending") === "true";
      // Remove the query parameters from the hash, no longer need it
      window.location.hash = hash.substring(0, queryIndex); // Keep only the part before the '?'
      return retryLicenseActivation;
    }
    // Return false if no query parameters are found
    return false;
  };

  useEffect(() => {
    const activateLicense = async () => {
      try {
        let signSettingsRequired;
        if (!hasValue(watchConfigVVKId) && isLicensePending()) {
          // Retry every second for a minute
          signSettingsRequired = await retry(
            async () => await checkLicenseActive(),
            60,
          );
        } else {
          const isLicenseActive = await checkLicenseActive();
          signSettingsRequired = isLicenseActive;
        }
        // license renewed

        if (signSettingsRequired) {
          // Payment has landed — resume vendor key creation. No licensing tier
          // is sent: the backend already has it from the initial call.
          const result = await createTideVendorKey();

          if (result === VENDOR_KEY_NEEDS_PAYMENT) {
            // Not a failure: the Tide network hasn't collected payment from
            // Stripe yet. Leave the key alone and let the user retry — if they
            // genuinely haven't paid, the retry hands back a Stripe URL.
            setIsLoading(false);
            await refresh();
            addAlert(
              t("Awaiting payment confirmation, please try again shortly."),
              AlertVariant.warning,
            );
            return;
          }

          if (result !== VENDOR_KEY_CREATED) {
            // A fresh Stripe checkout URL was issued — send the user back.
            window.location.href = result;
            return;
          }

          await refresh(); // refresh current page
          setIsLoading(false); // Loading is done
          setIsPendingResign(false);
        } else if (!isInitialCheckout) {
          setIsLoading(false);
        }
      } catch (err) {
        // TIDECLOAK IMPLEMENTATION: standard-logging slice — surface the
        // underlying error to the user instead of swallowing to console only.
        addError("tideLicenseRenewError", err);
        setIsLoading(false);
        setIsInitialCheckout(true);
        // If we reach here, it means the license is still not active after retries
        addAlert(
          t("License could not be activated, please retry."),
          AlertVariant.danger,
        );
        await adminClient.tideAdmin.reAddTideKey();
        await refresh();
      } finally {
        await refresh();
      }
    };

    if (!isPendingResign && hasValue(watchConfigPendingGVRK)) {
      setIsPendingResign(true);
      setIsLoading(true);
      void activateLicense();
    }
  }, [watchConfigPendingGVRK]);

  useEffect(() => {
    const licenseDetails = JSON.stringify(
      {
        vvkId: watchConfigVVKId,
        customerId: watchConfigCustomerId,
        gVRK: watchConfigGVRK,
        payerPub: watchConfigPayerPub,
      },
      null,
      2,
    );
    setActiveLicenseDetails(licenseDetails);
  }, [watchConfigGVRK, watchConfigPayerPub, watchConfigVVKId]);

  useEffect(() => {
    const fetchLicenseDetails = async () => {
      if (hasValue(activeLicenseDetails)) {
        const response = await adminClient.tideAdmin.getLicenseDetails();
        const date = new Date(response.expiryDate * 1000);
        const day = date.getUTCDate().toString().padStart(2, "0");
        const month = (date.getUTCMonth() + 1).toString().padStart(2, "0"); // Months are zero-based
        const year = date.getUTCFullYear().toString().slice(-2);
        const formattedDate = `${day}/${month}/${year}`;

        setCurrentUsers(response.currentUserAcc);
        setLicenseMaxUserAcc(watchConfigMaxUserAcc);
        setLicenseExpiry(formattedDate);
      }
    };
    if (hasValue(watchConfigVVKId)) {
      void fetchLicenseDetails();
    }
  }, [watchConfigVVKId, watchConfigMaxUserAcc, key, activeLicenseDetails]);

  const checkLicenseActive = async () => {
    try {
      const provider = await adminClient.components.findOne({ id });
      const isActive = await adminClient.tideAdmin.isPendingLicenseActive();
      const isInitialSetup = !hasValue(getSingleValue(provider?.config?.vvkId));

      return isActive && isInitialSetup;
    } catch (error) {
      console.error("Error checking license:", error);
      return false; // Return false in case of an error
    }
  };

  const refresh = async () => {
    const latest = await adminClient.components.findOne({ id });
    reset(latest);
    setKey(key + 1);
  };

  // TIDECLOAK IMPLEMENTATION
  // Single entry point for vendor key creation. The backend decides what needs
  // to happen next from the current vendor key state and answers in the body:
  // "CREATED", "NEED_PAYMENT", or a Stripe checkout URL. `licensingTier` is
  // only read on the first call, when no key exists yet.
  const createTideVendorKey = async (
    licensingTier?: string,
    requestedUsers?: number,
  ) => {
    const data = new FormData();
    if (licensingTier) {
      data.append("licensingTier", licensingTier);
    }
    // The capacity the operator picked on the pricing card. Today's backend
    // signature is CreateTideVendorKey(@FormParam("licensingTier")) only, so
    // this extra form param is dropped server-side and checkout still buys the
    // tier alone — see the note on handleChoosePlan. It is sent regardless so
    // the count is not lost at the call site, and so the flow starts honouring
    // the chosen capacity the moment the endpoint reads it.
    if (requestedUsers !== undefined) {
      data.append("requestedUsers", String(requestedUsers));
    }
    const result = await adminClient.tideAdmin.createTideVendorKey(data);
    return (result ?? "").trim();
  };

  // TIDECLOAK IMPLEMENTATION
  // Shared handling of a CreateTideVendorKey response body, used by both the
  // first-time purchase and the resume path.
  const applyVendorKeyResult = async (result: string) => {
    if (result === VENDOR_KEY_CREATED) {
      // Key already exists — there is nothing to pay for.
      setIsLoading(false);
      await refresh();
      return;
    }

    if (result === VENDOR_KEY_NEEDS_PAYMENT) {
      // Awaiting payment, but the backend has no checkout URL to send us to.
      setIsLoading(false);
      await refresh();
      addAlert(
        t("Awaiting payment confirmation, please try again shortly."),
        AlertVariant.warning,
      );
      return;
    }

    // Anything else is the Stripe checkout URL (HTTP 303).
    window.location.href = result;
  };

  const handleCheckout = async (
    licensingTier: string,
    requestedUsers?: number,
  ) => {
    try {
      setIsInitialCheckout(true);
      setIsLoading(true);

      await applyVendorKeyResult(
        await createTideVendorKey(licensingTier, requestedUsers),
      );
    } catch (err) {
      await adminClient.tideAdmin.reAddTideKey();
      setIsLoading(false);
      await refresh();
      addAlert(t("Error with checkout, try again"), AlertVariant.danger);
      throw err;
    }
  };

  /**
   * "Continue License Creation" — the realm already has a vendor key awaiting
   * payment, so there is nothing to choose. No licensing tier is sent: the
   * backend is past the NotCreated branch and keeps the tier from the first
   * call. The usual outcome is a fresh Stripe checkout URL to redirect to.
   */
  const handleContinueLicenseCreation = async () => {
    try {
      setIsInitialCheckout(true);
      setIsLoading(true);
      await applyVendorKeyResult(await createTideVendorKey());
    } catch (err) {
      // Deliberately no reAddTideKey() here, unlike handleCheckout: that undoes
      // a key this flow did not create, and the key is mid-purchase.
      setIsLoading(false);
      await refresh();
      addError("Could not continue license creation", err);
    }
  };

  /**
   * "Request License" from the pricing card. The operator has chosen a capacity
   * and the SERVER has quoted the cheapest bundle of Stripe packages for it.
   *
   * The checkout call below still takes a single `licensingTier` STRING and is
   * proxied to Stripe through Midgard/ORK, which has no notion of a multi-price
   * bundle — so the quote cannot be honoured end-to-end yet. Rather than
   * pretend otherwise, the chosen bundle is recorded (priceIds and the
   * ready-to-use `stripeQuantity` per package) and the existing checkout is
   * started unchanged, so nothing about today's flow regresses.
   *
   * TO WIRE THE BUNDLE THROUGH: post the requested USER COUNT (not the bundle,
   * and never an amount) to the server, have it re-quote with
   * `PricingService.quote`, and build the Checkout Session line items from the
   * Prices it resolved itself. Re-quoting server-side is what stops a caller
   * proposing its own combination, and it is free — the tier list is cached.
   */
  const handleChoosePlan = async (quote: PricingQuote) => {
    // Sends the COUNT, not the bundle. This previously logged the quote and
    // then requested the free tier regardless, so choosing any paid capacity
    // silently bought the free plan.
    await handleCheckout(LicensingTiers.Free, quote.requestedUsers);
  };

  const generateJWK = async () => {
    const content = await adminClient.tideAdmin.getTideJwk();
    const jwk = JSON.stringify(content);
    const blob = new Blob([jwk], { type: "text/plain" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "tide-eddsa.jwk";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(link.href);
  };

  /**
   * Ask the payer what it supports, once this realm actually has a
   * subscription to change. Any failure means "not available" rather than an
   * error the operator can act on.
   */
  const checkPayerCapabilities = async () => {
    try {
      // makeRequest already parses the body, so this is the object itself —
      // calling .json() on it throws, which the catch below turned into
      // "capabilities unavailable" and silently hid the control.
      const caps = await adminClient.tideAdmin.payerCapabilities();
      setCanChangeCapacity(
        caps.changeCapacity === true && caps.packagePlansConfigured === true,
      );
      const status = await adminClient.tideAdmin.paymentMethodStatus();
      setHasPaymentMethod(status.hasPaymentMethod === true);
    } catch {
      setCanChangeCapacity(false);
    }
  };

  /**
   * Buy more (or fewer) units. Sends the USER COUNT; the server quotes it and
   * sends the packages it resolved, prorated against the existing billing
   * anchor. Success means ACCEPTED — capacity lands when the invoice is paid.
   */
  /**
   * Apply the capacity the operator chose in the modal.
   *
   * Sends the requested USER COUNT, not the bundle: the server re-quotes it and
   * sends the packages it resolved, so the browser never proposes a
   * combination, let alone an amount.
   */
  const handleChangeCapacity = async (quote: PricingQuote) => {
    try {
      setIsChangingCapacity(true);
      const form = new FormData();
      form.append("users", String(quote.requestedUsers));
      await adminClient.tideAdmin.changeCapacity(form);
      setIsCapacityOpen(false);
      addAlert(
        t(
          "Capacity change submitted. It applies once the prorated invoice is paid.",
        ),
        AlertVariant.success,
      );
      await refresh();
    } catch (error) {
      // 402 means the capacity is fine but there is no card on file. Offer to
      // collect one rather than reporting a failure the operator cannot act on.
      const status = (error as { response?: { status?: number } }).response
        ?.status;
      if (status === 402) {
        setIsCapacityOpen(false);
        setNeedsCard(true);
      } else {
        addError("Could not change capacity", error);
      }
    } finally {
      setIsChangingCapacity(false);
    }
  };

  /**
   * Send the operator to Stripe's hosted card page, then back here.
   *
   * Goes through readRedirectUrl rather than reading `.redirectUrl` directly:
   * the admin client parses a non-JSON body into a plain string, so a server
   * answering with a bare URL yields no `redirectUrl` field and the browser
   * navigates to the literal text "undefined".
   */
  const handleAddPaymentMethod = async () => {
    try {
      await openRedirectInNewTab(() => {
        const form = new FormData();
        form.append("returnUrl", window.location.href);
        return adminClient.tideAdmin.addPaymentMethod(form);
      });
    } catch (error) {
      addError("Could not start payment method collection", error);
    }
  };

  const handleManageSubscription = async () => {
    try {
      const redirectUrl = window.location.href.endsWith("/")
        ? window.location.href.slice(0, -1)
        : window.location.href;
      await openRedirectInNewTab(() => {
        const form = new FormData();
        form.append("redirectUrl", redirectUrl);
        return adminClient.tideAdmin.createCustomerPortalSession(form);
      });
    } catch (error) {
      // Previously uncaught: a portal session the payer refused left the
      // button looking inert with nothing said.
      addError("Could not open the subscription portal", error);
    }
  };

  const fetchPendingLicense = async () => {
    if (watchConfigPendingGVRK === "") {
      return null;
    }
    const tempLicenseDetails = {
      vvkId: watchConfigVVKId,
      customerId: watchConfigCustomerId,
      gVRK: watchConfigPendingGVRK,
      payerPub: watchConfigPayerPub,
    };
    const utcNowTimestamp = Date.now();
    const authForm = new FormData();
    authForm.append("data", utcNowTimestamp.toString());
    const response = await adminClient.tideAdmin.getSubscriptionStatus();
    const pendingLicense = {
      licenseData: JSON.stringify(tempLicenseDetails, null, 2),
      status: response.toString(),
      date: licenseExpiry,
    };

    return pendingLicense;
  };

  const getLicenseHistory = async () => {
    try {
      const response: License[] =
        await adminClient.tideAdmin.getLicenseHistory();
      const pendingLicense = await fetchPendingLicense();
      if (pendingLicense !== null) {
        response.unshift(pendingLicense);
      }

      setLicensingHistory(response); // Update state with filtered tasks
    } catch (error) {
      console.error("Failed to fetch license history:", error);
    }
  };

  useEffect(() => {
    if (!hasValue(watchConfigVVKId)) return;
    void checkPayerCapabilities();
  }, [watchConfigVVKId, key]);

  // TIDECLOAK IMPLEMENTATION
  // Only asked while the realm is unlicensed: a licensed realm renders the
  // details branch and never reaches the pricing card this guards.
  useEffect(() => {
    const readSubscriptionStatus = async () => {
      if (hasValue(watchConfigVVKId)) {
        setSubscriptionStatus(null);
        return;
      }
      setIsCheckingSubscription(true);
      try {
        const status = await adminClient.tideAdmin.getSubscriptionStatus();
        setSubscriptionStatus((status ?? "").toString().trim());
      } catch (error) {
        // 400 when the realm has no tide-vendor-key component, or the payer
        // could not be reached. Neither is a reason to block the purchase
        // path, so fall through to the pricing card.
        console.error("Failed to read the subscription status:", error);
        setSubscriptionStatus(null);
      } finally {
        setIsCheckingSubscription(false);
      }
    };
    void readSubscriptionStatus();
  }, [watchConfigVVKId, key]);

  useEffect(() => {
    void getLicenseHistory();
  }, [watchConfigPayerPub, watchConfigPendingGVRK, watchConfigVVKId, key]);

  const isAwaitingPayment =
    subscriptionStatus === SUBSCRIPTION_AWAITING_PAYMENT;

  const isConfigUnsecured =
    hasTideIdpPresent &&
    missingSigKeys.length > 0 &&
    hasValue(watchConfigVVKId);
  const secureStatus: "secure" | "failed" = isConfigUnsecured
    ? "failed"
    : "secure";
  const retryVariant = secureStatus === "failed" ? "danger" : "secondary";

  const sections = [
    {
      title: t("Active License"),
      panel: (
        <FormAccess role="manage-identity-providers" isHorizontal>
          {isLoading ? (
            <Spinner size="xl" />
          ) : hasValue(watchConfigVVKId) ? (
            <>
              <FormGroup
                label={t("License Details")}
                labelIcon={
                  <HelpItem
                    helpText={
                      "This is the details of your current active license. Save a copy locally."
                    }
                    fieldLabelId={"LicenseDetails"}
                  />
                }
                fieldId="active-license-details"
              >
                <ClipboardCopy isCode isReadOnly>
                  {activeLicenseDetails}
                </ClipboardCopy>
              </FormGroup>

              <FormGroup
                label={t("Current VRK")}
                labelIcon={
                  <HelpItem
                    helpText={
                      "The live active VRK currently in use by this license."
                    }
                    fieldLabelId={"LicenseCurrentVRK"}
                  />
                }
                fieldId="license-current-vrk"
              >
                {hasValue(watchConfigGVRK) ? (
                  <ClipboardCopy isCode isReadOnly>
                    {watchConfigGVRK}
                  </ClipboardCopy>
                ) : (
                  <span style={{ opacity: 0.7 }}>—</span>
                )}
              </FormGroup>

              <FormGroup
                label={t("Expiry Date")}
                labelIcon={
                  <HelpItem
                    helpText={"The expiry date of this active license"}
                    fieldLabelId={"LicenseExpiry"}
                  />
                }
                fieldId="license-expiry"
              >
                <Label>{licenseExpiry}</Label>
              </FormGroup>

              <FormGroup
                label={t("Max User Accounts")}
                labelIcon={
                  <HelpItem
                    helpText={
                      "The max amount of user accounts for this license"
                    }
                    fieldLabelId={"LicenseMaxUserAccounts"}
                  />
                }
                fieldId="license-max-user-accounts"
              >
                <Label>{licenseMaxUserAcc}</Label>
              </FormGroup>

              <FormGroup
                label={t("Current User Accounts")}
                labelIcon={
                  <HelpItem
                    helpText={
                      "The current amount of user accounts on this license"
                    }
                    fieldLabelId={"LicenseCurrentUserAccounts"}
                  />
                }
                fieldId="license-current-user-accounts"
              >
                <Label>{currentUsers}</Label>
              </FormGroup>

              <FormGroup
                label={t("JWK")}
                labelIcon={
                  <HelpItem
                    helpText={"JWK needed for client authentication"}
                    fieldLabelId={"LicenseJWK"}
                  />
                }
                fieldId="license-jwk"
              >
                <Button type="button" onClick={async () => await generateJWK()}>
                  {t("Export")}
                </Button>
              </FormGroup>

              <FormGroup
                label={t("License Subscription")}
                labelIcon={
                  <HelpItem
                    helpText={"Manage your subscription here."}
                    fieldLabelId={"LicenseSubscription"}
                  />
                }
                fieldId="license-subscription"
              >
                <Button type="button" onClick={() => setIsCapacityOpen(true)}>
                  {t("Manage")}
                </Button>
              </FormGroup>

              <FormGroup
                label={t("Secure Configuration")}
                fieldId="secure-configuration"
              >
                <div className="pf-v5-u-display-flex pf-v5-u-align-items-center pf-v5-u-gap-md">
                  {secureStatus === "secure" ? (
                    <Label color="green" className="pf-v5-u-mr-lg">
                      {t("Secure")}
                    </Label>
                  ) : (
                    <Label
                      color="red"
                      className="pf-v5-u-font-weight-bold pf-v5-u-mr-lg"
                    >
                      {t("Failed")}
                    </Label>
                  )}
                  <Button
                    type="button"
                    variant={retryVariant} // outlined if secure, filled red if failed
                    data-testid="secure-config-retry"
                    onClick={signSettings}
                  >
                    {t("Retry")}
                  </Button>
                </div>
              </FormGroup>
            </>
          ) : isCheckingSubscription ? (
            <Spinner size="xl" />
          ) : isAwaitingPayment ? (
            // Creation was already started and is waiting on Stripe. Offering
            // the pricing card here would invite a second purchase, so the only
            // action is to resume the one in flight.
            <>
              <FormGroup fieldId="awaiting-payment">
                <Text>
                  {t(
                    "License creation has started but payment is not complete.",
                  )}
                </Text>
              </FormGroup>
              <FormGroup fieldId="continue-license-creation">
                <Button
                  variant="primary"
                  data-testid="continue-license-creation"
                  onClick={handleContinueLicenseCreation}
                >
                  {t("Continue License Creation")}
                </Button>
              </FormGroup>
            </>
          ) : (
            <>
              <FormGroup fieldId="no-active-license">
                <Text>{t("No active license found.")}</Text>
              </FormGroup>
              {/* Replaces the old bare "Request License" button: choose a
                      capacity and see the live Stripe price for it first. */}
              <FormGroup fieldId="request-license">
                <EnterprisePricing
                  serverBaseUrl={environment.serverBaseUrl}
                  realm={realm}
                  onChoose={handleChoosePlan}
                  // The free plan is the existing free-tier request. Without
                  // this the $0 call to action was a no-op: the card calls
                  // onChooseFree, which nothing supplied.
                  onChooseFree={async () =>
                    await handleCheckout(LicensingTiers.Free)
                  }
                  isCtaDisabled={isLoading}
                  // This console and the tidecloak-key-provider jar ship as
                  // separate artifacts, so it can be pointed at a Keycloak
                  // whose jar has no pricing endpoints. There, the tab falls
                  // back to exactly the button it had before pricing existed:
                  // an operator on an older image is never left without a way
                  // to request a license.
                  unsupportedFallback={
                    <Button
                      variant="primary"
                      onClick={async () =>
                        await handleCheckout(LicensingTiers.Free)
                      }
                    >
                      {t("Request License")}
                    </Button>
                  }
                />
              </FormGroup>
            </>
          )}
        </FormAccess>
      ),
    },
    {
      title: t("Activity Log"),
      panel: <TideLicenseHistory licenseList={licensingHistory} />,
    },
    {
      title: t("Advanced Troubleshooting"),
      panel: <TideAdvancedTroubleshooting onCompleted={refresh} />,
    },
  ];

  return (
    <FormAccess role="manage-identity-providers" isHorizontal>
      <ManageSubscriptionModal
        isOpen={isCapacityOpen}
        onClose={() => setIsCapacityOpen(false)}
        serverBaseUrl={environment.serverBaseUrl}
        realm={realm}
        currentUsers={licenseMaxUserAcc}
        usersInUse={currentUsers}
        expiry={licenseExpiry}
        onChangeCapacity={handleChangeCapacity}
        isSubmitting={isChangingCapacity}
        onOpenStripePortal={handleManageSubscription}
        needsCard={needsCard}
        hasPaymentMethod={hasPaymentMethod}
        canChangeCapacity={canChangeCapacity}
        onAddPaymentMethod={handleAddPaymentMethod}
      />
      <ScrollForm
        label={t("jumpToSection")}
        className="pf-v5-u-px-lg"
        sections={sections}
      />
    </FormAccess>
  );
};
