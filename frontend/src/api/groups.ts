import { apiFetch } from "./client";

export type Group = {
  id: number; name: string; description: string | null; teacher_id: number; created_at: string;
  age_range: string | null; achievements_enabled: boolean; study_streak_enabled: boolean;
  student_count: number;
  pending_invitation_count: number;
  active_task_count?: number;
};
export type GroupInput = Pick<Group, "name" | "description" | "age_range" | "achievements_enabled" | "study_streak_enabled">;

export class GroupsApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const groupErrors: Record<string, string> = {
  "Student not found": "Nie znaleziono aktywnego ucznia o tym loginie.",
  "Group not found": "Nie znaleziono grupy lub nie masz do niej dostępu.",
  "Student already belongs to this group": "Uczeń już należy do tej grupy.",
  "Student already has a pending invitation": "Uczeń ma już oczekujące zaproszenie do tej grupy.",
  "Invitation not found": "Nie znaleziono zaproszenia lub nie masz do niego dostępu.",
  "Invitation already answered": "To zaproszenie zostało już obsłużone. Odśwież listę.",
  "Invalid invitation code": "Nieprawidłowy kod zaproszenia.",
  "Invitation code expired": "Kod zaproszenia wygasł. Poproś nauczyciela o nowy kod.",
  "Group member not found": "Uczeń nie należy już do tej grupy.",
};

export async function groupRequest<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    throw new GroupsApiError(groupErrors[data?.detail] ?? (
    response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
      : response.status === 403 ? "Nie masz dostępu do tej operacji w grupie."
      : response.status === 404 ? "Nie znaleziono grupy lub nie masz do niej dostępu."
      : response.status === 422 ? "Sprawdź dane formularza. Czas ważności kodu musi wynosić od 1 godziny do 30 dni."
      : response.status === 429 ? "Zbyt wiele prób. Odczekaj chwilę i spróbuj ponownie."
      : "Nie udało się wykonać operacji. Spróbuj ponownie."), response.status);
  }
  return response.status === 204 ? undefined as T : response.json();
}

export const listGroups = (signal: AbortSignal) => groupRequest<Group[]>("/teacher/groups", { signal });
export const getGroup = (id: string, signal: AbortSignal) => groupRequest<Group>(`/teacher/groups/${id}`, { signal });
export const createGroup = (data: GroupInput) => groupRequest<Group>("/teacher/groups", { method: "POST", body: JSON.stringify(data) });
export const updateGroup = (id: number, data: GroupInput) => groupRequest<Group>(`/teacher/groups/${id}`, { method: "PATCH", body: JSON.stringify(data) });
export const deleteGroup = (id: number) => groupRequest<void>(`/teacher/groups/${id}`, { method: "DELETE" });
