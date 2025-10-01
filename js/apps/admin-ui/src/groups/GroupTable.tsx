import type GroupRepresentation from "@keycloak/keycloak-admin-client/lib/defs/groupRepresentation";
import {
  GroupQuery,
  SubGroupQuery,
} from "@keycloak/keycloak-admin-client/lib/resources/groups";
import { SearchInput, ToolbarItem } from "@patternfly/react-core";
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "react-router-dom";
import { useAdminClient } from "../admin-client";
import { ListEmptyState, KeycloakDataTable } from "@keycloak/keycloak-ui-shared";
import { useAccess } from "../context/access/Access";
import useToggle from "../utils/useToggle";
import { GroupsModal } from "./GroupsModal";
import { useSubGroups } from "./SubGroupsContext";
import { DeleteGroup } from "./components/DeleteGroup";
import { GroupToolbar } from "./components/GroupToolbar";
import { MoveDialog } from "./components/MoveDialog";
import { getLastId } from "./groupIdUtils";
import type { IAction, ISeparator, IActionsResolver, IRowData } from "@patternfly/react-table";

type GroupTableProps = {
  refresh: () => void;
};

export const GroupTable = ({ refresh: viewRefresh }: GroupTableProps) => {
  const { adminClient } = useAdminClient();
  const { t } = useTranslation();
  const [selectedRows, setSelectedRows] = useState<GroupRepresentation[]>([]);
  const [rename, setRename] = useState<GroupRepresentation>();
  const [isCreateModalOpen, toggleCreateOpen] = useToggle();
  const [duplicateId, setDuplicateId] = useState<string>();
  const [showDelete, toggleShowDelete] = useToggle();
  const [move, setMove] = useState<GroupRepresentation>();
  const { currentGroup } = useSubGroups();
  const [key, setKey] = useState(0);
  const refresh = () => setKey((k) => k + 1);
  const [search, setSearch] = useState<string>();
  const location = useLocation();
  const id = getLastId(location.pathname);
  const { hasAccess } = useAccess();
  const isManager = hasAccess("manage-users") || currentGroup()?.access?.manage;

  const loader = async (first?: number, max?: number) => {
    if (id) {
      const args: SubGroupQuery = {
        search: search || "",
        first,
        max,
        parentId: id,
      };
      return adminClient.groups.listSubGroups(args);
    }
    const args: GroupQuery = {
      search: search || "",
      first: first ?? undefined,
      max: max ?? undefined,
    };
    return adminClient.groups.find(args);
  };

  // Row-level handlers kept in scope so the resolver can use them
  const onEdit = (row: GroupRepresentation) => setRename(row);

  const onDelete = (row: GroupRepresentation) => {
    setSelectedRows([row]);
    toggleShowDelete();
  };

  const onMoveTo = (row: GroupRepresentation) => setMove(row);

  const onCreateChild = (row: GroupRepresentation) => {
    setSelectedRows([row]);
    toggleCreateOpen();
  };

  // PatternFly-style actions for the kebab per row
  const actionsResolver: IActionsResolver = (rowData: IRowData) => {
    const row = rowData?.data as GroupRepresentation;
    if (!isManager) return [];
    const items: (IAction | ISeparator)[] = [
      { title: t("edit"), onClick: () => onEdit(row) },
      { title: t("moveTo"), onClick: () => onMoveTo(row) },
      { title: t("createChildGroup"), onClick: () => onCreateChild(row) },
      ...(id
        ? []
        : [{ title: t("duplicate"), onClick: () => setDuplicateId(row.id!) }]),
      { isSeparator: true },
      { title: t("delete"), onClick: () => onDelete(row) },
    ];
    return items;
  };

  return (
    <>
      <DeleteGroup
        show={showDelete}
        toggleDialog={toggleShowDelete}
        selectedRows={selectedRows}
        refresh={() => {
          refresh();
          viewRefresh();
          setSelectedRows([]);
        }}
      />
      {rename && (
        <GroupsModal
          id={rename.id}
          rename={rename}
          refresh={() => {
            refresh();
            viewRefresh();
          }}
          handleModalToggle={() => setRename(undefined)}
        />
      )}
      {isCreateModalOpen && (
        <GroupsModal
          id={selectedRows[0]?.id || id}
          handleModalToggle={toggleCreateOpen}
          refresh={() => {
            setSelectedRows([]);
            refresh();
            viewRefresh();
          }}
        />
      )}
      {duplicateId && (
        <GroupsModal
          id={duplicateId}
          duplicateId={duplicateId}
          refresh={() => {
            refresh();
            viewRefresh();
          }}
          handleModalToggle={() => setDuplicateId(undefined)}
        />
      )}
      {move && (
        <MoveDialog
          source={move}
          refresh={() => {
            setMove(undefined);
            refresh();
            viewRefresh();
          }}
          onClose={() => setMove(undefined)}
        />
      )}

      <KeycloakDataTable<GroupRepresentation>
        key={`${id}${key}`}
        onSelect={(rows) => setSelectedRows([...rows])}
        canSelectAll
        loader={loader}
        ariaLabelKey="groups"
        isPaginated
        isSearching={!!search}
        toolbarItem={
          <>
            <ToolbarItem>
              <SearchInput
                data-testid="group-search"
                placeholder={t("filterGroups")}
                value={search}
                onChange={(_, value) => {
                  setSearch(value);
                  if (value === "") refresh();
                }}
                onSearch={refresh}
                onClear={() => {
                  setSearch("");
                  refresh();
                }}
              />
            </ToolbarItem>
            <GroupToolbar
              toggleCreate={toggleCreateOpen}
              toggleDelete={toggleShowDelete}
              kebabDisabled={selectedRows.length === 0}
            />
          </>
        }
        actionResolver={actionsResolver}
        // IMPORTANT: The `actions` prop is your legacy KeycloakDataTable action API (no separators, uses onRowClick).
        // Keep it, but do not include separators here to satisfy the Action<T> type.
        actions={
          !isManager
            ? []
            : [
              {
                title: t("edit"),
                onRowClick: async (row: GroupRepresentation) => {
                  onEdit(row);
                  return false;
                },
              },
              {
                title: t("moveTo"),
                onRowClick: async (row: GroupRepresentation) => {
                  onMoveTo(row);
                  return false;
                },
              },
              {
                title: t("createChildGroup"),
                onRowClick: async (row: GroupRepresentation) => {
                  onCreateChild(row);
                  return false;
                },
              },
              ...(!id
                ? [
                  {
                    title: t("duplicate"),
                    onRowClick: async (row: GroupRepresentation) => {
                      setDuplicateId(row.id!);
                      return false;
                    },
                  },
                ]
                : []),
              {
                title: t("delete"),
                onRowClick: async (row: GroupRepresentation) => {
                  onDelete(row);
                  return true;
                },
              },
            ]
        }

        columns={[
          {
            name: "name",
            displayKey: "groupName",
            cellRenderer: (group) =>
              group.access?.view ? (
                <Link key={group.id} to={`${location.pathname}/${group.id}`}>
                  {group.name}
                </Link>
              ) : (
                <span>{group.name}</span>
              ),
          },
        ]}
        emptyState={
          <ListEmptyState
            hasIcon={true}
            message={t(`noGroupsInThis${id ? "SubGroup" : "Realm"}`)}
            instructions={t(
              `noGroupsInThis${id ? "SubGroup" : "Realm"}Instructions`,
            )}
            primaryActionText={t("createGroup")}
            onPrimaryAction={toggleCreateOpen}
          />
        }
      />
    </>
  );
};
