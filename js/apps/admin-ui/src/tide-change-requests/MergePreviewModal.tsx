import {
  Modal,
  ModalVariant,
  Button,
  Badge,
} from "@patternfly/react-core";
import { MergedContext } from "./types";
import { StatusChip } from "../components/tide/StatusChip";

export function MergePreviewModal({
  isOpen,
  onClose,
  onConfirm,
  merged,
}: {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  merged: MergedContext[];
}) {
  return (
    <Modal
      variant={ModalVariant.medium}
      title="Bulk approval preview"
      isOpen={isOpen}
      onClose={onClose}
      showClose
      actions={[
        <Button key="confirm" variant="primary" onClick={onConfirm}>
          Approve &amp; Continue
        </Button>,
        <Button key="cancel" variant="link" onClick={onClose}>
          Cancel
        </Button>,
      ]}
    >
      {merged.length === 0 ? (
        <p>
          No effective changes after merge (all canceled out by opposing
          actions).
        </p>
      ) : (
        <div className="space-y-4">
          {merged.map((m) => (
            <div key={m.key} className="border rounded p-3">
              <div className="pf-v5-u-display-flex pf-v5-u-align-items-center pf-v5-u-gap-md">
                <Badge isRead>User</Badge>
                <span>{m.userId ?? "-"}</span>
                <Badge isRead>Client</Badge>
                <span>{m.clientId ?? "-"}</span>
                <span className="pf-v5-u-ml-auto">
                  {m.actions.length} action(s)
                </span>
              </div>
              <ul className="pf-v5-u-mt-sm">
                {m.actions.map((a) => (
                  <li key={a.draftRecordId}>
                    <StatusChip status={a.status} /> {a.actionType}{" "}
                    {a.roleId ?? a.permissionId ?? a.changeSetType}
                  </li>
                ))}
              </ul>
              <div className="pf-v5-u-color-200 pf-v5-u-font-size-sm pf-v5-u-mt-sm">
                Collapsed from {m.sourceRows.length} request(s).
              </div>
            </div>
          ))}
        </div>
      )}
    </Modal>
  );
}
