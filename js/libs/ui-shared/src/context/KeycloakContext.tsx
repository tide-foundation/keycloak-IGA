/** TIDECLOAK IMPLEMENTATION */
import { Spinner } from "@patternfly/react-core";
import { TideCloak } from "@tidecloak/js";
import {
  PropsWithChildren,
  createContext,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertProvider } from "../alerts/Alerts";
import { ErrorPage } from "./ErrorPage";
import { Help } from "./HelpContext";
import { BaseEnvironment } from "./environment";

export type KeycloakContext<T extends BaseEnvironment = BaseEnvironment> =
  KeycloakContextProps<T> & {
    keycloak: TideCloak;
    approveTideRequests: (requests: { id: string, request: Uint8Array }[]) => Promise<{
      id: string;
      approved?: {
        request: Uint8Array
      },
      denied?: boolean,
      pending?: boolean
    }[]>;
  };

const createKeycloakEnvContext = <T extends BaseEnvironment>() =>
  createContext<KeycloakContext<T> | undefined>(undefined);

let KeycloakEnvContext: any;

export const useEnvironment = <
  T extends BaseEnvironment = BaseEnvironment,
>() => {
  const context = useContext<KeycloakContext<T> | undefined>(
    KeycloakEnvContext,
  );
  if (!context)
    throw Error(
      "no environment provider in the hierarchy make sure to add the provider",
    );
  return context;
};

interface KeycloakContextProps<T extends BaseEnvironment> {
  environment: T;
  // TIDECLOAK IMPLEMENTATION: 26.7.0 added this external-injection escape hatch.
  // It is typed as TideCloak (not Keycloak) because the context contract exposes
  // approveTideRequests, which a plain keycloak-js instance cannot satisfy.
  keycloak?: TideCloak;
}

// Shape of the adapter JSON you're fetching for security-admin-console
type TideKeycloakConfig = {
  realm: string;
  "auth-server-url": string;
  resource: string; // clientId
  vendorId?: string;
  homeOrkUrl?: string;
  [key: string]: any; // for client-origin-auth-<origin> etc.
};

export const KeycloakProvider = <T extends BaseEnvironment>({
  environment,
  keycloak: externalKeycloak,
  children,
}: PropsWithChildren<KeycloakContextProps<T>>) => {
  KeycloakEnvContext = createKeycloakEnvContext<T>();

  const calledOnce = useRef(false);
  const [init, setInit] = useState(!!externalKeycloak);
  const [error, setError] = useState<unknown>();

  const [config, setConfig] = useState<TideKeycloakConfig | null>(null);
  const [loadingConfig, setLoadingConfig] = useState(true);

  // -------------------------------
  // 1. Fetch the TideCloak config from public endpoint
  // -------------------------------
  useEffect(() => {
    let cancelled = false;

    // TIDECLOAK IMPLEMENTATION: an externally-injected client is already
    // configured and initialised — don't fetch (or require) the Tide config.
    if (externalKeycloak) {
      setLoadingConfig(false);
      return;
    }

    const loadConfig = async () => {
      try {
        setLoadingConfig(true);

        const res = await fetch(
          `${environment.serverBaseUrl}/realms/${environment.realm}/public/get-tide-config?clientId=${encodeURIComponent(environment.clientId)}`,
        );
        if (!res.ok) {
          throw new Error(
            `Failed to load TideCloak config: ${res.statusText}`,
          );
        }

        const json = (await res.json()) as TideKeycloakConfig;
        if (!cancelled) {
          setConfig(json);
        }
      } catch (e) {
        if (!cancelled) setError(e);
      } finally {
        if (!cancelled) setLoadingConfig(false);
      }
    };

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, [environment, externalKeycloak]);

  // -------------------------------
  // 2. Create TideCloak using JSON
  // -------------------------------
  const keycloak = useMemo(() => {
    // TIDECLOAK IMPLEMENTATION: honour 26.7.0's external-injection escape hatch
    // first; otherwise build a TideCloak from the runtime-fetched Tide config.
    if (externalKeycloak) {
      return externalKeycloak;
    }
    if (!config) return null;

    const originKey = `client-origin-auth-${window.location.origin}`;
    const clientOriginAuth = config[originKey];

    const kc = new TideCloak({
      // prefer JSON values, fall back to environment just in case
      url: environment.serverBaseUrl,
      realm: environment.realm,
      clientId: environment.clientId,
      vendorId: config.vendorId,
      homeOrkUrl: config.homeOrkUrl,
      clientOriginAuth,
    });

    kc.onAuthLogout = () => kc.login();
    return kc;
  }, [config, environment, externalKeycloak]);

  // -------------------------------
  // 3. Initialise TideCloak
  // -------------------------------
  useEffect(() => {
    // Skip initialization if using external keycloak (already initialized)
    if (externalKeycloak) {
      return;
    }

    // null until the Tide config resolves and the TideCloak is constructed
    if (!keycloak) return;

    // only needed in dev mode
    if (calledOnce.current) {
      return;
    }

    const init = () =>
      keycloak.init({
        onLoad: "login-required",
        pkceMethod: "S256",
        responseMode: "query",
        scope: environment.scope,
        setupRequestEnclave: false,
      });

    init()
      .then(() => setInit(true))
      .catch((err: any) => setError(err));

    calledOnce.current = true;
  }, [keycloak, environment, externalKeycloak]);

  // -------------------------------
  // Tide Methods
  // -------------------------------
  const getTideClient = () => {
    const tc = keycloak as any;
    if (!tc) {
      throw new Error("TideCloak does not have a Tide client initialized.");
    }
    return tc;
  };

  const approveTideRequests = async (requests: { id: string, request: Uint8Array }[]): Promise<
    {
      id: string;
      approved?: {
        request: Uint8Array
      },
      denied?: boolean,
      pending?: boolean
    }[]> => {
    const tc = getTideClient();
    const results = await tc.requestTideOperatorApproval(requests);

    return results.map((res: any) => {
      if (res.status === "approved") {
        return {
          id: res.id,
          approved: {
            request: res.request,
          },
        };
      }
      if (res.status === "denied") return { id: res.id, denied: true };
      if (res.status === "pending") return { id: res.id, pending: true };
      throw new Error("Unknown approval status: " + res.status);
    });
  };

  const searchParams = new URLSearchParams(window.location.search);

  // -------------------------------
  // Render states
  // -------------------------------
  if (error || searchParams.get("error_description")) {
    return (
      <ErrorPage
        error={error ? error : searchParams.get("error_description")}
      />
    );
  }

  // TIDECLOAK IMPLEMENTATION: `keycloak` stays null until the Tide config
  // resolves, so !keycloak already covers the config-pending case. Gating on
  // `config` directly would deadlock the externally-injected path, which
  // never fetches one.
  if (loadingConfig || !keycloak || !init) {
    return <Spinner />;
  }

  return (
    <KeycloakEnvContext.Provider
      value={{
        environment,
        keycloak,
        approveTideRequests,
      }}
    >
      <AlertProvider>
        <Help>{children}</Help>
      </AlertProvider>
    </KeycloakEnvContext.Provider>
  );
};
