// TIDECLOAK IMPLEMENTATION START
import { useState, useCallback } from "react";
import { useFetch } from "@keycloak/keycloak-ui-shared";
import { useForsetiApi } from "./useForsetiApi";
import type {
  ForsetiPolicyRoute,
  ForsetiPolicyManifest,
  CatalogItem,
} from "../types";

export const useForsetiRoutes = () => {
  const api = useForsetiApi();
  const [routes, setRoutes] = useState<ForsetiPolicyRoute[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  useFetch(
    () => api.listRoutes(),
    (data: ForsetiPolicyRoute[]) => {
      setRoutes(data);
      setLoading(false);
    },
    []
  );

  return { data: routes, isLoading: loading, error, refresh };
};

export const useForsetiRoute = (id: number | undefined) => {
  const api = useForsetiApi();
  const [route, setRoute] = useState<ForsetiPolicyRoute | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  useFetch(
    () => (id ? api.getRoute(id) : Promise.reject(new Error("No ID"))),
    (data: ForsetiPolicyRoute) => {
      setRoute(data);
      setLoading(false);
    },
    [id]
  );

  return { data: route, isLoading: loading, error, refresh };
};

export const useForsetiManifests = () => {
  const api = useForsetiApi();
  const [manifests, setManifests] = useState<ForsetiPolicyManifest[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  useFetch(
    () => api.listManifests(),
    (data: ForsetiPolicyManifest[]) => {
      setManifests(data);
      setLoading(false);
    },
    []
  );

  return { data: manifests, isLoading: loading, error, refresh };
};

export const useForsetiManifest = (id: number | undefined) => {
  const api = useForsetiApi();
  const [manifest, setManifest] = useState<ForsetiPolicyManifest | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  useFetch(
    () => (id ? api.getManifest(id) : Promise.reject(new Error("No ID"))),
    (data: ForsetiPolicyManifest) => {
      setManifest(data);
      setLoading(false);
    },
    [id]
  );

  return { data: manifest, isLoading: loading, error, refresh };
};

export const usePolicyCatalog = () => {
  const api = useForsetiApi();
  const [policies, setPolicies] = useState<CatalogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
  }, []);

  useFetch(
    () => api.listPolicies(),
    (data: CatalogItem[]) => {
      setPolicies(data);
      setLoading(false);
    },
    []
  );

  return { data: policies, isLoading: loading, error, refresh };
};
// TIDECLOAK IMPLEMENTATION END