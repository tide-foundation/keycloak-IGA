import { Button, Pagination, Toolbar, ToolbarContent, ToolbarItem } from "@patternfly/react-core";
import { useEffect, useState } from "react";
import type { ListParams, Replay } from "./types";
import { useParams } from "react-router-dom";
import { useReplayService } from "./service";

type Props = {
  onOpenDetails: (id: string) => void;
};

export default function ChangeRequestTable({ onOpenDetails }: Props) {
  const { realm } = useParams<{ realm: string }>();
  const svc = useReplayService();

  const [rows, setRows] = useState<Replay[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [params, setParams] = useState<ListParams>({ first: 0, max: 10, order: "desc" });

  const refresh = async () => {
    setLoading(true);
    try {
      const r = await svc.listReplays(realm!, params);
      setRows(r.items);
      setTotal(r.total);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // stringifying params is adequate here because we're using plain values
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(params)]);

  return (
    <>
      <Toolbar>
        <ToolbarContent>
          <ToolbarItem>
            <Button variant="primary" onClick={refresh} isDisabled={loading}>
              Refresh
            </Button>
          </ToolbarItem>
          {/* PF v5 prop is 'align', NOT 'alignment' */}
          <ToolbarItem align={{ default: "alignRight" }}>
            <Pagination
              itemCount={total}
              perPage={params.max ?? 10}
              page={(params.first ?? 0) / (params.max ?? 10) + 1}
              onPerPageSelect={(_, perPage) =>
                setParams((p) => ({ ...p, max: perPage, first: 0 }))
              }
              onSetPage={(_, page) =>
                setParams((p) => ({ ...p, first: ((p.max ?? 10) * (page - 1)) }))
              }
            />
          </ToolbarItem>
        </ToolbarContent>
      </Toolbar>

      <div className="pf-v5-c-card">
        <div className="pf-v5-c-card__body" style={{ padding: 0 }}>
          <table
            className="pf-v5-c-table pf-m-grid-md"
            role="grid"
            aria-label="Change requests"
            style={{ width: "100%" }}
          >
            <thead>
              <tr role="row">
                <th role="columnheader">When</th>
                <th role="columnheader">Kind</th>
                <th role="columnheader">Status</th>
                <th role="columnheader">Actor</th>
                <th role="columnheader">Summary</th>
                <th role="columnheader"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} role="row">
                  <td>{new Date(r.createdAt).toLocaleString()}</td>
                  <td>{r.kind}</td>
                  <td>{r.status}</td>
                  <td>{r.actor ?? "-"}</td>
                  <td>{r.summary ?? r.message ?? "-"}</td>
                  <td style={{ textAlign: "right" }}>
                    <Button variant="link" onClick={() => onOpenDetails(r.id)}>
                      Details
                    </Button>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={6} style={{ padding: 16 }}>
                    No change requests.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
