import { apiFetch } from "./client";
import type { Task } from "./tasks";
import type { TaskTest } from "./taskTests";
import type { TaskHint } from "./taskHints";

export type PublicationTask = Task & { author_login: string; publication_round: number; publication_submitted_at: string | null };
export type PublicationHistory = { id: number; reviewer_login: string; reviewer_id: number; stage: "TEACHER" | "ADMIN";
  publication_round: number; decision: "ACCEPTED" | "CHANGES_REQUESTED"; comment: string; created_at: string };
export type PublicationDetail = { task: PublicationTask; author_login: string; tests: TaskTest[]; hints: TaskHint[]; history: PublicationHistory[] };
export class PublicationError extends Error {
  constructor(message: string, public status: number) { super(message); }
}
async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await apiFetch(path, { ...options, headers: { "Content-Type": "application/json" } });
  if (!response.ok) throw new PublicationError(response.status === 409 ? "Stan zadania się zmienił. Odśwież widok i spróbuj ponownie."
    : response.status === 422 ? "Dodaj komentarz przy zwrocie do poprawy i sprawdź dane."
    : response.status === 404 ? "Zadanie nie jest już dostępne w tej kolejce."
    : response.status === 403 ? "Nie masz uprawnień do tej operacji."
    : "Nie udało się wykonać operacji. Spróbuj ponownie.", response.status);
  return response.json();
}
export const submitPublication = (id: number) => request<Task>(`/teacher/tasks/${id}/publication`, { method: "POST" });
export const withdrawPublication = (id: number) => request<Task>(`/teacher/tasks/${id}/withdraw-publication`, { method: "POST" });
export const publicationDetail = (id: string, signal: AbortSignal) => request<PublicationDetail>(`/publication/tasks/${id}`, { signal });
export const publicationQueue = (admin: boolean, params: URLSearchParams, signal: AbortSignal) =>
  request<{ items: PublicationTask[]; total: number; limit: number; offset: number; metrics: Record<string, number> }>(`/${admin ? "admin" : "teacher"}/publication-reviews?${params}`, { signal });
export const decidePublication = (admin: boolean, id: number, round: number, decision: "ACCEPTED" | "CHANGES_REQUESTED", comment: string) =>
  request<Task>(`/${admin ? "admin" : "teacher"}/publication-reviews/${id}`, { method: "POST", body: JSON.stringify({ publication_round: round, decision, comment }) });
