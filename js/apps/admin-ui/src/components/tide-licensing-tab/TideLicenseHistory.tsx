import React, { useMemo } from "react";
import {
  Table,
  Thead,
  Tbody,
  Tr,
  Th,
  Td,
  TableText
} from "@patternfly/react-table";
import {
  ClipboardCopy,
  ClipboardCopyVariant,
  Tooltip,
  Label,
  Bullseye,
  EmptyState,
  EmptyStateHeader,
  EmptyStateIcon,
  EmptyStateBody,
  Button
} from "@patternfly/react-core";
import { InfoCircleIcon } from "@patternfly/react-icons";

// TIDECLOAK IMPLEMENTATION
export interface License {
  licenseData: string; // full JSON string or compact string
  status: string;
  date: string;        // epoch seconds string (e.g., "1726728319")
}

type TideLicenseHistoryProps = {
  licenseList: License[];
};

// --- helpers (browser-time only) ---
const tz = Intl.DateTimeFormat().resolvedOptions().timeZone ?? "Local";

function formatLocal(epochSeconds: number) {
  const d = new Date(epochSeconds * 1000);
  const local = d.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  });
  const iso = d.toISOString(); // UTC representation
  const ms = Date.now() - d.getTime();
  const abs = Math.abs(ms);
  const mins = Math.round(abs / 60000);
  const hrs = Math.round(abs / 3600000);
  const days = Math.round(abs / 86400000);
  const ago =
    abs < 60000
      ? "just now"
      : abs < 3600000
      ? `${mins}m ${ms < 0 ? "from now" : "ago"}`
      : abs < 86400000
      ? `${hrs}h ${ms < 0 ? "from now" : "ago"}`
      : `${days}d ${ms < 0 ? "from now" : "ago"}`;

  return { local, iso, ago, dateObj: d };
}

function truncateMiddle(s: string, max = 120) {
  if (s.length <= max) return s;
  const head = Math.floor(max / 2) - 3;
  const tail = max - head - 3;
  return `${s.slice(0, head)}...${s.slice(-tail)}`;
}

const isActionableStatus = (status: string) =>
  /^(upcoming\s*renewal|active)$/i.test((status || "").trim());

export const TideLicenseHistory: React.FC<TideLicenseHistoryProps> = ({
  licenseList
}) => {
  const rows = useMemo(() => {
    return (licenseList ?? []).map((lic) => {
      const epoch =
        typeof lic.date === "string" ? parseInt(lic.date, 10) : ((lic as any).date as number);
      const { local, iso, ago } = formatLocal(epoch || 0);

      const copyPayload = (() => {
        try {
          const parsed = JSON.parse(lic.licenseData);
          return JSON.stringify(parsed, null, 2);
        } catch {
          return lic.licenseData;
        }
      })();

      const displaySnippet = truncateMiddle(copyPayload, 160);

      return {
        key: `${lic.status}-${epoch}-${displaySnippet.length}`,
        original: lic,
        status: lic.status,
        local,
        iso,
        ago,
        copyPayload,
        displaySnippet,
        epoch
      };
    });
  }, [licenseList]);

  const handleSign = (row: (typeof rows)[number]) => {
    // TODO hook endpoint later
    // Include helpful context in the log so you can see which item was clicked
    // without digging through state.
    // eslint-disable-next-line no-console
    console.log("Sign clicked", {
      status: row.status,
      epoch: row.epoch,
      local: row.local,
      licenseData: row.original.licenseData
    });
  };

  const handleSwitch = (row: (typeof rows)[number]) => {
    // TODO hook endpoint later
    // eslint-disable-next-line no-console
    console.log("Switch clicked", {
      status: row.status,
      epoch: row.epoch,
      local: row.local,
      licenseData: row.original.licenseData
    });
  };

  if (!licenseList || licenseList.length === 0) {
    return (
      <div
        style={{
          border: "1px solid var(--pf-v5-global--BorderColor--100)",
          borderRadius: 6,
          padding: 8
        }}
      >
        <Bullseye>
          <EmptyState>
            <EmptyStateHeader
              titleText="No license history"
              icon={<EmptyStateIcon icon={InfoCircleIcon} />}
              headingLevel="h4"
            />
            <EmptyStateBody>
              When licenses are generated, they'll appear here.
            </EmptyStateBody>
          </EmptyState>
        </Bullseye>
      </div>
    );
  }

  return (
    <div
      style={{
        maxHeight: 420,
        overflow: "auto",
        border: "1px solid var(--pf-v5-global--BorderColor--100)",
        borderRadius: 6
      }}
      aria-label="License history table"
    >
      <Table
        variant="compact"
        borders
        aria-label="Tidecloak license history"
        isStriped
        isStickyHeader
      >
        <Thead>
          <Tr>
            <Th width={40}>License</Th>
            <Th>Status</Th>
            <Th>Date{" "}
              <Tooltip
                content={
                  <>
                    Displayed in your browser's timezone: <strong>{tz}</strong>
                  </>
                }
              >
                <InfoCircleIcon
                  style={{ marginLeft: 6, verticalAlign: "text-bottom" }}
                />
              </Tooltip>
            </Th>
            <Th width={20}>Actions</Th>
          </Tr>
        </Thead>
        <Tbody>
          {rows.map((r) => {
            const actionable = isActionableStatus(r.status);
            return (
              <Tr key={r.key}>
                <Td dataLabel="License">
                  <TableText wrapModifier="truncate">
                    <ClipboardCopy
                      isCode
                      isReadOnly
                      hoverTip="Copy full JSON"
                      clickTip="Copied!"
                      variant={ClipboardCopyVariant.inline}
                      onCopy={(e) => {
                        if (navigator?.clipboard?.writeText) {
                          e?.preventDefault?.();
                          navigator.clipboard
                            .writeText(r.copyPayload)
                            .catch(() => {});
                        }
                      }}
                    >
                      {r.displaySnippet}
                    </ClipboardCopy>
                  </TableText>
                </Td>

                <Td dataLabel="Status">
                  <Label
                    color={
                      /active|paid|ok|success/i.test(r.status)
                        ? "green"
                        : /pending|processing|upcoming/i.test(r.status)
                        ? "gold"
                        : /expired|failed|unpaid|cancel/i.test(r.status)
                        ? "red"
                        : "grey"
                    }
                    isCompact
                  >
                    {r.status}
                  </Label>
                </Td>

                <Td dataLabel="Date">
                  <Tooltip
                    content={
                      <>
                        <div><strong>Local:</strong> {r.local}</div>
                        <div><strong>ISO (UTC representation):</strong> {r.iso}</div>
                        <div><strong>Time zone:</strong> {tz}</div>
                      </>
                    }
                  >
                    <span aria-label={`Local date ${r.local}`}>
                      {r.local}{" "}
                      <span
                        style={{ opacity: 0.75, fontSize: "0.85em", marginLeft: 6 }}
                        aria-label={`Occurred ${r.ago}`}
                      >
                        · {r.ago}
                      </span>
                    </span>
                  </Tooltip>
                </Td>

                <Td dataLabel="Actions">
                  {actionable ? (
                    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                      <Button
                        variant="primary"
                        onClick={() => handleSign(r)}
                        aria-label="Sign license"
                      >
                        Sign
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => handleSwitch(r)}
                        aria-label="Switch license"
                      >
                        Switch
                      </Button>
                    </div>
                  ) : (
                    <span style={{ opacity: 0.65 }}>—</span>
                  )}
                </Td>
              </Tr>
            );
          })}
        </Tbody>
      </Table>
    </div>
  );
};
