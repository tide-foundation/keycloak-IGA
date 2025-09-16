// // TIDECLOAK IMPLEMENTATION
import React from "react";
import { postPreview, postBundle, postRebase, getActiveRev } from "./api";
import type { TokenPreviewSpec } from "./types";

export function TokenPreviewPanel({ realm }: { realm: string }) {
  const [userId, setUserId] = React.useState("");
  const [clientId, setClientId] = React.useState("");
  const [result, setResult] = React.useState<any>(null);
  const [activeRev, setActiveRev] = React.useState<number | null>(null);

  React.useEffect(() => { getActiveRev(realm).then(d => setActiveRev(d.activeRev)); }, [realm]);

  const run = async () => {
    const spec: TokenPreviewSpec = { userId: userId || undefined, clientId };
    const data = await postPreview(realm, spec);
    setResult(data);
  };

  const doRebase = async () => {
    const data = await postRebase(realm);
    setActiveRev(data.newActiveRev);
  };

  return (
    <div className="kcTokenPreviewPanel">
      <h3>Token Preview</h3>
      <div>Active Context Revision: {activeRev ?? "…"}</div>
      <div style={{display:"flex", gap: 8}}>
        <input placeholder="userId (optional for default-client)" value={userId} onChange={e => setUserId(e.target.value)} />
        <input placeholder="clientId" value={clientId} onChange={e => setClientId(e.target.value)} />
        <button onClick={run}>Preview</button>
        <button onClick={doRebase}>Rebase After Commit</button>
      </div>
      {result && (
        <pre style={{maxHeight: 400, overflow: "auto"}}>
          {JSON.stringify(result, null, 2)}
        </pre>
      )}
    </div>
  );
}
