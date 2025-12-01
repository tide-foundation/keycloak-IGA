import { useEffect, useState } from "react";
import { useAdminClient } from "../../admin-client";

interface RequesterInfo {
  displayName: string;
  userId: string;
}

const userCache = new Map<string, RequesterInfo>();

export function useRequesterInfo(requesterUserId: string | undefined): RequesterInfo {
  const { adminClient } = useAdminClient();
  const [requesterInfo, setRequesterInfo] = useState<RequesterInfo>({
    displayName: requesterUserId || 'Unknown',
    userId: requesterUserId || 'Unknown'
  });

  useEffect(() => {
    if (!requesterUserId || requesterUserId === 'Unknown') {
      setRequesterInfo({ displayName: 'Unknown', userId: 'Unknown' });
      return;
    }

    // Check cache first
    if (userCache.has(requesterUserId)) {
      setRequesterInfo(userCache.get(requesterUserId)!);
      return;
    }

    // Fetch user data
    const fetchUser = async () => {
      try {
        const user = await adminClient.users.findOne({ id: requesterUserId });
        const firstName = user?.firstName || '';
        const lastName = user?.lastName || '';
        const displayName = `${firstName} ${lastName}`.trim() || requesterUserId;

        const info: RequesterInfo = {
          displayName,
          userId: requesterUserId
        };

        userCache.set(requesterUserId, info);
        setRequesterInfo(info);
      } catch (error) {
        // Fallback to ID if user not found
        const info: RequesterInfo = {
          displayName: requesterUserId,
          userId: requesterUserId
        };
        userCache.set(requesterUserId, info);
        setRequesterInfo(info);
      }
    };

    fetchUser();
  }, [requesterUserId, adminClient]);

  return requesterInfo;
}
