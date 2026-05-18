// TIDECLOAK IMPLEMENTATION
// When the IGA backend intercepts an entity-create call for approval, the
// admin-client SDK returns a `PendingChangeRequest` JSON body in place of the
// normal `{ id }`-style response. Use this helper at create call sites to
// surface a friendly toast and skip post-create navigation.

import { AlertActionLink, AlertVariant } from "@patternfly/react-core";
import {
  isPendingChangeRequest,
  type PendingChangeRequest,
} from "@keycloak/keycloak-admin-client/lib/utils/pendingChangeRequest";
import type { TFunction } from "i18next";
import { createElement, type ReactNode } from "react";
import type { NavigateFunction } from "react-router-dom";

import { toChangeRequests } from "../change-requests/routes/ChangeRequests";

type AddAlert = (
  message: string,
  variant?: AlertVariant,
  description?: string,
  actionLinks?: ReactNode,
) => void;

/**
 * Optional in-app navigation context. When supplied, the toast gets a
 * "View change request" action link that navigates within the SPA (via
 * react-router) to the Change Requests screen — no full page reload.
 *
 * The link deep-links to the specific change request: `toChangeRequests`
 * is given the 202 response's `changeRequestId` as `crId`, producing a
 * `?cr=<id>` query that the Change Requests screen reads to open the
 * matching detail modal directly.
 */
type NotifyNav = {
  realm: string;
  navigate: NavigateFunction;
};

/**
 * If `result` is a pending change-request envelope, show the standard toast
 * and return the parsed envelope. Otherwise return `undefined` so the caller
 * proceeds with its normal success path.
 */
export function notifyIfPendingChangeRequest(
  result: unknown,
  t: TFunction,
  addAlert: AddAlert,
  nav?: NotifyNav,
): PendingChangeRequest | undefined {
  if (!isPendingChangeRequest(result)) {
    return undefined;
  }

  let actionLinks: ReactNode | undefined;
  if (nav) {
    const { realm, navigate } = nav;
    const target = toChangeRequests({ realm, crId: result.changeRequestId });
    actionLinks = createElement(
      AlertActionLink,
      {
        onClick: () =>
          navigate({
            pathname: target.pathname!,
            search: target.search ?? "",
          }),
      },
      t("viewChangeRequest"),
    );
  }

  addAlert(
    t("pendingChangeRequestCreated", { id: result.changeRequestId }),
    AlertVariant.info,
    undefined,
    actionLinks,
  );
  return result;
}
