import { lazy } from "react";
import type { AppRouteObject } from "../../routes";
import type { Path } from "react-router-dom";
import { generatePath } from "react-router-dom";

export type RouteParams = {
  realm: string;
  id?: string;
};

const RoutesSection = lazy(() => import("../pages/routes/RoutesSection"));
const RouteDetails = lazy(() => import("../pages/routes/RouteDetails"));

export const RoutesRoute: AppRouteObject = {
  path: "/:realm/forseti/routes",
  element: <RoutesSection />,
  breadcrumb: (t) => t("forseti.routes"),
  handle: {
    access: "view-realm",
  },
};

export const RouteDetailRoute: AppRouteObject = {
  path: "/:realm/forseti/routes/:id",
  element: <RouteDetails />,
  breadcrumb: (t) => t("forseti.routeDetails"),
  handle: {
    access: "view-realm",
  },
};

export const toRoutes = (params: Pick<RouteParams, "realm">): Partial<Path> => ({
  pathname: generatePath(RoutesRoute.path, params),
});

export const toRouteDetail = (
  params: RouteParams
): Partial<Path> => ({
  pathname: generatePath(RouteDetailRoute.path, params),
});