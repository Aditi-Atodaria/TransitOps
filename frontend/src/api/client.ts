// Point this at your deployed Railway/Render URL once live.
// Keep it in an env var so nobody hardcodes localhost into a commit right before demo.
const API_BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:8000";

function getToken(): string | null {
  return localStorage.getItem("token");
}

export function setToken(token: string) {
  localStorage.setItem("token", token);
}

export function clearToken() {
  localStorage.removeItem("token");
}

interface RequestOptions {
  method?: string;
  body?: unknown;
}

export async function apiRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body } = options;
  const token = getToken();

  const headers: Record<string, string> = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;
  if (body) headers["Content-Type"] = "application/json";

  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!res.ok) {
    // Flask error responses look like { "error": "message" }
    const errorBody = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(errorBody.error || "Request failed");
  }

  // Some endpoints (e.g. /api/health) may return empty body — guard against that.
  const text = await res.text();
  return text ? JSON.parse(text) : (undefined as T);
}
