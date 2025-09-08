import { lazy } from "react";
import type { AppRouteObject } from "../../routes";

const PolicyBuilderPage = lazy(
  () => import("../pages/policy-builder/PolicyBuilderPage")
);

export const PolicyBuilderRoute: AppRouteObject = {
  path: "/:realm/forseti/policy-builder",
  element: <PolicyBuilderPage />,
  breadcrumb: (t) => t("forseti.policyBuilder.title"),
  handle: {
    access: "view-realm",
  },
};