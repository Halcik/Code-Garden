import { apiFetch } from "./client";
import { TasksApiError } from "./tasks";

export type StudentHint = { number: number; title: string; content: string };

async function requestHint<T>(taskId: number, suffix: string, signal: AbortSignal): Promise<T> {
  const response = await apiFetch(`/student/tasks/${taskId}/hints${suffix}`, { signal });
  if (!response.ok) throw new TasksApiError(
    response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
      : response.status === 403 ? "Podpowiedzi są dostępne tylko dla uczniów."
      : response.status === 404 ? "Zadanie lub podpowiedź są już niedostępne."
      : "Nie udało się pobrać podpowiedzi. Spróbuj ponownie.", response.status);
  return response.json();
}

export const getHintSummary = (taskId: number, signal: AbortSignal) => requestHint<{ total: number }>(taskId, "", signal);
export const getStudentHint = (taskId: number, number: number, signal: AbortSignal) => requestHint<StudentHint>(taskId, `/${number}`, signal);
