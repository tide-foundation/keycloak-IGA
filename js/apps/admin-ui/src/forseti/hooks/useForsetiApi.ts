import { useMemo } from "react";
import { useAdminClient } from "../../admin-client";
import { ForsetiAdminClient } from "../api/forseti";

export const useForsetiApi = () => {
  const { adminClient } = useAdminClient();
  
  return useMemo(() => new ForsetiAdminClient(adminClient), [adminClient]);
};