/** TIDECLOAK IMPLEMENTATION */

import { lazy } from "react";
import type { Path } from "react-router-dom";
import type { AppRouteObject } from "../../routes";
import { generateEncodedPath } from "../../utils/generateEncodedPath";

export type ChangeRequestsParams = { realm: string };

const ChangeRequestsSection = lazy(() => import("../ChangeRequestsSection"));

export const changeRequestsRoute: AppRouteObject = {
  path: "/:realm/change-requests",
  element: <ChangeRequestsSection />,
  breadcrumb: (t) => t("Change Requests"),
  handle: {
    access: "query-users",
  },
};

export const toChangeRequests = (
  params: ChangeRequestsParams,
): Partial<Path> => ({
  pathname: generateEncodedPath(changeRequestsRoute.path, params),
});
