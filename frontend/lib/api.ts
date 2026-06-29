// Typed fetch wrapper for the NexusLLM backend.
//
// All calls go through the Next.js rewrite at /api/* -> backend, so the browser
// uses a single origin. The admin key is read from localStorage so the admin
// panel can authenticate without a server round-trip.

import type {
  MetricsResponse,
  ModelsResponse,
  ProvidersResponse,
  RequestLogEntry,
  CircuitBreakerEntry,
  UnifiedKeyResponse,
  SupportedProvider,
  ProviderKeyGroup,
  AnalyticsResponse,
  AnalyticsFilters,
  RequestsPage,
} from "./types";

function buildQuery(params: Record<string, unknown>): string {
  const q = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== "") q.set(k, String(v));
  }
  const s = q.toString();
  return s ? `?${s}` : "";
}

import { getIdToken } from "./auth";

const ADMIN_KEY_STORAGE = "nexusllm.adminKey";

export function getAdminKey(): string {
  if (typeof window === "undefined") return "";
  // Fall back to the default local dev key so the dashboard works out of the
  // box. Override it from the Admin tab for non-default deployments.
  return window.localStorage.getItem(ADMIN_KEY_STORAGE) || "dev-admin-key";
}

export function setAdminKey(key: string): void {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADMIN_KEY_STORAGE, key);
}

function adminHeaders(): HeadersInit {
  // Prefer the signed-in user's Firebase token (their isolated workspace);
  // fall back to the admin key for the operator / single-admin deployments.
  const token = getIdToken();
  if (token) return { Authorization: `Bearer ${token}` };
  const key = getAdminKey();
  return key ? { Authorization: `Bearer ${key}` } : {};
}

