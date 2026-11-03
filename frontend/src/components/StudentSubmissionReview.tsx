import type { SubmissionSummary, SubmissionFeedback } from "../api/solutions";
import { REVIEW_LABELS } from "../api/reviews";
import messageIcon from "../assets/student/review-message.svg";

export default function StudentSubmissionReview({ latest, feedback }: {
  latest: SubmissionSummary | null; feedback: SubmissionFeedback | null;
}) {
  if (!latest || !feedback?.feedback) return null;
  return <section className="admin-card student-material-card student-teacher-comment" aria-label="Komentarz nauczyciela">
    <header className="student-comment-heading"><img src={messageIcon} alt="" /><h2>Komentarz nauczyciela</h2><span>Wersja {feedback.version}</span></header>
    <p className="student-task-text">{feedback.feedback}</p>
  </section>;
}

export function StudentSubmissionStatus({ latest }: { latest: SubmissionSummary | null }) {
  if (!latest) return null;
  const status = latest.review?.status ?? "PENDING";
  return <dl className="student-submission-status" aria-label="Weryfikacja nauczyciela" data-version={latest.version}>
    <div><dt>Status rozwiązania</dt><dd>Wysłano</dd></div>
    <div><dt>Ocena</dt><dd>{status === "PENDING" ? "Oczekuje na ocenę" : REVIEW_LABELS[status]}</dd></div>
  </dl>;
}
