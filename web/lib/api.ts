const API = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

export function apiWebSocketUrl(path: string) {
  const url = new URL(API);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = `${url.pathname.replace(/\/$/, "")}${path.startsWith("/") ? path : `/${path}`}`;
  return url.toString();
}

export class ApiError extends Error {
  constructor(public code: string, message: string, public status: number, public details?: unknown) {
    super(message);
  }
}

function raw(path: string, init: RequestInit = {}) {
  return fetch(API + path, {
    ...init,
    credentials: "include", // httpOnly cookies carry the tokens
    headers: { "Content-Type": "application/json", ...(init.headers ?? {}) },
  });
}

let refreshRequest: Promise<Response> | null = null;

function refreshSession() {
  if (!refreshRequest) {
    refreshRequest = raw("/auth/refresh", { method: "POST" }).finally(() => {
      refreshRequest = null;
    });
  }
  return refreshRequest;
}

/** Calls the API and unwraps the { success, data, error } envelope. Retries once after a silent token refresh. */
export async function api<T>(path: string, init: RequestInit = {}): Promise<T> {
  let res = await raw(path, init);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const r = await refreshSession();
    if (r.ok) res = await raw(path, init);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok || !body?.success) {
    throw new ApiError(body?.error?.code ?? "ERROR", body?.error?.message ?? "Request failed. Please try again.", res.status, body?.error?.details);
  }
  return body.data as T;
}

export const post = <T>(path: string, data?: unknown) =>
  api<T>(path, { method: "POST", body: data === undefined ? undefined : JSON.stringify(data) });

export const patch = <T>(path: string, data: unknown) =>
  api<T>(path, { method: "PATCH", body: JSON.stringify(data) });

export async function downloadFile(path: string, fileName: string) {
  let res = await raw(path);
  if (res.status === 401 && !path.startsWith("/auth/")) {
    const refreshed = await refreshSession();
    if (refreshed.ok) res = await raw(path);
  }
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new ApiError(body?.error?.code ?? "ERROR", body?.error?.message ?? "Download failed.", res.status);
  }
  const url = URL.createObjectURL(await res.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export interface SessionUser {
  id: string; name: string; email: string; phone: string | null;
  roles: string[]; status: string; employeeId: string | null; mrn: string | null;
}
export const getMe = () => api<{ user: SessionUser }>("/auth/me").then((d) => d.user);
