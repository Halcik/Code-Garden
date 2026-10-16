import { apiFetch } from "./client";
import { parseUser } from "./auth";
import type { AccountStatus, TeacherApproval, User, UserRole } from "./auth";

export type UserFilters = {
  q?: string;
  role?: UserRole;
  status?: AccountStatus;
  teacher_approval?: TeacherApproval;
  offset: number;
};
export type UserList = { items: User[]; total: number; limit: number; offset: number };
export type UserAction = "activate" | "deactivate" | "approve-teacher" | "reject-teacher" | "revoke-teacher";

export class AdminApiError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AdminApiError";
  }
}

async function adminRequest(path = "", options: RequestInit = {}): Promise<unknown> {
  let response: Response;
  try {
    response = await apiFetch(`/admin/users${path}`, options);
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") throw error;
    throw new AdminApiError("Nie można połączyć się z serwerem. Spróbuj ponownie.", 0);
  }
  const data: unknown = await response.json().catch(() => null);
  if (response.ok) return data;
  const detail = data && typeof data === "object" && "detail" in data ? data.detail : null;
  const messages: Record<number, string> = {
    401: "Sesja wygasła. Zaloguj się ponownie.",
    403: "Nie masz uprawnień do tej operacji.",
    404: "Nie znaleziono użytkownika.",
    409: "Ten login lub adres e-mail jest już zajęty.",
    422: "Sprawdź dane: login 3–50 znaków (litery, cyfry, _, . lub -) i poprawny e-mail. Nauczyciel wymaga e-maila.",
  };
  const message = detail === "Cannot deactivate your own account"
    ? "Nie możesz dezaktywować własnego konta."
    : detail === "User is not a teacher"
      ? "Ta operacja jest dostępna tylko dla nauczyciela."
      : messages[response.status] || "Nie udało się wykonać operacji. Spróbuj ponownie.";
  throw new AdminApiError(message, response.status);
}

export async function listUsers(filters: UserFilters, signal?: AbortSignal): Promise<UserList> {
  const params = new URLSearchParams({ limit: "25", offset: String(filters.offset) });
  if (filters.q) params.set("q", filters.q);
  if (filters.role) params.set("role", filters.role);
  if (filters.status) params.set("status", filters.status);
  if (filters.teacher_approval) params.set("teacher_approval", filters.teacher_approval);
  const data = await adminRequest(`?${params}`, { signal });
  if (!data || typeof data !== "object" || !("items" in data) || !Array.isArray(data.items) ||
      !("total" in data) || typeof data.total !== "number" ||
      !("limit" in data) || typeof data.limit !== "number" ||
      !("offset" in data) || typeof data.offset !== "number") {
    throw new AdminApiError("Nie udało się odczytać listy użytkowników.", 0);
  }
  return { items: data.items.map(parseUser), total: data.total, limit: data.limit, offset: data.offset };
}

export async function getUser(id: number, signal?: AbortSignal): Promise<User> {
  return parseUser(await adminRequest(`/${id}`, { signal }));
}

export async function updateUser(id: number, data: { login: string; email: string | null }): Promise<User> {
  return parseUser(await adminRequest(`/${id}`, {
    method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  }));
}

export async function changeUserStatus(id: number, action: UserAction): Promise<User> {
  return parseUser(await adminRequest(`/${id}/${action}`, { method: "POST" }));
}

export function adminErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Nie udało się wykonać operacji.";
}
