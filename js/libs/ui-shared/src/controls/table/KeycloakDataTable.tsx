// KeycloakDataTable.tsx (backwards-compatible modern UX)

import {
  Button,
  ButtonVariant,
  ToolbarItem,
  ToggleGroup,
  ToggleGroupItem,
  Badge,
} from "@patternfly/react-core";
import { SyncAltIcon } from "@patternfly/react-icons";
import type { SVGIconProps } from "@patternfly/react-icons/dist/js/createIcon";
import {
  ActionsColumn,
  ExpandableRowContent,
  IActionsResolver,
  IFormatter,
  IRow,
  IRowCell,
  ITransform,
  Table,
  TableProps,
  TableVariant,
  Tbody,
  Td,
  Th,
  Thead,
  Tr,
} from "@patternfly/react-table";
import { cloneDeep, get, intersectionBy } from "lodash-es";
import React, {
  ComponentClass,
  ReactNode,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type JSX,
} from "react";
import { useTranslation } from "react-i18next";
import { useFetch } from "../../utils/useFetch";
import { useStoredState } from "../../utils/useStoredState";
import { KeycloakSpinner } from "../KeycloakSpinner";
import { ListEmptyState } from "./ListEmptyState";
import { PaginatingTableToolbar } from "./PaginatingTableToolbar";

/* ─────────────────────────────────────────────────────────────
   Types
   ───────────────────────────────────────────────────────────── */

type TitleCell = { title: JSX.Element };
type Cell<T> = keyof T | JSX.Element | TitleCell;

type BaseRow<T> = {
  data: T;
  cells: Cell<T>[];
};

type Row<T> = BaseRow<T> & {
  selected: boolean;
  isOpen?: boolean;
  disableSelection: boolean;
  disableActions: boolean;
};

type SubRow<T> = BaseRow<T> & {
  parent: number;
};

export type Field<T> = {
  name: string;
  displayKey?: string;
  cellFormatters?: IFormatter[];
  transforms?: ITransform[];
  cellRenderer?: (row: T) => JSX.Element | string;
};

export type DetailField<T> = {
  name: string;
  enabled?: (row: T) => boolean;
  cellRenderer?: (row: T) => JSX.Element | string;
};

export type Action<T> = {
  title: string | React.ReactNode;
  onRowClick?: (row: T) => Promise<boolean | void> | void;
  isDisabled?: (row: T) => boolean;
};

export type LoaderFunction<T> = (
  first?: number,
  max?: number,
  search?: string
) => Promise<T[]>;

type SelectionMode = "none" | "single" | "multi";
type Density = "comfortable" | "compact";

/** NEW API */
type ModernSelectionProps = {
  selectionMode?: SelectionMode;               // preferred modern prop
  selectionActionsRenderer?: (selected: any[]) => ReactNode;
  initialDensity?: Density;
};

/** LEGACY API (kept for compatibility) */
type LegacySelectionProps = {
  /** legacy: tiny radios in old table → we map to selectionMode="single" with large targets */
  isRadio?: boolean;
  /** legacy: controls presence of header select-all checkbox */
  canSelectAll?: boolean;
  /** legacy: if false, disables selection completely */
  canSelect?: boolean;
};

export type DataListProps<T> = Omit<TableProps, "rows" | "cells" | "onSelect"> &
  ModernSelectionProps &
  LegacySelectionProps & {
    loader: T[] | LoaderFunction<T>;
    onSelect?: (value: T[]) => void;
    detailColumns?: DetailField<T>[];
    isRowDisabled?: (value: T) => boolean;
    isPaginated?: boolean;
    ariaLabelKey: string;
    searchPlaceholderKey?: string;
    columns: Field<T>[];
    actions?: Action<T>[];
    actionResolver?: IActionsResolver;
    searchTypeComponent?: ReactNode;
    toolbarItem?: ReactNode;
    subToolbar?: ReactNode;
    emptyState?: ReactNode;
    icon?: ComponentClass<SVGIconProps>;
    isSearching?: boolean;
  };

