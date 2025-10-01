# Keycloak IGA → tidecloak-iga-extensions UI update (drop-in)

This bundle adds:
- A new **admin client extension** `tideAdmin` (calls `/tide-admin/*`).
- Shared **StatusChip** and **RoleStatusBadge** components showing Draft/Pending/Approved/Active/Denied.
- Bulk **merge-by-user+client** logic for approvals/commits, with a **Preview Modal**.
- Patches to wire bulk actions into `ChangeRequestsSection.tsx` and to render per-action status in role mapping.

## Files
- `js/apps/admin-ui/src/admin-client/tideAdmin.ts`
- `js/apps/admin-ui/src/components/tide/StatusChip.tsx`
- `js/apps/admin-ui/src/components/tide/RoleStatusBadge.tsx`
- `js/apps/admin-ui/src/tide-change-requests/types.ts`
- `js/apps/admin-ui/src/tide-change-requests/merge.ts`
- `js/apps/admin-ui/src/tide-change-requests/MergePreviewModal.tsx`
- `PATCHES/ChangeRequestsSection.patch`
- `PATCHES/RoleMapping.patch`

## 1) Install files
Copy the `js/` tree into your repo root so paths line up.

## 2) Register the admin client extension
In the file where the AdminClient is created (e.g. `js/apps/admin-ui/src/context/admin-client/index.ts`), add:

```ts
import tideAdminExt from "../../admin-client/tideAdmin";
// after creating the client:
tideAdminExt(client);
```

Ensure `adminClient.realmName` is set prior to first call (follows the existing Admin UI patterns).

## 3) Change Requests: enable bulk approve/commit with merge
- Open `js/apps/admin-ui/src/tide-change-requests/ChangeRequestsSection.tsx`.
- Apply `PATCHES/ChangeRequestsSection.patch` or manually integrate the code:
  - Import `mergeByUserClient`, `MergePreviewModal`, and types.
  - Track `selectedRows` and `allRows` (from your loader).
  - Replace old button handlers with `handleBulkApprove/confirmBulkApprove/handleBulkCommit`.
  - Use the modal for a user-visible preview.
  - For Tide IGA flows, call `tideAdmin.signChangeSet` before `commitDraftChangeSet`. For non-Tide, skip signing.

## 4) Action pages status (e.g., Role Mapping)
- Add `<RoleStatusBadge userId={...} roleId={...} />` to the Status column.
- If you surface user-level or composite role status, call the other status readers in `tideAdmin` similarly.

## 5) Tide vs non-Tide
- Gate the signing step with your existing `isTideEnabled` flag/logic.

## 6) Build
TypeScript files are self-contained; no tsconfig changes required. Run your normal build.

## 7) Troubleshooting
- If your backend path differs, adjust the base in `tideAdmin.ts`.
- If your Change Request row shape differs, map it to `ChangeRequestRow` in your loader and everything else works unchanged.

---
## Optional: git apply
The included patches are **best-effort** and may need small edits if your sources differ.
Run from repo root:

```bash
git apply --reject --whitespace=fix PATCHES/ChangeRequestsSection.patch
git apply --reject --whitespace=fix PATCHES/RoleMapping.patch
```
