// // TIDECLOAK IMPLEMENTATION
// Admin UI API helpers for Token Preview endpoints
import type { TokenPreviewSpec } from "./types";

export async function postPreview(realm: string, spec: TokenPreviewSpec) {
  const res = await fetch(`/realms/${encodeURIComponent(realm)}/tidecloak/token-preview/`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(spec)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postBundle(realm: string, specs: TokenPreviewSpec[], expectedActiveRev?: number) {
  const payload: any = { items: specs };
  if (expectedActiveRev !== undefined) payload.expectedActiveRev = expectedActiveRev;
  const res = await fetch(`/realms/${encodeURIComponent(realm)}/tidecloak/token-preview/bundle`, {
    method: "POST",
    headers: {"Content-Type":"application/json"},
    body: JSON.stringify(payload)
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function postRebase(realm: string) {
  const res = await fetch(`/realms/${encodeURIComponent(realm)}/tidecloak/token-preview/rebase-after-commit`, {
    method: "POST"
  });
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}

export async function getActiveRev(realm: string) {
  const res = await fetch(`/realms/${encodeURIComponent(realm)}/tidecloak/token-preview/active-rev`);
  if (!res.ok) throw new Error(await res.text());
  return res.json();
}
