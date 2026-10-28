import { apiFetch } from "./client";
import { TasksApiError } from "./tasks";
import type { Task } from "./tasks";

export type StudentTask = Pick<Task, "id" | "title" | "description" | "topic" | "difficulty" | "task_type" | "estimated_time_minutes">;
export type CatalogFilters = { search: string; topic: string; difficulty: string; task_type: string; sort_by: string; sort_order: string; offset: number };
export type StudentTaskList = { items: StudentTask[]; total: number; limit: number; offset: number };
export type StudentTaskDetail = StudentTask & Pick<Task, "theory" | "instructions" | "starter_code">;

export async function getStudentTask(id: string, signal: AbortSignal): Promise<StudentTaskDetail> {
  const response = await apiFetch(`/student/tasks/${encodeURIComponent(id)}`, { signal });
  if (!response.ok) throw new TasksApiError(
    response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
      : response.status === 403 ? "Zadanie jest dostępne tylko dla uczniów."
      : response.status === 404 ? "Nie znaleziono zadania lub jest ono niedostępne."
      : "Nie udało się pobrać zadania. Spróbuj ponownie.", response.status);
  return response.json();
}

export async function listStudentTasks(filters: CatalogFilters, signal: AbortSignal): Promise<StudentTaskList> {
  const params = new URLSearchParams({ limit: "24" });
  for (const [key, value] of Object.entries(filters)) if (value !== "") params.set(key, String(value));
  const response = await apiFetch(`/student/tasks?${params}`, { signal });
  if (!response.ok) throw new TasksApiError(response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
    : response.status === 403 ? "Katalog jest dostępny tylko dla uczniów."
    : "Nie udało się pobrać zadań. Spróbuj ponownie.", response.status);
  return response.json();
}

export type RunResult = { status: "completed" | "execution_error" | "time_limit_exceeded"; stdout: string | null; stderr: string | null; exit_code: number | null; time: number | null; memory: number | null };
export type SolutionTestResult = {
  number: number; position: number; test_type: "INPUT_OUTPUT" | "FUNCTION" | "STRUCTURAL";
  is_public: boolean; status: "passed" | "failed";
  details?: { name: string; config: Record<string, unknown>; actual_output?: string; actual_result?: unknown; has_actual_result?: boolean; execution?: RunResult; message?: string };
};
export type CheckResult = { passed: number; total: number; all_passed: boolean; results: SolutionTestResult[] };
export async function checkStudentSolution(id: number, source_code: string): Promise<CheckResult> {
  const response = await apiFetch(`/student/tasks/${id}/check`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_code }),
  });
  if (!response.ok) throw new TasksApiError(response.status === 503 ? "Usługa sprawdzania lub wybrana wersja Pythona jest niedostępna. Spróbuj ponownie później."
    : response.status === 504 ? "Przekroczono czas oczekiwania na sprawdzenie rozwiązania. Spróbuj ponownie."
    : response.status === 422 ? "Kod musi zawierać od 1 bajtu do 100 KB."
    : "Nie udało się sprawdzić rozwiązania. Spróbuj ponownie.", response.status);
  return response.json();
}
export async function runStudentCode(id: number, source_code: string, stdin: string): Promise<RunResult> {
  const response = await apiFetch(`/student/tasks/${id}/run`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ source_code, stdin }),
  });
  if (!response.ok) throw new TasksApiError(response.status === 503 ? "Usługa uruchamiania kodu lub wybrana wersja Pythona jest niedostępna. Spróbuj ponownie później."
    : response.status === 504 ? "Przekroczono czas oczekiwania na odpowiedź usługi uruchamiania kodu. Spróbuj ponownie."
    : response.status === 422 ? "Kod i dane wejściowe mogą mieć maksymalnie po 100 KB."
    : "Nie udało się uruchomić kodu. Spróbuj ponownie.", response.status);
  return response.json();
}
