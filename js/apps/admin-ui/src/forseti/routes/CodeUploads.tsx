import { lazy } from "react";
import type { AppRouteObject } from "../../routes";
import type { Path } from "react-router-dom";
import { generatePath } from "react-router-dom";

export type CodeUploadsParams = {
  realm: string;
};

const CodeUploadsSection = lazy(() => import("../pages/code/CodeUploadsSection"));

export const CodeUploadsRoute: AppRouteObject = {
  path: "/:realm/forseti/code",
  element: <CodeUploadsSection />,
  breadcrumb: (t) => t("forseti.code"),
  handle: {
    access: "view-realm",
  },
};

export const toCodeUploads = (params: Pick<CodeUploadsParams, "realm">): Partial<Path> => ({
  pathname: generatePath(CodeUploadsRoute.path, params),
});