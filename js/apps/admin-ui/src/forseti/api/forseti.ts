import type KeycloakAdminClient from "@keycloak/keycloak-admin-client";
import type {
  ForsetiPolicyRoute,
  ForsetiPolicyManifest,
  CatalogItem,
  CreateRouteRequest,
  CreateManifestRequest,
  CodeUploadResponse,
  RevokeCodeRequest,
  SimulationRequest,
} from "../types";

export class ForsetiAdminClient {
  constructor(private adminClient: KeycloakAdminClient) {}

  private async request<T>(
    path: string,
    options: RequestInit = {}
  ): Promise<T> {
    const token = await this.adminClient.getAccessToken();
    const response = await fetch(`${this.adminClient.baseUrl}/${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  // Routes
  async listRoutes(): Promise<ForsetiPolicyRoute[]> {
    return this.request<ForsetiPolicyRoute[]>("api/forseti/admin/routes");
  }

  async getRoute(id: number): Promise<ForsetiPolicyRoute> {
    return this.request<ForsetiPolicyRoute>(`api/forseti/admin/routes/${id}`);
  }

  async createRoute(route: CreateRouteRequest): Promise<ForsetiPolicyRoute> {
    return this.request<ForsetiPolicyRoute>("api/forseti/admin/routes", {
      method: "POST",
      body: JSON.stringify(route),
    });
  }

  async updateRoute(
    id: number,
    route: CreateRouteRequest
  ): Promise<ForsetiPolicyRoute> {
    return this.request<ForsetiPolicyRoute>(`api/forseti/admin/routes/${id}`, {
      method: "PUT",
      body: JSON.stringify(route),
    });
  }

  async deleteRoute(id: number): Promise<void> {
    return this.request<void>(`api/forseti/admin/routes/${id}`, {
      method: "DELETE",
    });
  }

  // Manifests
  async listManifests(): Promise<ForsetiPolicyManifest[]> {
    return this.request<ForsetiPolicyManifest[]>("api/forseti/admin/manifests");
  }

  async getManifest(id: number): Promise<ForsetiPolicyManifest> {
    return this.request<ForsetiPolicyManifest>(
      `api/forseti/admin/manifests/${id}`
    );
  }

  async createManifest(
    manifest: CreateManifestRequest
  ): Promise<ForsetiPolicyManifest> {
    return this.request<ForsetiPolicyManifest>("api/forseti/admin/manifests", {
      method: "POST",
      body: JSON.stringify(manifest),
    });
  }

  async activateManifest(id: number): Promise<void> {
    return this.request<void>(`api/forseti/admin/manifests/${id}/activate`, {
      method: "POST",
    });
  }

  // Policy Catalog
  async listPolicies(): Promise<CatalogItem[]> {
    return this.request<CatalogItem[]>("api/forseti/admin/policies");
  }

  // Code Management
  async uploadCode(vvkId: string, dllFile: File): Promise<CodeUploadResponse> {
    const token = await this.adminClient.getAccessToken();
    const formData = new FormData();
    formData.append("vvkId", vvkId);
    formData.append("dllFile", dllFile);

    const response = await fetch(
      `${this.adminClient.baseUrl}/api/forseti/admin/code`,
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
        },
        body: formData,
      }
    );

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    return response.json();
  }

  async getCodeMetadata(bh: string): Promise<any> {
    return this.request<any>(`api/forseti/admin/code/${bh}`);
  }

  async revokeCode(request: RevokeCodeRequest): Promise<void> {
    return this.request<void>("api/forseti/admin/revocations", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }

  // Simulation (if available)
  async simulate(request: SimulationRequest): Promise<any> {
    return this.request<any>("api/forseti/admin/simulate", {
      method: "POST",
      body: JSON.stringify(request),
    });
  }
}