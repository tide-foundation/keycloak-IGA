import { lazy } from "react";
import type { AppRouteObject } from "../../routes";
import type { Path } from "react-router-dom";
import { generatePath } from "react-router-dom";

export type CatalogParams = {
  realm: string;
};

const CatalogSection = lazy(() => import("../pages/catalog/CatalogSection"));

export const CatalogRoute: AppRouteObject = {
  path: "/:realm/forseti/catalog",
  element: <CatalogSection />,
  breadcrumb: (t) => t("forseti.catalog"),
  handle: {
    access: "view-realm",
  },
};

export const toCatalog = (params: Pick<CatalogParams, "realm">): Partial<Path> => ({
  pathname: generatePath(CatalogRoute.path, params),
});