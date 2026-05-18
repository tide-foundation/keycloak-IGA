/** TIDECLOAK IMPLEMENTATION */

import { useEffect, useState } from "react";
import {
  Alert,
  AlertActionCloseButton,
  AlertActionLink,
} from "@patternfly/react-core";
import { useNavigate } from "react-router-dom";

import { useRealm } from "../../context/realm-context/RealmContext";
import { useIsIgaEnabled } from "../../utils/useIsIgaEnabled";
import { toChangeRequests } from "../../change-requests/routes/ChangeRequests";

const DISMISS_KEY_PREFIX = "tidecloak.igaBanner.dismissed.";

/**
 * Top-of-page banner that appears on every admin page when the current
 * realm has IGA enabled. Session-dismissible per realm via sessionStorage.
 */
export const IgaBanner = () => {
  const igaEnabled = useIsIgaEnabled();
  const { realm } = useRealm();
  const navigate = useNavigate();
  const storageKey = `${DISMISS_KEY_PREFIX}${realm}`;
  const [dismissed, setDismissed] = useState<boolean>(false);

  // Reset dismissed state when the active realm changes, then read its flag.
  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(storageKey) === "true");
    } catch {
      setDismissed(false);
    }
  }, [storageKey]);

  if (!igaEnabled || dismissed) return null;

  const onDismiss = () => {
    try {
      sessionStorage.setItem(storageKey, "true");
    } catch {
      /* ignore quota / private mode errors */
    }
    setDismissed(true);
  };

  return (
    <Alert
      variant="info"
      isInline
      title="IGA is enabled for this realm"
      component="p"
      actionClose={<AlertActionCloseButton onClose={onDismiss} />}
      actionLinks={
        <AlertActionLink
          onClick={() => navigate(toChangeRequests({ realm }).pathname!)}
        >
          View Change Requests
        </AlertActionLink>
      }
    >
      Most administrative actions create Change Requests that require approval
      before applying.
    </Alert>
  );
};

export default IgaBanner;
