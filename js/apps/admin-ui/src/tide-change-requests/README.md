# Tide Change Requests (Replay)

This folder replaces the old draft-based UI. It is wired to the new **Replay** backend and supports:

- Filter/search by **status**, **kind**, **actor**, **bundleId**, **date range**.
- Shows **bundles** and replay **items** in a details drawer.
- Actions: **Approve**, **Deny**, **Cancel**, **Apply** (as exposed by backend).
- Updated status labels: `PENDING`, `APPROVED`, `DENIED`, `CANCELLED`, `FAILED`, `APPLIED`.

> Delete any legacy files under `src/tide-change-requests/{routes,utils,...}` that reference the old *Draft* entities.
