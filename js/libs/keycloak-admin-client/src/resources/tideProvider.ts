import type { KeycloakAdminClient } from "../client.js";
import { RequiredActionAlias } from "../defs/requiredActionProviderRepresentation.js";
import Resource from "./resource.js";

/* TIDECLOAK IMPLEMENTATION */
interface stripeCheckoutSessionResponse {
    message: string,
    activationPackage: string,
    redirectUrl: string,

}

<<<<<<< HEAD
/* TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
interface License {
    licenseData: string;
    status: string;
    date: string;
}

<<<<<<< HEAD
/* TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
interface licenseDetails {
    currentUserAcc: string,
    expiryDate: number,
}

<<<<<<< HEAD
/* TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
interface scheduledTaskInfo {
    taskName: string,
    startDateMillis: number,
    delayMillis: number,

}

<<<<<<< HEAD
/* TIDECLOAK IMPLEMENTATION */
export class TideProvider extends Resource<{ realm?: string }> {
    /* # TIDECLOAK IMPLEMENTATION */
=======
export class TideProvider extends Resource<{ realm?: string }> {
>>>>>>> origin/release/0.13.26
    public getRequiredActionLink = this.makeRequest<
        {
            userId: string;
            clientId?: string;
            lifespan?: number;
            redirectUri?: string;
            actions?: (RequiredActionAlias | string)[];
        },
        string
    >({
        method: "POST",
        path: "/tideAdminResources/get-required-action-link",
        payloadKey: "actions",
        queryParamKeys: ["lifespan", "redirectUri", "clientId", "userId"],
        keyTransform: {
            clientId: "client_id",
            redirectUri: "redirect_uri",
        },
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public toggleRagnarok = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/ragnarok/toggle-ragnarok",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public addAuthorization = this.makeRequest<FormData, string>({
        method: "POST",
        path: "/tideAdminResources/add-authorization",
    });
<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public addRejection = this.makeRequest<FormData, string>({
        method: "POST",
        path: "/tideAdminResources/add-rejection",
    });
<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
    public addReview = this.makeRequest<FormData, string>({
=======
        public addReview = this.makeRequest<FormData, string>({
>>>>>>> origin/release/0.13.26
        method: "POST",
        path: "/tideAdminResources/add-review",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public saveFirstAdminAuthorizer = this.makeRequest<FormData, string>({
        method: "POST",
        path: "/vendorResources/first-admin-authorizer"
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public getVouchers = this.makeRequest<FormData, string>({
        method: "POST",
        path: "/tideAdminResources/new-voucher"
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public rotateVrk = this.makeRequest<void, string>({
        method: "POST",
        path: "/vendorResources/rotate-vrk"
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public switchVrk = this.makeRequest<{ gvrk?: string }, Response>({
    method: "POST",
    path: "/vendorResources/switch-vrk",
    queryParamKeys: ["gvrk"],
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======


>>>>>>> origin/release/0.13.26
    public getScheduledTasks = this.makeRequest<void, scheduledTaskInfo[]>({
        method: "GET",
        path: "/vendorResources/scheduledTasks",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public getLicenseHistory = this.makeRequest<void, License[]>({
        method: "GET",
        path: "/vendorResources/licenseHistory",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======

>>>>>>> origin/release/0.13.26
    public triggerScheduledTask = this.makeRequest<{ taskName: string }, Response>({
        method: "POST",
        path: "/vendorResources/scheduledTasks/{taskName}/trigger",
        urlParamKeys: ["taskName"],
        catchNotFound: true,
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======

>>>>>>> origin/release/0.13.26
    public scheduleGenVRKTask = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/scheduledTasks/genVRK/schedule",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======

>>>>>>> origin/release/0.13.26
    public uploadImage = this.makeRequest<FormData, Record<string, string>>({
        method: "POST",
        path: "/tide-idp-admin-resources/images/upload",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public getImageName = this.makeRequest<{ type: string }, string | null>({
        method: "GET",
        path: "/tide-idp-admin-resources/images/{type}/name",
        urlParamKeys: ["type"],
        catchNotFound: true,
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public deleteImage = this.makeRequest<{ type: string }, Response>({
        method: "DELETE",
        path: "/tide-idp-admin-resources/images/{type}/delete",
        urlParamKeys: ["type"],
        catchNotFound: true,
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public generateInitialKey = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/generate-initial-key",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public reAddTideKey = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/readd-tide-key",
    });
<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public signIdpSettings = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/sign-idp-settings",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public generateInitialVrk = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/generate-initial-vrk",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public confirmInitialVrk = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/confirm-initial-vrk",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public clearTempVrk = this.makeRequest<void, Response>({
        method: "POST",
        path: "/vendorResources/clear-temp-vrk",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======

>>>>>>> origin/release/0.13.26
    public generateVendorId = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/vendorResources/generate-vendor-id",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public signMessage = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/vendorResources/sign-message",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public authorizeStripeRequest = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/vendorResources/authorize-stripe-request",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public createStripeCheckoutSession = this.makeRequest<FormData, stripeCheckoutSessionResponse>({
        method: "POST",
        path: "/vendorResources/createStripeCheckoutSession",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public isPendingLicenseActive = this.makeRequest<void, boolean>({
        method: "GET",
        path: "/vendorResources/isPendingLicenseActive",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public getLicenseDetails = this.makeRequest<void, licenseDetails>({
        method: "GET",
        path: "/vendorResources/getLicenseDetails",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public getSubscriptionStatus = this.makeRequest<void, Response>({
        method: "GET",
        path: "/vendorResources/getSubscriptionStatus",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public createCustomerPortalSession = this.makeRequest<FormData, stripeCheckoutSessionResponse>({
        method: "POST",
        path: "/vendorResources/createCustomerPortalSession",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public updateSubscription = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/vendorResources/updateSubscription",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public cancelSubscription = this.makeRequest<void, Response>({
        method: "GET",
        path: "/vendorResources/cancelSubscription",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public getInstallationProviders = this.makeRequest<
        { clientId: string; providerId: string },
        string
    >({
        method: "GET",
        path: "/vendorResources/get-installations-provider",
        queryParamKeys: ["clientId", "providerId"],
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======

>>>>>>> origin/release/0.13.26
    public getTideJwk = this.makeRequest<void, Response>({
        method: "GET",
        path: "/vendorResources/get-tide-jwk",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public toggleIGA = this.makeRequest<FormData, Response>({
        method: "POST",
        path: "/tide-admin/toggle-iga",
    });

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public triggerLicenseRenewedEvent = this.makeRequest<{ error: boolean }, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerLicenseRenewedEvent/{error}"
    })
<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public triggerVendorKeyCreationEvent = this.makeRequest<{ error: boolean }, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerVendorKeyCreationEvent/{error}"
    })
<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public triggerAuthorizerUpdateEvent = this.makeRequest<{ error: boolean }, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerAuthorizerUpdateEvent/{error}"
    })
<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public triggerAuthorizeEvent = this.makeRequest<{ error: boolean }, void>({
        method: "GET",
        urlParamKeys: ["error"],
        path: "/vendorResources/triggerAuthorizeEvent/{error}"
    })

<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public offboardProvider = this.makeRequest<void, string>({
        method: "POST",
        path: "/ragnarok/trigger-offboarding",
    });
<<<<<<< HEAD
    /* # TIDECLOAK IMPLEMENTATION */
=======
>>>>>>> origin/release/0.13.26
    public licenseProvider = this.makeRequest<{ gvrk?: string }, string>({
        method: "POST",
        path: "/tideAdminResources/trigger-license-signing",
        queryParamKeys: ["gvrk"],
    });

    constructor(client: KeycloakAdminClient) {
        super(client, {
            path: "/admin/realms/{realm}",
            getUrlParams: () => ({
                realm: client.realmName,
            }),
            getBaseUrl: () => client.baseUrl,
        });
    }
<<<<<<< HEAD
}
=======
}
>>>>>>> origin/release/0.13.26
