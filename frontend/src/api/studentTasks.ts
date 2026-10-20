import { apiFetch } from "./client";
import { TasksApiError } from "./tasks";
import type { Task } from "./tasks";

export type StudentTask = Pick<Task, "id" | "title" | "description" | "topic" | "difficulty" | "task_type" | "estimated_time_minutes">;
export type CatalogFilters = { search: string; topic: string; difficulty: string; task_type: string; sort_by: string; sort_order: string; offset: number };
export type StudentTaskList = { items: StudentTask[]; total: number; limit: number; offset: number };

export async function listStudentTasks(filters: CatalogFilters, signal: AbortSignal): Promise<StudentTaskList> {
  const params = new URLSearchParams({ limit: "24" });
  for (const [key, value] of Object.entries(filters)) if (value !== "") params.set(key, String(value));
  const response = await apiFetch(`/student/tasks?${params}`, { signal });
  if (!response.ok) throw new TasksApiError(response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
    : response.status === 403 ? "Katalog jest dostępny tylko dla uczniów."
    : "Nie udało się pobrać zadań. Spróbuj ponownie.", response.status);
  return response.json();
}
