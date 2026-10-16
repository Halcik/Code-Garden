import { apiFetch } from "./client";

export const DIFFICULTIES = { EASY: "Łatwy", MEDIUM: "Średni", HARD: "Trudny" } as const;
export const STATUSES = { DRAFT: "Wersja robocza", READY: "Gotowe" } as const;
export const TASK_TYPES = { STANDARD: "Standardowe", FUNCTION: "Funkcyjne", STRUCTURAL: "Strukturalne" } as const;
export type Task = {
  id: number; title: string; description: string; topic: string;
  difficulty: keyof typeof DIFFICULTIES; status: keyof typeof STATUSES;
  task_type: keyof typeof TASK_TYPES; estimated_time_minutes: number | null;
  author_id: number; created_at: string; updated_at: string;
};
export type TaskFilters = {
  q: string; topic: string; difficulty: string; status: string;
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
