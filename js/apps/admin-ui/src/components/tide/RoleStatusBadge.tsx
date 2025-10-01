import { useEffect, useState } from "react";
import { StatusChip } from "./StatusChip";
import { useAdminClient } from "../../admin-client";
import { fetchChangeRequests, matchUserRoleRequest } from "../../tide-change-requests/api";

export function RoleStatusBadge({
  userId,
  roleId,
}: {
  userId: string;
  roleId: string;
}) {
  const { adminClient } = useAdminClient();
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // @ts-ignore tideAdmin is attached at runtime
        const res = await adminClient.tideAdmin.getUserRoleDraftStatus(
          userId,
          roleId
        );
        if (!cancelled) setStatus(res?.status ?? "ACTIVE");
      } catch {
        if (!cancelled) setStatus("ACTIVE");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [adminClient, userId, roleId]);

  return <StatusChip status={status} />;
}
