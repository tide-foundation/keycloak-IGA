/** TIDECLOAK IMPLEMENTATION */

import { Alert } from "@patternfly/react-core";

import { useIsIgaEnabled } from "../../utils/useIsIgaEnabled";

type IgaPageBannerProps = {
  /**
   * Optional specialization: "user", "role", "group", "client", etc.
   * When provided, the message reads
   * "Saving will create a Change Request for approval on this <entityType>."
   */
  entityType?: string;
};

/**
 * Reinforcement banner shown on intercepted screens (Realm Settings, Users,
 * Roles, Groups, Clients, Client Scopes) when IGA is active. Renders nothing
 * outside of IGA-enabled realms.
 */
export const IgaPageBanner = ({ entityType }: IgaPageBannerProps) => {
  const igaEnabled = useIsIgaEnabled();
  if (!igaEnabled) return null;

  const body = entityType
    ? `Saving changes will create a Change Request for approval on this ${entityType}.`
    : "Saving changes on this page will create a Change Request for approval.";

  return (
    <Alert
      variant="warning"
      isInline
      title="IGA active"
      component="p"
      className="pf-v5-u-mx-md pf-v5-u-mt-md"
    >
      {body}
    </Alert>
  );
};

export default IgaPageBanner;
