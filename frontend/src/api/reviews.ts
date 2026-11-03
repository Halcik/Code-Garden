import { apiFetch } from "./client";

export type ReviewStatus = "PENDING" | "ACCEPTED" | "CHANGES_REQUESTED";
export type Review = { status: ReviewStatus; feedback: string; reviewed_at: string | null };
export const REVIEW_LABELS: Record<ReviewStatus, string> = {
  PENDING: "Oczekuje na sprawdzenie", ACCEPTED: "Zaakceptowane", CHANGES_REQUESTED: "Wymaga poprawy",
};
export const pendingReview: Review = { status: "PENDING", feedback: "", reviewed_at: null };
export type TeacherNote = { student_id: number; content: string; updated_at: string | null };

async function request<T>(path: string, options: RequestInit): Promise<T> {
  const response = await apiFetch(`/teacher/${path}`, options);
  if (!response.ok) throw new Error(response.status === 404 ? "Nie znaleziono danych lub nie masz do nich dostępu."
    : response.status === 403 ? "Nie masz uprawnień do tej operacji."
    : response.status === 401 ? "Sesja wygasła. Zaloguj się ponownie."
    : response.status === 422 ? "Sprawdź treść. Odesłanie do poprawy wymaga feedbacku (maksymalnie 10 000 znaków)."
    : "Nie udało się zapisać lub pobrać danych. Spróbuj ponownie.");
  return response.json();
}
export const saveReview = (id: number, decision: Exclude<ReviewStatus, "PENDING">, feedback: string) =>
  request<Review>(`submissions/${id}/review`, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ decision, feedback }) });
export const getTeacherNote = (student: number, signal: AbortSignal) => request<TeacherNote>(`students/${student}/note`, { signal });
export const saveTeacherNote = (student: number, content: string) => request<TeacherNote>(`students/${student}/note`, {
  method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ content }),
});
