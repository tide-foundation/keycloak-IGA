import type { ListParams, Replay } from "./types";
import { useAdminClient } from "../admin-client"; // keep tree-shakable import here for consistency
// NOTE: consumers call the functions below; we don't export the hook.

type KcAdminClient = any;

export async function kcFetch<T>(
  adminClient: KcAdminClient,
  path: string,
  init?: RequestInit
): Promise<T> {
  const baseUrl = (adminClient.baseUrl || window.location.origin).replace(/\/+$/, "");
  const url = `${baseUrl}${path.startsWith("/") ? "" : "/"}${path}`;

  const token = await adminClient.getAccessToken(); // ✅ use the provider

  const res = await fetch(url, {
    ...init,
    headers: {
      ...(init?.headers || {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      "Content-Type":
        (init?.headers as any)?.["Content-Type"] ??
        (init?.body ? "application/json" : "application/json"),
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(text || `HTTP ${res.status}`);
  }

  const ctype = res.headers.get("content-type")?.toLowerCase() || "";
  if (res.status === 204 || !ctype.includes("application/json")) {
    return undefined as T;
  }
  return (await res.json()) as T;
}


function query(params?: Record<string, any>) {
  const s = new URLSearchParams();
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      if (v == null || v === "") continue;
      if (Array.isArray(v)) v.forEach((vv) => s.append(k, String(vv)));
      else s.set(k, String(v));
    }
  }
  const q = s.toString();
  return q ? `?${q}` : "";
}

export function useReplayService() {
  // Localize the hook usage (so call sites don’t import it directly).
  const { adminClient } = useAdminClient();

  return {
    listReplays: (realm: string, params: ListParams) =>
      kcFetch<{ items: Replay[]; total: number }>(
        adminClient,
        `/admin/realms/${encodeURIComponent(realm)}/tide-admin/replays${query(params)}`
      ),

    getReplay: (realm: string, id: string) =>
      kcFetch<Replay>(
        adminClient,
        `/admin/realms/${encodeURIComponent(realm)}/tide-admin/replays/${encodeURIComponent(id)}`
      ),

    actOnReplay: (realm: string, id: string, action: "approve" | "deny" | "cancel" | "apply") =>
      kcFetch<Replay>(
        adminClient,
        `/admin/realms/${encodeURIComponent(realm)}/tide-admin/replays/${encodeURIComponent(id)}/${action}`,
        { method: "POST" }
      ),

    listBundles: (realm: string, params: { first?: number; max?: number }) =>
      kcFetch<{ items: { id: string; size: number; createdAt: number }[]; total: number }>(
        adminClient,
        `/admin/realms/${encodeURIComponent(realm)}/tide-admin/replay-bundles${query(params)}`
      ),
  };
}
