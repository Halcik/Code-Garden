import type { User } from "../api/auth";

export function accountAccessMessage(user: User): string | null {
  if (user.status === "INACTIVE") return "Twoje konto jest nieaktywne. Skontaktuj się z administratorem.";
  if (user.role === "TEACHER" && user.teacher_approval === "PENDING") {
    return "Twoje konto nauczyciela oczekuje na akceptację administratora.";
  }
  if (user.role === "TEACHER" && user.teacher_approval !== "APPROVED") {
    return "Twoje zgłoszenie nauczyciela zostało odrzucone. Skontaktuj się z administratorem.";
  }
  return null;
}