async function getJSON<T>(path: string, withAdmin = false): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: withAdmin ? adminHeaders() : undefined,
    cache: "no-store",
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status} ${res.statusText}: ${text}`);
  }
  return res.json() as Promise<T>;
}

export const api = {
  health: () => getJSON<{ status: string }>("/health"),
  providers: () => getJSON<ProvidersResponse>("/admin/providers", true),
  models: () => getJSON<ModelsResponse>("/v1/models"),
  metrics: () => getJSON<MetricsResponse>("/admin/metrics", true),
  logs: (limit = 100, search = "") =>
    getJSON<{ logs: RequestLogEntry[] }>(
      `/admin/logs?limit=${limit}${search ? `&search=${encodeURIComponent(search)}` : ""}`,
      true,
    ),
  circuitBreakers: () =>
    getJSON<{ breakers: CircuitBreakerEntry[] }>("/admin/circuit-breakers", true),

  analytics: (filters: AnalyticsFilters) =>
    getJSON<AnalyticsResponse>(`/admin/analytics${buildQuery(filters as any)}`, true),
  analyticsRequests: (
    filters: AnalyticsFilters & {
      search?: string;
      sort?: string;
      direction?: string;
      page?: number;
      page_size?: number;
    },
  ) =>
    getJSON<RequestsPage>(
      `/admin/analytics/requests${buildQuery(filters as any)}`,
      true,
    ),

  async resetCircuit(providerId: string): Promise<void> {
    const res = await fetch(`/api/admin/providers/${providerId}/reset`, {
      method: "POST",
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`reset failed: ${res.status}`);
  },

  async reload(): Promise<void> {
    const res = await fetch(`/api/admin/reload`, {
      method: "POST",
      headers: adminHeaders(),
    });
    if (!res.ok) throw new Error(`reload failed: ${res.status}`);
  },

  // --- Keys management ---
  unifiedKey: () => getJSON<UnifiedKeyResponse>("/admin/unified-key", true),
  regenerateUnifiedKey: () =>
    adminMutate<{ key: string }>("/admin/unified-key/regenerate", "POST"),
  supportedProviders: () =>
    getJSON<{ providers: SupportedProvider[] }>("/admin/supported-providers", true),
  keyGroups: () => getJSON<{ groups: ProviderKeyGroup[] }>("/admin/keys", true),

  addKey: (provider_id: string, api_key: string, label: string) =>
    adminMutate("/admin/keys", "POST", { provider_id, api_key, label }),
  editKeyLabel: (id: string, label: string) =>
    adminMutate(`/admin/keys/${id}`, "PATCH", { label }),
  editKey: (id: string, data: { label?: string; api_key?: string }) =>
    adminMutate(`/admin/keys/${id}`, "PATCH", data),
  toggleKey: (id: string, enabled: boolean) =>
    adminMutate(`/admin/keys/${id}/enabled`, "PATCH", { enabled }),
  removeKey: (id: string) => adminMutate(`/admin/keys/${id}`, "DELETE"),
  checkKey: (id: string) =>
    adminMutate<{ status: string; latency_ms: number | null }>(
      `/admin/keys/${id}/check`,
      "POST",
    ),
  checkAllKeys: () => adminMutate("/admin/keys/check-all", "POST"),

  setProviderEnabled: (id: string, enabled: boolean) =>
    adminMutate(`/admin/providers/${id}/enabled`, "PATCH", { enabled }),
  removeProvider: (id: string) =>
    adminMutate(`/admin/providers/${id}`, "DELETE"),

  setModelEnabled: (provider_id: string, model_id: string, enabled: boolean) =>
    adminMutate("/admin/models/enabled", "PATCH", { provider_id, model_id, enabled }),

  getRoutingStrategy: () =>
    getJSON<{ strategy: string; weights: { r: number; s: number; i: number }; order: string[] }>(
      "/admin/routing-strategy",
      true,
    ),
  setRoutingStrategy: (data: {
    strategy: string;
    weights: { r: number; s: number; i: number };
    order: string[];
  }) => adminMutate("/admin/routing-strategy", "PUT", data),

  addCustomProvider: (
    base_url: string,
    models: string[],
    name: string,
    api_key: string,
  ) =>
    adminMutate("/admin/custom-providers", "POST", {
      base_url,
      models,
      name,
      api_key,
    }),
  toggleCustomProvider: (id: string, enabled: boolean) =>
    adminMutate(`/admin/custom-providers/${id}/enabled`, "PATCH", { enabled }),
  editCustomProvider: (
    id: string,
    data: { base_url?: string; models?: string[]; name?: string; api_key?: string },
  ) => adminMutate(`/admin/custom-providers/${id}`, "PATCH", data),
  checkCustomProvider: (id: string) =>
    adminMutate<{ status: string; latency_ms: number | null }>(
      `/admin/custom-providers/${id}/check`,
      "POST",
    ),
  removeCustomProvider: (id: string) =>
    adminMutate(`/admin/custom-providers/${id}`, "DELETE"),
};

async function adminMutate<T = unknown>(
  path: string,
  method: "POST" | "PATCH" | "DELETE" | "PUT",
  body?: unknown,
): Promise<T> {
  const res = await fetch(`/api${path}`, {
    method,
    headers: {
      ...adminHeaders(),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`${res.status}: ${text}`);
  }
  return (await res.json().catch(() => ({}))) as T;
}

/**
 * Base URL for the backend as reachable from the BROWSER.
 *
 * Streaming (SSE) chat must NOT go through the Next.js `/api` rewrite — the
 * dev proxy buffers the whole response and delivers it at once, killing live
 * token/thinking streaming. We therefore call the backend directly.
 *
 * In production set `NEXT_PUBLIC_BACKEND_URL` to the backend's PUBLIC URL
 * (e.g. https://nexusllm-backend.onrender.com) so the browser streams from it
 * directly. Locally it falls back to the dev backend on :8080.
 */
/** Deployed backend (Render). Used when no NEXT_PUBLIC_BACKEND_URL is set and
 *  the app is running on a non-localhost host. Override via env if you redeploy
 *  the backend under a different URL. */
const PROD_BACKEND_URL = "https://nexusllm-3x5q.onrender.com";

function browserBackendBase(): string {
  const env = process.env.NEXT_PUBLIC_BACKEND_URL;
  if (env && /^https?:\/\//.test(env)) return env.replace(/\/$/, "");
  if (typeof window !== "undefined") {
    const { protocol, hostname } = window.location;
    if (hostname === "localhost" || hostname === "127.0.0.1") {
      return `${protocol}//${hostname}:8080`;
    }
    // Deployed frontend → talk to the deployed backend directly (SSE streaming).
    return PROD_BACKEND_URL;
  }
  return "http://localhost:8080";
}

export const CHAT_ENDPOINT = `${browserBackendBase()}/v1/chat/completions`;
