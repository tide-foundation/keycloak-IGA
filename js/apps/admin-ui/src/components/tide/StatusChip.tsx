import { Label } from "@patternfly/react-core";

const statusToLabel = {
  DRAFT:    { color: "gold"   as const, text: "Draft" },
  PENDING:  { color: "orange" as const, text: "Pending" },
  APPROVED: { color: "blue"   as const, text: "Approved" },
  ACTIVE:   { color: "green"  as const, text: "Active" },
  DENIED:   { color: "red"    as const, text: "Denied" },
};

export function StatusChip({ status }: { status?: string }) {
  const s = (status ?? "ACTIVE").toUpperCase();
  const meta = (statusToLabel as any)[s] ?? statusToLabel.ACTIVE;
  return <Label color={meta.color}>{meta.text}</Label>;
}
