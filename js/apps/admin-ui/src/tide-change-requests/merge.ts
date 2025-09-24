import { ChangeRequestRow, MergeResult } from "./types";

const keyOf = (r: ChangeRequestRow) => `${r.userId ?? ""}|${r.clientId ?? ""}`;

function normalizeActions(rows: ChangeRequestRow[]): ChangeRequestRow[] {
  // Cancel opposing pairs and dedupe identical targets.
  const map = new Map<string, ChangeRequestRow>();

  for (const row of rows) {
    const targetKey = `${row.changeSetType}|${row.userId ?? ""}|${
      row.clientId ?? ""
    }|${row.roleId ?? ""}|${row.permissionId ?? ""}`;

    const existing = map.get(targetKey);
    if (!existing) {
      map.set(targetKey, row);
      continue;
    }

    const pair = `${existing.actionType}>${row.actionType}`;
    if (pair === "ADD>REMOVE" || pair === "REMOVE>ADD") {
      map.delete(targetKey); // cancels out
    } else {
      // UPDATE or duplicate same action: last write wins
      map.set(targetKey, row);
    }
  }

  return Array.from(map.values());
}

export function mergeByUserClient(
  selectedRows: ChangeRequestRow[],
  allRowsInTable?: ChangeRequestRow[]
): MergeResult {
  const byKey = new Map<string, ChangeRequestRow[]>();

  for (const r of selectedRows) {
    const key = keyOf(r);
    if (!byKey.has(key)) byKey.set(key, []);
    byKey.get(key)!.push(r);
  }

  const merged = [];
  for (const [key, rows] of byKey.entries()) {
    const actions = normalizeActions(rows);
    if (actions.length === 0) continue; // all canceled out
    merged.push({
      key,
      userId: actions[0]?.userId,
      clientId: actions[0]?.clientId,
      actions,
      sourceRows: rows,
    });
  }

  // Untouched = anything not in selection (handy if you want to grey them out)
  const selectedIds = new Set(selectedRows.map((r) => r.draftRecordId));
  const untouched =
    allRowsInTable?.filter((r) => !selectedIds.has(r.draftRecordId)) ?? [];

  return { merged, untouched };
}
