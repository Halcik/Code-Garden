import { apiFetch } from "./client";

export const DIFFICULTIES = { EASY: "Łatwy", MEDIUM: "Średni", HARD: "Trudny" } as const;
export const STATUSES = { DRAFT: "Wersja robocza", READY: "Gotowe" } as const;
export const TASK_TYPES = { STANDARD: "Standardowe", FUNCTION: "Funkcyjne", STRUCTURAL: "Strukturalne" } as const;
export type Task = {
  id: number; title: string; description: string; topic: string;
  difficulty: keyof typeof DIFFICULTIES; status: keyof typeof STATUSES;
  task_type: keyof typeof TASK_TYPES; estimated_time_minutes: number | null;
  is_archived: boolean; author_id: number; created_at: string; updated_at: string;
};
export type TaskFilters = {
  archived?: string; q: string; topic: string; difficulty: string; status: string;
  sort_by: string; sort_order: string; offset: number;
};
export type TaskList = { items: Task[]; total: number; limit: number; offset: number };

export class TasksApiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

export async function listTasks(filters: TaskFilters, signal: AbortSignal, limit = 25): Promise<TaskList> {
  const params = new URLSearchParams({ limit: String(limit) });
  for (const [key, value] of Object.entries(filters)) {
    if (value !== "") params.set(key, String(value));
  }
  const response = await apiFetch(`/teacher/tasks?${params}`, { signal });
  if (!response.ok) {
    throw new TasksApiError(response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
      : response.status === 403 ? "Nie masz dostępu do zadań nauczyciela."
      : "Nie udało się pobrać zadań. Spróbuj ponownie.", response.status);
  }
  return response.json();
}


export type TaskInput = Pick<Task, "title" | "topic" | "description" | "difficulty" | "task_type" | "status" | "estimated_time_minutes">;

async function taskRequest(path: string, options?: RequestInit): Promise<Task> {
  const response = await apiFetch(path, { ...options, headers: { "Content-Type": "application/json", ...options?.headers } });
  if (!response.ok) throw new TasksApiError(
    response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
      : response.status === 403 ? "Nie masz dostępu do zadań nauczyciela."
      : response.status === 404 ? "Nie znaleziono zadania lub nie masz do niego dostępu."
      : response.status === 409 ? "Zadanie jest zarchiwizowane. Przywróć je przed edycją."
      : response.status === 422 ? "Sprawdź dane formularza i spróbuj ponownie."
      : "Nie udało się wykonać operacji. Spróbuj ponownie.", response.status);
  return response.json();
}
export const getTask = (id: string, signal: AbortSignal) => taskRequest(`/teacher/tasks/${id}`, { signal });
export const createTask = (data: TaskInput) => taskRequest("/teacher/tasks", { method: "POST", body: JSON.stringify(data) });
export const updateTask = (id: string, data: Partial<TaskInput>) => taskRequest(`/teacher/tasks/${id}`, { method: "PATCH", body: JSON.stringify(data) });

export const archiveTask = (id: number) => taskRequest(`/teacher/tasks/${id}/archive`, { method: "PATCH" });
export const restoreTask = (id: number | string) => taskRequest(`/teacher/tasks/${id}/restore`, { method: "PATCH" });
