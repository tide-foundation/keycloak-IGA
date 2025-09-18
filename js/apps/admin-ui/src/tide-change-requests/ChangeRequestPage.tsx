import { useState } from "react";
import { PageSection, Title } from "@patternfly/react-core";
import ChangeRequestTable from "./ChangeRequestTable";
import ChangeRequestDetailsDrawer from "./ChangeRequestDetailsDrawer";

export default function ChangeRequestPage() {
  const [openId, setOpenId] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  return (
    <>
      <PageSection variant="light">
        <Title headingLevel="h1">Change requests</Title>
      </PageSection>
      <PageSection>
        <ChangeRequestTable key={refreshKey} onOpenDetails={setOpenId} />
      </PageSection>

      <ChangeRequestDetailsDrawer
        id={openId}
        isOpen={!!openId}
        onClose={() => setOpenId(null)}
        onChanged={() => setRefreshKey((k) => k + 1)}
      />
    </>
  );
}
