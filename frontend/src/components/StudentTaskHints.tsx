import { useEffect, useRef, useState } from "react";
import { getHintSummary, getStudentHint } from "../api/studentHints";
import type { StudentHint } from "../api/studentHints";
import { TasksApiError } from "../api/tasks";
import { useAuth } from "../auth/AuthProvider";

export default function StudentTaskHints({ taskId }: { taskId: number }) {
  // A task change starts a new reveal session, including pending request cleanup.
  return <HintSession key={taskId} taskId={taskId} />;
}

function HintSession({ taskId }: { taskId: number }) {
  const { retrySession } = useAuth();
  const [total, setTotal] = useState<number | null>(null);
  const [hints, setHints] = useState<StudentHint[]>([]);
  const [loading, setLoading] = useState(true);
  const [revealing, setRevealing] = useState(false);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const revealRequest = useRef<AbortController | null>(null);
  const lock = useRef(false);

  function report(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Nie można pobrać podpowiedzi. Sprawdź połączenie i spróbuj ponownie.");
    if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
  }

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    getHintSummary(taskId, controller.signal).then(result => {
      if (!controller.signal.aborted) { setTotal(result.total); setHints(result.revealed ?? []); }
    }).catch(reason => { if (!controller.signal.aborted) report(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [taskId, attempt]);

  useEffect(() => () => { revealRequest.current?.abort(); }, []);

  async function reveal() {
    if (lock.current || loading || total === null || hints.length >= total) return;
    lock.current = true;
    const controller = new AbortController();
    revealRequest.current = controller;
    setRevealing(true); setError("");
    try {
      const hint = await getStudentHint(taskId, Array.from({ length: total }, (_, i) => i + 1).find(n => !hints.some(h => h.number === n))!, controller.signal);
      if (!controller.signal.aborted) setHints(previous => [...previous, hint]);
    } catch (reason) { if (!controller.signal.aborted) report(reason); }
    finally {
      if (!controller.signal.aborted) { lock.current = false; setRevealing(false); }
    }
  }

  return <section className="admin-card student-material-card" aria-label="Podpowiedzi" aria-busy={loading || revealing}>
    <div><h2>Podpowiedzi</h2>{total !== null && <p className="student-placeholder-copy" aria-live="polite">Wykorzystane podpowiedzi: {hints.length} z {total}</p>}</div>
    {loading && <p role="status" className="student-placeholder-copy">Ładowanie podpowiedzi…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {!loading && total === null && <button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button>}
    {!loading && total === 0 && <p className="student-placeholder-copy">Do tego zadania nie dodano podpowiedzi.</p>}
    {hints.map(hint => <article className="student-revealed-hint" key={hint.number}><div className="student-hint-heading"><h3>Podpowiedź {hint.number} · {hint.title}</h3><span>Wyświetlona</span></div><p>{hint.content}</p></article>)}
    {!loading && total !== null && total > 0 && <>
      {hints.length < total ? <button className="admin-button student-hint-button" disabled={revealing} onClick={reveal}><span className="student-detail-icon" data-icon="lightbulb" aria-hidden="true" />{revealing ? "Pobieranie podpowiedzi…" : error ? "Spróbuj ponownie" : hints.length ? "Pokaż kolejną podpowiedź" : "Pokaż podpowiedź"}</button>
        : <p className="student-placeholder-copy">Wszystkie podpowiedzi zostały wyświetlone.</p>}
    </>}
  </section>;
}
