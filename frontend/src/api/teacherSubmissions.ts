import { apiFetch } from "./client";
import type { Review, ReviewStatus } from "./reviews";

export type Version = { id: number; version: number; submitted_at: string; passed_tests: number;
  failed_tests: number; total_tests: number; all_passed: boolean; review?: Review };
export type SubmissionStudent = { id: number; login: string; status: string };
export type SubmissionList = { items: { student: SubmissionStudent; submission_count: number;
  latest_submission: Version }[]; total: number; limit: number; offset: number };
export type SubmissionHistory = { student: SubmissionStudent | null; items: Version[] };
export type TestSnapshot = { number: number; definition: { name?: string; test_type?: string;
  is_hidden?: boolean; config?: Record<string, unknown> }; result: { status?: string;
  details?: { actual_output?: string; actual_result?: unknown; has_actual_result?: boolean;
    message?: string; execution?: Record<string, unknown> } }; execution_details_available: boolean };
export type SubmissionDetail = Version & { task_id: number; total_hints?: number; student: SubmissionStudent; source_code: string;
  used_hints: { hint_id: number; reveal_order: number; revealed_at: string }[]; test_results: TestSnapshot[] };

async function read<T>(path: string, signal: AbortSignal): Promise<T> {
  const response = await apiFetch(`/teacher/${path}`, { signal });
  if (!response.ok) throw new Error(response.status === 404 ? "Nie znaleziono rozwiązania lub nie masz do niego dostępu."
    : response.status === 403 ? "Nie masz dostępu do rozwiązań nauczyciela."
    : response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
    : "Nie udało się pobrać rozwiązań. Spróbuj ponownie.");
  return response.json();
}
export const listSubmissions = (task: string, offset: number, signal: AbortSignal) =>
  read<SubmissionList>(`tasks/${task}/submissions?offset=${offset}`, signal);
export const submissionHistory = (task: string, student: string, signal: AbortSignal) =>
  read<SubmissionHistory>(`tasks/${task}/students/${student}/submissions`, signal);
export const submissionDetail = (id: number, signal: AbortSignal) => read<SubmissionDetail>(`submissions/${id}`, signal);

export type SubmissionQueue = Omit<SubmissionList, "items"> & { tasks: { id: number; title: string; topic: string }[];
  items: (SubmissionList["items"][number] & { task: { id: number; title: string; topic: string }; used_hint_count: number })[] };
export function submissionQueue(filters: { q: string; task: string; sort: string; offset: number; review_status?: ReviewStatus | "" }, signal: AbortSignal) {
  const params = new URLSearchParams({ q: filters.q, sort: filters.sort, offset: String(filters.offset) });
  if (filters.task) params.set("task_id", filters.task);
  if (filters.review_status) params.set("review_status", filters.review_status);
  return read<SubmissionQueue>(`submissions?${params}`, signal);
}
