// TIDECLOAK IMPLEMENTATION
// When the IGA backend intercepts an entity-create call for approval, the
// admin-client SDK returns a `PendingChangeRequest` JSON body in place of the
// normal `{ id }`-style response. Use this helper at create call sites to
// surface a friendly toast and skip post-create navigation.

import { AlertVariant } from "@patternfly/react-core";
import {
  isPendingChangeRequest,
  type PendingChangeRequest,
} from "@keycloak/keycloak-admin-client/lib/utils/pendingChangeRequest";
import type { TFunction } from "i18next";

type AddAlert = (
  message: string,
  variant?: AlertVariant,
  description?: string,
) => void;

/**
 * If `result` is a pending change-request envelope, show the standard toast
 * and return the parsed envelope. Otherwise return `undefined` so the caller
 * proceeds with its normal success path.
 */
export function notifyIfPendingChangeRequest(
  result: unknown,
  t: TFunction,
  addAlert: AddAlert,
): PendingChangeRequest | undefined {
  if (!isPendingChangeRequest(result)) {
    return undefined;
  }
  addAlert(
    t("pendingChangeRequestCreated", { id: result.changeRequestId }),
    AlertVariant.info,
  );
  return result;
}