/* ─────────────────────────────────────────────────────────────
   Helpers
   ───────────────────────────────────────────────────────────── */

const isRowCell = (c: ReactNode | IRowCell): c is IRowCell =>
  !!c && (c as IRowCell).title !== undefined;

const stableId = (obj: any) => get(obj, "id") ?? get(obj, "draftRecordId");

/** Map legacy selection props → modern selection mode + header select-all flag */
function resolveSelectionProps(
  modern: { selectionMode?: SelectionMode },
  legacy: { isRadio?: boolean; canSelectAll?: boolean; canSelect?: boolean },
  hasOnSelect: boolean
): { mode: SelectionMode; headerSelectAllEnabled: boolean } {
  if (modern.selectionMode) {
    const mode = modern.selectionMode;
    return {
      mode,
      headerSelectAllEnabled:
        legacy.canSelectAll ?? (mode === "multi" ? true : false),
    };
  }

  if (
    typeof window !== "undefined" &&
    process?.env?.NODE_ENV !== "production" &&
    (legacy.isRadio !== undefined ||
      legacy.canSelectAll !== undefined ||
      legacy.canSelect !== undefined)
  ) {
    console.debug(
      "[KeycloakDataTable] Using legacy selection props (isRadio/canSelect/canSelectAll). Consider migrating to selectionMode='single'|'multi'|'none'."
    );
  }

  if (!hasOnSelect || legacy.canSelect === false) {
    return { mode: "none", headerSelectAllEnabled: false };
  }

  if (legacy.isRadio) {
    return { mode: "single", headerSelectAllEnabled: false };
  }

  return {
    mode: "multi",
    headerSelectAllEnabled: legacy.canSelectAll ?? true,
  };
}

/* ─────────────────────────────────────────────────────────────
   Inner table (render + selection)
   ───────────────────────────────────────────────────────────── */

function CellRenderer({
  row,
  index,
  actions,
  actionResolver,
}: {
  row: IRow;
  index?: number;
  actions?: any;
  actionResolver?: IActionsResolver;
}) {
  return (
    <>
      {row.cells!.map((c, i) => (
        <Td key={`cell-${i}`}>{(isRowCell(c) ? c.title : c) as ReactNode}</Td>
      ))}
      {(actions || actionResolver) && (
        <Td isActionCell>
          <ActionsColumn
            items={actions || actionResolver?.(row, {})!}
            extraData={{ rowIndex: index }}
          />
        </Td>
      )}
    </>
  );
}

const ExpandableRowRenderer = ({ row }: { row: IRow }) => (
  <>
    {row.cells!.map((c, i) => (
      <div key={`cell-${i}`}>{(isRowCell(c) ? c.title : c) as ReactNode}</div>
    ))}
  </>
);

