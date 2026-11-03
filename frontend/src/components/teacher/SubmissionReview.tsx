import { useRef, useState } from "react";
import { pendingReview, saveReview } from "../../api/reviews";
import type { Review, ReviewStatus } from "../../api/reviews";
import { useTheme } from "../../theme/ThemeProvider";
import darkReturn from "../../assets/submissions/review-dark-return.svg";
import lightReturn from "../../assets/submissions/review-light-return.svg";
import darkAccept from "../../assets/submissions/review-dark-accept.svg";
import lightAccept from "../../assets/submissions/review-light-accept.svg";

export default function SubmissionReview({ submissionId, version, review = pendingReview, onSaved }: {
  submissionId: number; version: number; review?: Review; onSaved: (value: Review) => void;
}) {
  const { theme } = useTheme();
  const [feedback, setFeedback] = useState(review.feedback);
  const [savingDecision, setSavingDecision] = useState<Exclude<ReviewStatus, "PENDING"> | null>(null);
  const saving = savingDecision !== null;
  const lock = useRef(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  async function submit(decision: Exclude<ReviewStatus, "PENDING">) {
    if (lock.current) return;
    setError(""); setSuccess("");
    if (decision === "CHANGES_REQUESTED" && !feedback.trim()) { setError("Napisz, co uczeń powinien poprawić."); return; }
    lock.current = true; setSavingDecision(decision);
    try {
      const value = await saveReview(submissionId, decision, feedback);
      setFeedback(value.feedback); onSaved(value); setSuccess(`Zapisano weryfikację wersji ${version}.`);
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się zapisać weryfikacji."); }
    finally { lock.current = false; setSavingDecision(null); }
  }
  return <section className="admin-card submission-panel submission-feedback" aria-label="Informacja zwrotna nauczyciela">
    <header><h2>Informacja zwrotna nauczyciela</h2><p className="muted">Widoczna dla ucznia po zaakceptowaniu rozwiązania lub odesłaniu go do poprawy.</p></header>
    <form onSubmit={event => event.preventDefault()} className="submission-review-form" aria-busy={saving}>
      <label><span className="sr-only">Feedback dla ucznia</span><textarea maxLength={10000} rows={4} disabled={saving} value={feedback} onChange={e => { setFeedback(e.target.value); setSuccess(""); }} /></label>
      {error && <p role="alert" className="error-message">{error}</p>}
      <footer className="submission-feedback-footer">
        <p className="muted" role="status">{success || (saving ? "Zapisywanie…" : feedback !== review.feedback ? "Niezapisane zmiany" : review.reviewed_at ? `Zapisano ${new Date(review.reviewed_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}` : "")}</p>
        <div className="submission-review-actions">
          <button className="admin-button submission-return-button" disabled={saving} type="button" onClick={() => { void submit("CHANGES_REQUESTED"); }}><span className="submission-return-icon" aria-hidden="true" style={{ maskImage: `url("${theme === "dark" ? darkReturn : lightReturn}")` }} />{savingDecision === "CHANGES_REQUESTED" ? "Zapisywanie…" : `Odeślij rozwiązanie ${version} do poprawy`}</button>
          <button className="admin-button primary" disabled={saving} type="button" onClick={() => { void submit("ACCEPTED"); }}><img src={theme === "dark" ? darkAccept : lightAccept} alt="" />{savingDecision === "ACCEPTED" ? "Zapisywanie…" : `Zaakceptuj rozwiązanie ${version}`}</button>
        </div>
      </footer>
    </form>
  </section>;
}
