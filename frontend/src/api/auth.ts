import { apiRequest, setToken } from "./client";

// Matches User.to_dict() in the Flask backend exactly.
export interface CurrentUser {
  id: number;
  email: string;
  name: string;
  role: "fleet_manager" | "driver" | "safety_officer" | "financial_analyst";
}

interface AuthResponse {
  token: string;
  user: CurrentUser;
}

export async function login(
  email: string,
  password: string,
): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: { email, password },
  });
  setToken(data.token);
  return data;
}

export async function signup(
  name: string,
  email: string,
  password: string,
  role: string,
): Promise<AuthResponse> {
  const data = await apiRequest<AuthResponse>("/api/auth/register", {
    method: "POST",
    body: { name, email, password, role },
  });
  setToken(data.token);
  return data;
}

export async function fetchCurrentUser(): Promise<CurrentUser> {
  return apiRequest<CurrentUser>("/api/auth/me");
}
