// // TIDECLOAK IMPLEMENTATION
import React from "react";
import { ChangesetAPI, RequestedChanges, ChangeSetType, DraftStatus } from "./api";
import { TokenPreviewPanel } from "../tokenPreview/TokenPreviewPanel";
import { postBundle, postPreview, getActiveRev, postRebase } from "../tokenPreview/api";
import type { TokenPreviewSpec } from "../tokenPreview/types";

function statusBadge(s: DraftStatus){
  const color =
    s === "ACTIVE" ? "#0a0" :
    s === "APPROVED" ? "#06c" :
    s === "PENDING" ? "#c60" :
    s === "DRAFT" ? "#666" :
    "#999";
  return <span style={{background: color, color: "white", padding: "2px 8px", borderRadius: 8, fontSize: 12}}>{s}</span>;
}

function useLoadChangesets(realm: string){
  const [rows, setRows] = React.useState<RequestedChanges[]>([]);
  const [loading, setLoading] = React.useState(false);
  const reload = React.useCallback(async () => {
    setLoading(true);
    try {
      const [u, r, c] = await Promise.all([
        ChangesetAPI.users(realm),
        ChangesetAPI.roles(realm),
        ChangesetAPI.clients(realm),
      ]);
      setRows([...u, ...r, ...c]);
    } finally {
      setLoading(false);
    }
  }, [realm]);
  React.useEffect(() => { reload(); }, [reload]);
  return { rows, reload, loading };
}

export function ChangeSetTablePage({ realm }: { realm: string }){
  const { rows, reload, loading } = useLoadChangesets(realm);
  const [sel, setSel] = React.useState<Set<string>>(new Set());
  const [activeRev, setActiveRev] = React.useState<number | null>(null);
  const [bundlePreview, setBundlePreview] = React.useState<any | null>(null);

  React.useEffect(() => { getActiveRev(realm).then(d => setActiveRev(d.activeRev)); }, [realm]);

  const toggle = (id: string) => setSel(s => {
    const n = new Set(s);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const selected = rows.filter(r => sel.has(r.changeSetId));

  async function doPreviewSelected(){
    // Build TokenPreviewSpecs by user+client from proof records
    const specs: TokenPreviewSpec[] = [];
    for (const rc of selected){
      for (const pr of rc.userRecord){
        // Minimal preview: for USER_ROLE we can hit default path. If proofDraft exists, show that.
        // Otherwise, build a conservative spec (no deltas here; proofDraft should hold token)
        if (pr.proofDraft) {
          try {
            // Already a preview from server; show as-is
            // Convert single item to preview shape
            specs.push({ userId: undefined, clientId: rc.clientId || pr.clientId }); // just for grouping
          } catch {}
        } else if (rc.requestType === "USER") {
          specs.push({ userId: pr.username, clientId: pr.clientId });
        }
      }
    }
    const payload = selected.flatMap(rc => rc.userRecord.map(pr => ({ rc, pr })));
    if (payload.length === 0) return;
    // Ask server to bundle previews by (userId, clientId). Here we map to basic specs.
    const specs2: TokenPreviewSpec[] = payload.map(({rc, pr}) => ({
      userId: pr.username, // identifier; UI shows name; backend resolves id normally in real flow
      clientId: pr.clientId,
    }));
    const out = await postBundle(realm, specs2, activeRev ?? undefined);
    setBundlePreview(out);
  }

  async function doSignSelected(){
    const items = selected.map(s => {
      const row = rows.find(r => r.changeSetId === s)!;
      return { changeSetId: row.changeSetId, type: row.type };
    });
    await ChangesetAPI.signBatch(realm, items);
    await reload();
  }

  async function doCommitSelected(){
    const items = selected.map(s => {
      const row = rows.find(r => r.changeSetId === s)!;
      return { changeSetId: row.changeSetId, type: row.type };
    });
    await ChangesetAPI.commitBatch(realm, items);
    // Immediately rebase & regenerate drafts
    const res = await postRebase(realm);
    setActiveRev(res.newActiveRev);
    await reload();
  }

  async function doCancelSelected(){
    const items = selected.map(s => {
      const row = rows.find(r => r.changeSetId === s)!;
      return { changeSetId: row.changeSetId, type: row.type };
    });
    await ChangesetAPI.cancelBatch(realm, items);
    await reload();
  }

  return (
    <div style={{padding: 16}}>
      <h2>Change Requests</h2>
      <div style={{display: "flex", gap: 8, alignItems: "center", marginBottom: 8}}>
        <div>Active Context Revision: {activeRev ?? "…"}</div>
        <button onClick={doPreviewSelected} disabled={!selected.length}>Preview (bundle)</button>
        <button onClick={doSignSelected} disabled={!selected.length}>Sign</button>
        <button onClick={doCommitSelected} disabled={!selected.length}>Commit</button>
        <button onClick={doCancelSelected} disabled={!selected.length}>Cancel</button>
        <button onClick={() => setSel(new Set())}>Clear Selection</button>
        <button onClick={() => getActiveRev(realm).then(d => setActiveRev(d.activeRev))}>Refresh Rev</button>
      </div>
      {loading ? <div>Loading…</div> : (
        <table style={{width: "100%", borderCollapse: "collapse"}}>
          <thead>
            <tr>
              <th style={{textAlign:"left"}}>Select</th>
              <th style={{textAlign:"left"}}>Type</th>
              <th style={{textAlign:"left"}}>Action</th>
              <th style={{textAlign:"left"}}>Client</th>
              <th style={{textAlign:"left"}}>Users / Records</th>
              <th style={{textAlign:"left"}}>Draft</th>
              <th style={{textAlign:"left"}}>Delete</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.changeSetId} style={{borderTop: "1px solid #ddd"}}>
                <td><input type="checkbox" checked={sel.has(r.changeSetId)} onChange={() => toggle(r.changeSetId)} /></td>
                <td>{r.type}</td>
                <td>{r.action}</td>
                <td>{r.clientId ?? "—"}</td>
                <td>
                  {r.userRecord?.length ? (
                    <ul style={{margin: 0, paddingLeft: 16}}>
                      {r.userRecord.map(u => (
                        <li key={u.proofId}>
                          <code>{u.username}</code> @{u.clientId}
                          {u.proofDraft ? (
                            <details>
                              <summary>preview</summary>
                              <pre style={{maxHeight: 200, overflow: "auto"}}>{u.proofDraft}</pre>
                            </details>
                          ) : null}
                        </li>
                      ))}
                    </ul>
                  ) : "—"}
                </td>
                <td>{statusBadge(r.draftStatus)}</td>
                <td>{statusBadge(r.deleteStatus)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {bundlePreview && (
        <div style={{marginTop: 16}}>
          <h3>Bundled Preview</h3>
          <pre style={{maxHeight: 420, overflow: "auto"}}>{JSON.stringify(bundlePreview, null, 2)}</pre>
          <button onClick={() => setBundlePreview(null)}>Close</button>
        </div>
      )}
      <div style={{marginTop: 24}}>
        <TokenPreviewPanel realm={realm} />
      </div>
    </div>
  );
}
