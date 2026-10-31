import { apiFetch } from "./client";
import { TasksApiError } from "./tasks";
import type { CheckResult } from "./studentTasks";

export type SubmissionSummary = { id: number; version: number; submitted_at: string; passed_tests: number; failed_tests: number; total_tests: number; all_passed: boolean };
export type SolutionDraft = { source_code: string; revision: number; checked_hash: string | null; checked_at: string | null; check_is_current: boolean; last_check: CheckResult | null; latest_submission: SubmissionSummary | null };
async function request<T>(id: number, suffix: string, method = "GET", body?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`/student/tasks/${id}/${suffix}`, { method, signal,
    ...(body === undefined ? {} : { headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }) });
  if (!response.ok) throw new TasksApiError(response.status === 409
    ? "Wersja robocza zmieniła się w innej karcie. Odśwież stronę po skopiowaniu swojego kodu."
    : response.status === 422 ? "Kod może mieć maksymalnie 100 KB. Wysłanie wymaga niepustego kodu."
    : suffix === "submissions" && [502, 503, 504].includes(response.status)
      ? "Nie udało się technicznie wykonać testów. Rozwiązanie nie zostało wysłane. Spróbuj ponownie."
      : "Nie udało się zapisać lub wysłać rozwiązania. Spróbuj ponownie.", response.status);
  return response.json();
}
export const getSolutionDraft = (id: number, signal?: AbortSignal) => request<SolutionDraft>(id, "draft", "GET", undefined, signal);
export const saveSolutionDraft = (id: number, source_code: string, revision: number) => request<SolutionDraft>(id, "draft", "PUT", { source_code, revision });
export const submitSolution = (id: number, revision: number) => request<{ submission: SubmissionSummary; draft: SolutionDraft }>(id, "submissions", "POST", { revision });