function DataTable<T>({
  columns,
  rows,
  actions,
  actionResolver,
  ariaLabelKey,
  selected,
  onSelect,
  onCollapse,
  selectionMode,
  headerSelectAllEnabled,
  stickyHeader,
  density,
}: {
  columns: Field<T>[];
  rows: (Row<T> | SubRow<T>)[];
  actions?: any;
  actionResolver?: IActionsResolver;
  ariaLabelKey: string;
  selected?: T[];
  onSelect?: (value: T[]) => void;
  onCollapse?: (isOpen: boolean, rowIndex: number) => void;
  selectionMode: SelectionMode;
  headerSelectAllEnabled: boolean;
  stickyHeader: boolean;
  density: Density;
}) {
  const { t } = useTranslation();
  const [selectedRows, setSelectedRows] = useState<T[]>(selected || []);
  const [expandedRows, setExpandedRows] = useState<boolean[]>([]);

  const pageData = rows.map((r) => (r as any).data).filter(Boolean) as T[];

  const rowsSelectedOnPage = useMemo(
    () => intersectionBy(selectedRows, pageData, (item) => stableId(item)),
    [selectedRows, rows]
  );

  useEffect(() => {
    if (selectionMode !== "multi" || !headerSelectAllEnabled) return;
    const el = document.getElementsByName("check-all").item(0) as
      | HTMLInputElement
      | undefined;
    if (!el) return;
    el.indeterminate =
      rowsSelectedOnPage.length > 0 &&
      rowsSelectedOnPage.length < pageData.length;
  }, [selectionMode, headerSelectAllEnabled, rowsSelectedOnPage, pageData.length]);

  const updateSelectedRows = (next: T[]) => {
    setSelectedRows(next);
    onSelect?.(next);
  };

  const toggleRow = (rowIndex: number, shouldSelect: boolean) => {
    const rowData = (rows[rowIndex] as any).data;
    if (!rowData || selectionMode === "none") return;

    if (selectionMode === "single") {
      updateSelectedRows(shouldSelect ? [rowData] : []);
      return;
    }

    const id = stableId(rowData);
    if (shouldSelect) {
      if (!selectedRows.some((r) => stableId(r) === id)) {
        updateSelectedRows([...selectedRows, rowData]);
      }
    } else {
      updateSelectedRows(selectedRows.filter((r) => stableId(r) !== id));
    }
  };

  const toggleAllOnPage = (shouldSelect: boolean) => {
    if (!headerSelectAllEnabled || selectionMode !== "multi") return;
    if (shouldSelect) {
      const currentIds = new Set(selectedRows.map(stableId));
      updateSelectedRows([
        ...selectedRows,
        ...pageData.filter((d) => !currentIds.has(stableId(d))),
      ]);
    } else {
      const pageIds = new Set(pageData.map(stableId));
      updateSelectedRows(selectedRows.filter((d) => !pageIds.has(stableId(d))));
    }
  };

  const tableClasses = [
    density === "compact" ? "pf-m-compact" : "",
    "pf-m-striped",
    "pf-m-grid-md",
  ]
    .filter(Boolean)
    .join(" ");

  const headerSelectTh =
    selectionMode === "multi" && headerSelectAllEnabled ? (
      <Th
        select={{
          onSelect: (_e, isSelected) => toggleAllOnPage(isSelected),
          isSelected:
            pageData.length > 0 &&
            rowsSelectedOnPage.length === pageData.length,
          props: { name: "check-all" },
        }}
      />
    ) : selectionMode !== "none" ? (
      <Th />
    ) : null;

  const selectionCell = (index: number, rowData: any) =>
    selectionMode !== "none" ? (
      <Td
        select={{
          rowIndex: index,
          onSelect: (_e, isSelected) => toggleRow(index, isSelected),
          isSelected: !!selectedRows.find((v) => stableId(v) === stableId(rowData)),
          variant: selectionMode === "single" ? "radio" : "checkbox",
        }}
        style={{ minWidth: 48 }}
      />
    ) : null;

  const rowInteractiveProps = (index: number, rowData: any) => {
    if (selectionMode === "none") return {};
    const isSelected = !!selectedRows.find(
      (v) => stableId(v) === stableId(rowData)
    );
    return {
      onClick: (e: React.MouseEvent) => {
        const inAction = (e.target as HTMLElement).closest("[data-pf-content]");
        if (inAction) return;
        toggleRow(index, !isSelected);
      },
      tabIndex: 0,
      onKeyDown: (e: React.KeyboardEvent) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          toggleRow(index, !isSelected);
        }
        if (selectionMode === "multi" && e.shiftKey) {
          if (e.key === "ArrowUp" && index > 0) toggleRow(index - 1, true);
          if (e.key === "ArrowDown" && index < rows.length - 1)
            toggleRow(index + 1, true);
        }
      },
      style: { cursor: "pointer" },
    };
  };

  return (
    <Table
      className={tableClasses}
      aria-label={t(ariaLabelKey)}
      isStickyHeader={stickyHeader}
      variant={density === "compact" ? TableVariant.compact : undefined}
    >
      <Thead>
        <Tr>
          {headerSelectTh}
          {onCollapse && <Th screenReaderText={t("expandRow")} />}
          {columns.map((col) => (
            <Th key={col.name}>{col.name}</Th>
          ))}
        </Tr>
      </Thead>

      {!onCollapse ? (
        <Tbody>
          {(rows as IRow[]).map((row, index) => {
            const rowData = (row as any).data;
            return (
              <Tr key={index} {...rowInteractiveProps(index, rowData)}>
                {selectionCell(index, rowData)}
                <CellRenderer
                  row={row}
                  index={index}
                  actionResolver={actionResolver}
                  actions={actions}
                />
              </Tr>
            );
          })}
        </Tbody>
      ) : (
        (rows as IRow[]).map((row, index) => {
          const isParent = index % 2 === 0;
          const rowData = (rows as any)[index]?.data;
          const open = expandedRows[index] === true;

          return isParent ? (
            <Tbody key={index}>
              {/* PARENT ROW — do NOT set isExpanded here */}
              <Tr {...rowInteractiveProps(index, rowData)}>
                {selectionCell(index, rowData)}
                <Td
                  expand={{
                    isExpanded: open,
                    rowIndex: index,
                    expandId: "expandable-row-",
                    onToggle: (_e, rowIndex, isOpen) => {
                      setExpandedRows((prev) => {
                        const next = [...prev];
                        next[rowIndex] = isOpen;
                        return next;
                      });
                    },
                  }}
                />
                <CellRenderer
                  row={row}
                  index={index}
                  actionResolver={actionResolver}
                  actions={actions}
                />
              </Tr>

              {/* CONTENT ROW — this one controls visibility */}
              <Tr isExpanded={open}>
                {selectionMode !== "none" && <Td />}
                <Td />
                <Td colSpan={columns.length}>
                  <ExpandableRowContent>
                    <ExpandableRowRenderer row={rows[index + 1] as any} />
                  </ExpandableRowContent>
                </Td>
              </Tr>
            </Tbody>
          ) : null;
        })
      )}
    </Table>
  );
}

