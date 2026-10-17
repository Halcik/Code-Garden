import { apiFetch } from "./client";
import { TasksApiError } from "./tasks";
export type TestType = "INPUT_OUTPUT" | "FUNCTION" | "STRUCTURAL";
export type TestInput = { name: string; test_type: TestType; is_hidden: boolean; config: Record<string, unknown> };
export type TaskTest = TestInput & { id: number; task_id: number; position: number; created_at: string; updated_at: string };
export async function testRequest<T>(taskId: string, suffix = "", method = "GET", data?: unknown, signal?: AbortSignal): Promise<T> {
  const response = await apiFetch(`/teacher/tasks/${taskId}/tests${suffix}`, { method, signal, headers: { "Content-Type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
  if (!response.ok) throw new TasksApiError(response.status === 409 ? "Zadanie jest zarchiwizowane. Przywróć je przed edycją." : response.status === 422 ? "Sprawdź dane testu. Lista mogła się zmienić — odśwież ją i spróbuj ponownie." : "Nie udało się wykonać operacji na testach. Spróbuj ponownie.", response.status);
  return response.status === 204 ? undefined as T : response.json();
}
