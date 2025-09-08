import { lazy } from "react";
import type { AppRouteObject } from "../../routes";
import type { Path } from "react-router-dom";
import { generatePath } from "react-router-dom";

export type ManifestParams = {
  realm: string;
  id?: string;
};

const ManifestsSection = lazy(() => import("../pages/manifests/ManifestsSection"));
const ManifestDetails = lazy(() => import("../pages/manifests/ManifestDetails"));

export const ManifestsRoute: AppRouteObject = {
  path: "/:realm/forseti/manifests",
  element: <ManifestsSection />,
  breadcrumb: (t) => t("forseti.manifests"),
  handle: {
    access: "view-realm",
  },
};

export const ManifestDetailRoute: AppRouteObject = {
  path: "/:realm/forseti/manifests/:id",
  element: <ManifestDetails />,
  breadcrumb: (t) => t("forseti.manifestDetails"),
  handle: {
    access: "view-realm",
  },
};

export const toManifests = (params: Pick<ManifestParams, "realm">): Partial<Path> => ({
  pathname: generatePath(ManifestsRoute.path, params),
});

export const toManifestDetail = (
  params: ManifestParams
): Partial<Path> => ({
  pathname: generatePath(ManifestDetailRoute.path, params),
});