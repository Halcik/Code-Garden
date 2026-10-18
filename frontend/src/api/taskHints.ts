import { apiFetch } from "./client";
import { TasksApiError } from "./tasks";
export type HintInput = { title: string; content: string };
export type TaskHint = HintInput & { id: number; task_id: number; position: number; created_at: string; updated_at: string };
export async function hintRequest<T>(taskId: string, suffix = "", method = "GET", data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`/teacher/tasks/${taskId}/hints${suffix}`, { method, signal, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (!response.ok) throw new TasksApiError(response.status === 409 ? "Zadanie jest zarchiwizowane. Przywróć je przed edycją." : response.status === 422 ? "Sprawdź dane podpowiedzi. Lista mogła się zmienić — odśwież ją i spróbuj ponownie." : "Nie udało się wykonać operacji na podpowiedziach. Spróbuj ponownie.", response.status);
  return response.status === 204 ? undefined as T : response.json();
}