/* ─────────────────────────────────────────────────────────────
   Public component – data loading, toolbar, search, paging
   ───────────────────────────────────────────────────────────── */

export function KeycloakDataTable<T>({
  ariaLabelKey,
  searchPlaceholderKey,
  isPaginated = false,
  onSelect,
  // NEW
  selectionMode,
  selectionActionsRenderer,
  initialDensity = "comfortable",
  // LEGACY
  isRadio,
  canSelectAll,
  canSelect,
  // rest
  detailColumns,
  isRowDisabled,
  loader,
  columns,
  actions,
  actionResolver,
  searchTypeComponent,
  toolbarItem,
  subToolbar,
  emptyState,
  icon,
  isSearching = false,
  ...props
}: DataListProps<T>) {
  const { t } = useTranslation();
  const [selected, setSelected] = useState<T[]>([]);
  const [rows, setRows] = useState<(Row<T> | SubRow<T>)[]>();
  const [unPaginatedData, setUnPaginatedData] = useState<T[]>();
  const [loading, setLoading] = useState(false);
  const [density, setDensity] = useState<Density>(initialDensity);

  const [defaultPageSize, setDefaultPageSize] = useStoredState(
    localStorage,
    "pageSize",
    10
  );

  const [max, setMax] = useState(defaultPageSize);
  const [first, setFirst] = useState(0);
  const [search, setSearch] = useState<string>("");
  const prevSearch = useRef<string>();

  const [key, setKey] = useState(0);
  const prevKey = useRef<number>();
  const refresh = () => setKey((k) => k + 1);
  const id = useId();

  // Resolve selection props
  const { mode: resolvedMode, headerSelectAllEnabled } = resolveSelectionProps(
    { selectionMode },
    { isRadio, canSelectAll, canSelect },
    !!onSelect
  );

  // Prefer cellRenderer; only format when real array; else field lookup
  const renderCell = (cols: (Field<T> | DetailField<T>)[], value: T) =>
    cols.map((col) => {
      const cellRenderer = (col as Field<T>).cellRenderer;
      if (typeof cellRenderer === "function") {
        const Component = cellRenderer as any;
        return { title: <Component {...(value as any)} /> };
      }
      const fmt = (col as Field<T>).cellFormatters;
      if (Array.isArray(fmt) && fmt.length > 0) {
        const v = get(value as any, (col as Field<T>).name as any);
        return fmt.reduce((s, f) => f(s), v);
      }
      return get(value as any, (col as Field<T>).name as any);
    });

  const convertToRows = (data: T[]): (Row<T> | SubRow<T>)[] => {
    const showDetails = (value: T) => detailColumns?.[0]?.enabled?.(value);
    return data
      .map((value, index) => {
        const disabledRow = isRowDisabled ? isRowDisabled(value) : false;
        const row: (Row<T> | SubRow<T>)[] = [
          {
            data: value,
            disableSelection: disabledRow,
            disableActions: disabledRow,
            selected: !!selected.find((v) => stableId(v) === stableId(value)),
            isOpen: showDetails(value) ? false : undefined,
            cells: renderCell(columns, value),
          },
        ];
        if (detailColumns) {
          row.push({
            parent: index * 2,
            cells: showDetails(value) ? renderCell(detailColumns!, value) : [],
          } as SubRow<T>);
        }
        return row;
      })
      .flat();
  };

  const getNodeText = (node: Cell<T>): string => {
    if (["string", "number"].includes(typeof node)) return String(node);
    if (Array.isArray(node)) return node.map(getNodeText).join("");
    if (typeof node === "object") {
      return getNodeText(
        isValidElement((node as TitleCell).title)
          ? (node as TitleCell).title.props
          : Object.values(node)
      );
    }
    return "";
  };

  const filteredData = useMemo<(Row<T> | SubRow<T>)[] | undefined>(
    () =>
      search === "" || isPaginated
        ? undefined
        : convertToRows(unPaginatedData || [])
            .filter((row) =>
              row.cells.some(
                (cell) =>
                  cell &&
                  getNodeText(cell)
                    .toLowerCase()
                    .includes(search.toLowerCase())
              )
            )
            .slice(first, first + max + 1),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [search, first, max, unPaginatedData, isPaginated]
  );

  useFetch(
    async () => {
      setLoading(true);
      const newSearch = prevSearch.current === "" && search !== "";
      if (newSearch) setFirst(0);
      prevSearch.current = search;

      return typeof loader === "function"
        ? key === prevKey.current && unPaginatedData
          ? unPaginatedData
          : await loader(newSearch ? 0 : first, max + 1, search)
        : loader;
    },
    (data) => {
      prevKey.current = key;
      if (!isPaginated) {
        setUnPaginatedData(data);
        if (data.length > first) {
          data = data.slice(first, first + max + 1);
        } else {
          setFirst(0);
        }
      }
      setRows(convertToRows(data));
      setLoading(false);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [key, first, max, search, typeof loader !== "function" ? loader : undefined]
  );

  const convertActions = () =>
    actions &&
    cloneDeep(actions).map((action, idx) => {
      return {
        title: action.title,
        onClick: async (_e: any, rowIndex: number) => {
          const r = (filteredData || rows)![rowIndex] as Row<T>;
          const result = await actions[idx].onRowClick?.(r.data);
          if (result) {
            if (!isPaginated) setSearch("");
            refresh();
          }
        },
        isDisabled: (_e: any, rowIndex: number) => {
          const r = (filteredData || rows)![rowIndex] as Row<T>;
          return action.isDisabled?.(r.data) ?? false;
        },
      };
    });

  const data = filteredData || rows;
  const noData = !data || data.length === 0;
  const searching = search !== "" || isSearching;
  const maxRows = detailColumns ? max * 2 : max;
  const rowLength = detailColumns ? (data?.length || 0) / 2 : data?.length || 0;

  const stickyHeader = true;

  const densitySwitcher = (
    <ToolbarItem>
      <ToggleGroup aria-label="Density">
        <ToggleGroupItem
          text="Comfortable"
          buttonId="density-comfortable"
          isSelected={density === "comfortable"}
          onChange={() => setDensity("comfortable")}
        />
        <ToggleGroupItem
          text="Compact"
          buttonId="density-compact"
          isSelected={density === "compact"}
          onChange={() => setDensity("compact")}
        />
      </ToggleGroup>
    </ToolbarItem>
  );

  const selectionBar =
    (resolvedMode === "single" || resolvedMode === "multi") && selected.length > 0 ? (
      <div
        className="pf-v5-u-p-sm pf-v5-u-pt-md pf-v5-u-pb-md"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          borderBottom: "1px solid var(--pf-v5-global--BorderColor--100)",
          background: "var(--pf-v5-global--BackgroundColor--100)",
        }}
      >
        <Badge isRead>{selected.length}</Badge>
        <span>{t("selected", { defaultValue: "selected" })}</span>
        <div style={{ flex: 1 }} />
        {selectionActionsRenderer ? selectionActionsRenderer(selected) : null}
      </div>
    ) : null;

  const headerToolbar = (
    <>
      {toolbarItem}
      <ToolbarItem variant="separator" />
      <ToolbarItem>
        <Button variant="link" onClick={refresh} data-testid="refresh">
          <SyncAltIcon /> {t("refresh")}
        </Button>
      </ToolbarItem>
      <ToolbarItem variant="separator" />
      {densitySwitcher}
    </>
  );

  return (
    <>
      {(!noData || searching) && (
        <PaginatingTableToolbar
          id={id}
          count={rowLength}
          first={first}
          max={max}
          onNextClick={setFirst}
          onPreviousClick={setFirst}
          onPerPageSelect={(first, max) => {
            setFirst(first);
            setMax(max);
            setDefaultPageSize(max);
          }}
          inputGroupName={searchPlaceholderKey ? `${ariaLabelKey}input` : undefined}
          inputGroupOnEnter={setSearch}
          inputGroupPlaceholder={t(searchPlaceholderKey || "")}
          searchTypeComponent={searchTypeComponent}
          toolbarItem={headerToolbar}
          subToolbar={subToolbar}
        >
          {selectionBar}

          {!loading && !noData && (
            <DataTable
              stickyHeader={stickyHeader}
              selectionMode={resolvedMode}
              headerSelectAllEnabled={!!headerSelectAllEnabled}
              selected={selected}
              onSelect={(s) => {
                setSelected(s);
                onSelect?.(s);
              }}
              onCollapse={detailColumns ? (() => {}) : undefined}
              actions={convertActions()}
              actionResolver={actionResolver}
              rows={(data as (Row<T> | SubRow<T>)[]).slice(0, maxRows)}
              columns={columns}
              ariaLabelKey={ariaLabelKey}
              density={density}
            />
          )}

          {!loading && noData && searching && (
            <ListEmptyState
              hasIcon
              icon={icon}
              isSearchVariant
              message={t("noSearchResults")}
              instructions={t("noSearchResultsInstructions")}
              secondaryActions={[
                {
                  text: t("clearAllFilters"),
                  onClick: () => setSearch(""),
                  type: ButtonVariant.link,
                },
              ]}
            />
          )}
        </PaginatingTableToolbar>
      )}

      {loading && <KeycloakSpinner />}

      {!loading && noData && !searching && (emptyState || (
        <ListEmptyState
          hasIcon
          icon={icon}
          message={t("noResults", { defaultValue: "No results" })}
          instructions={t("noSearchResultsInstructions") || ""}
        />
      ))}
    </>
  );
}
