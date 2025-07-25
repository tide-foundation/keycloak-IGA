import { label, useEnvironment } from "@keycloak/keycloak-ui-shared";
import {
  Label,
  Nav,
  NavGroup,
  PageSidebar,
  PageSidebarBody,
} from "@patternfly/react-core";
import { FormEvent, useState, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { NavLink, useNavigate } from "react-router-dom";
import { useAccess } from "./context/access/Access";
import { useRealm } from "./context/realm-context/RealmContext";
import { useServerInfo } from "./context/server-info/ServerInfoProvider";
import { Environment } from "./environment";
import { toPage } from "./page/routes";
import { routes } from "./routes";
import useIsFeatureEnabled, { Feature } from "./utils/useIsFeatureEnabled";
import { useAdminClient } from "./admin-client";


import "./page-nav.css";

type LeftNavProps = {
  title: string;
  path: string;
  id?: string;
  label?: string // tidecloak implementation
};

const LeftNav = ({ title, path, id, label }: LeftNavProps) => {
  const { t } = useTranslation();
  const { hasAccess } = useAccess();
  const { realm } = useRealm();
  const encodedRealm = encodeURIComponent(realm);
  const route = routes.find(
    (route) =>
      route.path.replace(/\/:.+?(\?|(?:(?!\/).)*|$)/g, "") === (id || path),
  );

  const accessAllowed =
    route &&
    (route.handle.access instanceof Array
      ? hasAccess(...route.handle.access)
      : hasAccess(route.handle.access));

  if (!accessAllowed) {
    return undefined;
  }

  const name = "nav-item" + path.replace("/", "-");
  return (
    <li>
      <NavLink
        id={name}
        data-testid={name}
        to={`/${encodedRealm}${path}`}
        className={({ isActive }) =>
          `pf-v5-c-nav__link${isActive ? " pf-m-current" : ""}`
        }
      >
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.5rem' }}>
        {t(title)}
      {label && (
        <span
          style={{
            backgroundColor: '#0066cc',      // Blue background for visibility
            color: '#fff',                   // White text
            padding: '2px 8px',
            borderRadius: '12px',
            fontSize: '12px',
            fontWeight: 'bold',
            minWidth: '20px',
            textAlign: 'center',
            lineHeight: '1.2'
          }}
        >
          {label}
        </span>
      )}
    </span>
      </NavLink>
    </li>
  );
};

export const PageNav = () => {
    const { adminClient } = useAdminClient();
  
  const { t } = useTranslation();
  const { environment } = useEnvironment<Environment>();
  const { hasSomeAccess } = useAccess();
  const { componentTypes } = useServerInfo();
  const isFeatureEnabled = useIsFeatureEnabled();
  const pages =
    componentTypes?.["org.keycloak.services.ui.extend.UiPageProvider"];
  const navigate = useNavigate();
  const { realm, realmRepresentation } = useRealm();
  const [changeRequestsCount, setClientRequestCount] = useState<number>(0)

  useEffect(() => {
    const getCount = async () => {
      const userRequest = await adminClient.tideUsersExt.getRequestedChangesForUsers();
      const roleRequest = await adminClient.tideUsersExt.getRequestedChangesForRoles();
      const clientRequest = await adminClient.tideUsersExt.getRequestedChangesForClients();

      setClientRequestCount(userRequest.length + roleRequest.length + clientRequest.length)
    }

    getCount();

  }
  , [realmRepresentation])

  type SelectedItem = {
    groupId: number | string;
    itemId: number | string;
    to: string;
    event: FormEvent<HTMLInputElement>;
  };

  const onSelect = (item: SelectedItem) => {
    navigate(item.to);
    item.event.preventDefault();
  };

  const showManage = hasSomeAccess(
    "view-realm",
    "query-groups",
    "query-users",
    "query-clients",
    "view-events",
  );

  const showConfigure = hasSomeAccess(
    "view-realm",
    "query-clients",
    "view-identity-providers",
  );

  const showManageRealm = environment.masterRealm === environment.realm;

  return (
    <PageSidebar className="keycloak__page_nav__nav">
      <PageSidebarBody>
        <Nav onSelect={(_event, item) => onSelect(item as SelectedItem)}>
          <h2
            className="pf-v5-c-nav__section-title"
            style={{ wordWrap: "break-word" }}
          >
            <span data-testid="currentRealm">
              {label(t, realmRepresentation?.displayName, realm)}
            </span>{" "}
            <Label color="blue">{t("currentRealm")}</Label>
          </h2>
          {showManageRealm && (
            <NavGroup>
              <LeftNav title={t("manageRealms")} path="/realms" />
            </NavGroup>
          )}
          {showManage && (
            <NavGroup aria-label={t("manage")} title={t("manage")}>
              {isFeatureEnabled(Feature.Organizations) &&
                realmRepresentation?.organizationsEnabled && (
                  <LeftNav title="organizations" path="/organizations" />
                )}
              <LeftNav title="clients" path="/clients" />
              <LeftNav title="clientScopes" path="/client-scopes" />
              <LeftNav title="realmRoles" path="/roles" />
              <LeftNav title="users" path="/users" />
              <LeftNav title="groups" path="/groups" />
              <LeftNav title="sessions" path="/sessions" />
              <LeftNav title="events" path="/events" />
              {/** TIDECLOAK IMPLEMENTATION */}
              <LeftNav
                title="Change Requests "
                path="/change-requests"
                label={changeRequestsCount > 0 ? changeRequestsCount.toString() : undefined}
              />
            </NavGroup>
          )}

          {showConfigure && (
            <NavGroup aria-label={t("configure")} title={t("configure")}>
              <LeftNav title="realmSettings" path="/realm-settings" />
              <LeftNav title="authentication" path="/authentication" />
              {isFeatureEnabled(Feature.AdminFineGrainedAuthzV2) &&
                realmRepresentation?.adminPermissionsEnabled && (
                  <LeftNav title="permissions" path="/permissions" />
                )}
              <LeftNav title="identityProviders" path="/identity-providers" />
              <LeftNav title="userFederation" path="/user-federation" />
              {isFeatureEnabled(Feature.DeclarativeUI) &&
                pages?.map((p) => (
                  <LeftNav
                    key={p.id}
                    title={p.id}
                    path={toPage({ providerId: p.id }).pathname!}
                    id="/page-section"
                  />
                ))}
            </NavGroup>
          )}
        </Nav>
      </PageSidebarBody>
    </PageSidebar>
  );
};
