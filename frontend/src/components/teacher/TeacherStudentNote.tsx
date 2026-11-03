import { useEffect, useRef, useState } from "react";
import { getTeacherNote, saveTeacherNote } from "../../api/reviews";

export default function TeacherStudentNote({ studentId }: { studentId: number }) {
  const [content, setContent] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [retry, setRetry] = useState(0);
  const [loadFailed, setLoadFailed] = useState(false);
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setLoadFailed(false);
    getTeacherNote(studentId, controller.signal).then(note => { if (!controller.signal.aborted) setContent(note.content); })
      .catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setLoadFailed(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [studentId, retry]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (lock.current || loading || loadFailed) return;
    lock.current = true; setSaving(true); setError(""); setSuccess("");
    try { const note = await saveTeacherNote(studentId, content); setContent(note.content); setSuccess("Notatka zapisana."); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się zapisać notatki."); }
    finally { lock.current = false; setSaving(false); }
  }
  return <section className="admin-card submission-panel" aria-label="Prywatna notatka o uczniu">
    <h2>Prywatna notatka o uczniu</h2><p className="muted">Widoczna tylko dla Ciebie. Dotyczy ucznia we wszystkich zadaniach.</p>
    {loading && <p role="status">Ładowanie notatki…</p>}
    <form className="submission-review-form" onSubmit={submit} aria-busy={saving || loading}>
      <label>Twoja notatka<textarea rows={5} maxLength={10000} disabled={loading || saving || loadFailed} value={content} onChange={e => { setContent(e.target.value); setSuccess(""); }} /></label>
      {error && <p role="alert" className="error-message">{error}</p>}{success && <p role="status">{success}</p>}
      {loadFailed ? <button className="admin-button" type="button" onClick={() => setRetry(n => n + 1)}>Wczytaj notatkę ponownie</button>
        : <button className="admin-button" type="submit" disabled={loading || saving}>{saving ? "Zapisywanie…" : "Zapisz notatkę"}</button>}
    </form>
  </section>;
}
