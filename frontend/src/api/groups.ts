import { apiFetch } from "./client";

export type Group = {
  id: number; name: string; description: string | null; teacher_id: number; created_at: string;
  age_range: string | null; achievements_enabled: boolean; study_streak_enabled: boolean;
  student_count: number;
};
export type GroupInput = Pick<Group, "name" | "description" | "age_range" | "achievements_enabled" | "study_streak_enabled">;

export class GroupsApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) throw new GroupsApiError(
    response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
      : response.status === 403 ? "Nie masz dostępu do grup nauczyciela."
      : response.status === 404 ? "Nie znaleziono grupy lub nie masz do niej dostępu."
      : response.status === 422 ? "Sprawdź nazwę i opis grupy."
      : "Nie udało się wykonać operacji. Spróbuj ponownie.", response.status);
  return response.status === 204 ? undefined as T : response.json();
}

export const listGroups = (signal: AbortSignal) => request<Group[]>("/teacher/groups", { signal });
export const getGroup = (id: string, signal: AbortSignal) => request<Group>(`/teacher/groups/${id}`, { signal });
export const createGroup = (data: GroupInput) => request<Group>("/teacher/groups", { method: "POST", body: JSON.stringify(data) });
export const updateGroup = (id: number, data: GroupInput) => request<Group>(`/teacher/groups/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteGroup = (id: number) => request<void>(`/teacher/groups/${id}`, { method: "DELETE" });
