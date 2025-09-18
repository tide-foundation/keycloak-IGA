import { useEffect, useState } from "react";
import {
  Drawer,
  DrawerContent,
  DrawerContentBody,
  Alert,
  Button,
  Bullseye,
  Spinner,
  Title,
} from "@patternfly/react-core";
import { useParams } from "react-router-dom";
import type { Replay } from "./types";
import { useReplayService } from "./service";

type Props = {
  id?: string | null;
  isOpen: boolean;
  onClose: () => void;
  onChanged?: () => void;
};

export default function ChangeRequestDetailsDrawer({ id, isOpen, onClose, onChanged }: Props) {
  const { realm } = useParams<{ realm: string }>();
  const svc = useReplayService();
  const [data, setData] = useState<Replay | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      if (!isOpen || !id) return;
      setLoading(true);
      setErr(null);
      try {
        const r = await svc.getReplay(realm!, id);
        if (mounted) setData(r);
      } catch (e: any) {
        if (mounted) setErr(e?.message ?? "Failed to load replay");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [isOpen, id, realm, svc]);

  const doAction = async (action: "approve" | "deny" | "cancel" | "apply") => {
    if (!id) return;
    setLoading(true);
    setErr(null);
    try {
      await svc.actOnReplay(realm!, id, action);
      onChanged?.();
      onClose();
    } catch (e: any) {
      setErr(e?.message ?? "Action failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Drawer isExpanded={isOpen} onExpand={onClose}>
      <DrawerContent
        panelContent={
          <DrawerContentBody style={{ minWidth: 420 }}>
            {loading && (
              <Bullseye>
                <Spinner />
              </Bullseye>
            )}
            {err && <Alert isInline variant="danger" title={err} />}
            {data && (
              <>
                <Title headingLevel="h2" style={{ marginBottom: 12 }}>
                  {data.summary || data.kind} — {data.status}
                </Title>
                {data.message && (
                  <Alert isInline variant="info" title={data.message} style={{ marginBottom: 12 }} />
                )}
                <pre
                  style={{
                    maxHeight: 320,
                    overflow: "auto",
                    background: "var(--pf-v5-global--palette--black-100)",
                    padding: 12,
                  }}
                >
                  {JSON.stringify(data.payload ?? {}, null, 2)}
                </pre>

                <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                  <Button variant="primary" onClick={() => doAction("approve")} isDisabled={loading}>
                    Approve
                  </Button>
                  <Button variant="danger" onClick={() => doAction("deny")} isDisabled={loading}>
                    Deny
                  </Button>
                  <Button variant="secondary" onClick={() => doAction("cancel")} isDisabled={loading}>
                    Cancel
                  </Button>
                  <Button variant="tertiary" onClick={() => doAction("apply")} isDisabled={loading}>
                    Apply
                  </Button>
                </div>
              </>
            )}
          </DrawerContentBody>
        }
      >
        <DrawerContentBody />
      </DrawerContent>
    </Drawer>
  );
}
