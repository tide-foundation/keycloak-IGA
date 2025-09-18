import { lazy } from "react";
import type { TFunction } from "i18next";
import type { AppRouteObject } from "../routes";

const ChangeRequestPage = lazy(() => import("./page-wrapper"));

const routes: AppRouteObject[] = [
  {
    path: "/:realm/change-requests",
    element: <ChangeRequestPage />,
    breadcrumb: (t: TFunction) => t?.("tideChangeRequests") ?? "Change requests",
    handle: {
      access: "view-realm",
    },
  },
];

export default routes;
