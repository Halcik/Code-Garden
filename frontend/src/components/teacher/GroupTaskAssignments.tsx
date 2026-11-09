import { useEffect, useRef, useState } from "react";
import { DIFFICULTIES } from "../../api/tasks";
import { AssignmentsApiError, listGroupTaskAssignments, removeGroupTaskAssignment } from "../../api/taskAssignments";
import type { GroupTaskAssignment } from "../../api/taskAssignments";
import { useAuth } from "../../auth/AuthProvider";
import GroupDialog from "./GroupDialog";

export default function GroupTaskAssignments({ groupId, revision, onAssign, onChanged }: { groupId: number; revision: number; onAssign: () => void; onChanged?: () => void }) {
  const { retrySession } = useAuth();
  const [items, setItems] = useState<GroupTaskAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState<GroupTaskAssignment | null>(null);
  const [pending, setPending] = useState(false);
  const action = useRef<AbortController | null>(null);
  function message(reason: unknown) {
    if (reason instanceof AssignmentsApiError && [401, 403].includes(reason.status)) retrySession();
    return reason instanceof Error ? reason.message : "Nie udało się pobrać przypisań.";
  }
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listGroupTaskAssignments(groupId, controller.signal)
      .then(rows => { if (!controller.signal.aborted) setItems(rows); })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [groupId, revision, attempt, retrySession]);
  async function remove() {
    if (!removing || action.current && !action.current.signal.aborted) return;
    const controller = new AbortController(); action.current = controller;
    setPending(true); setError(""); setFeedback("");
    try {
      await removeGroupTaskAssignment(groupId, removing.task_id, controller.signal);
      if (!controller.signal.aborted) {
        setItems(previous => previous.filter(item => item.task_id !== removing.task_id));
        setRemoving(null); setFeedback("Przypisanie zadania do grupy zostało usunięte.");
        setAttempt(value => value + 1);
        onChanged?.();
      }
    } catch (reason) { if (!controller.signal.aborted) setError(message(reason)); }
    finally { if (!controller.signal.aborted) setPending(false); controller.abort(); }
  }
  return <section className="admin-card group-students" aria-label="Zadania przypisane grupie">
    <div className="group-students-heading"><div><h2>Przypisane zadania</h2><p className="muted">Zadania przypisane tej grupie</p></div>
      <button className="admin-button primary" onClick={onAssign} disabled={pending}>Dodaj zadanie</button></div>
    {feedback && <p className="task-save-success group-task-feedback" role="status">{feedback}</p>}
    {error && !removing && <div className="admin-state" role="alert"><p>{error}</p><button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button></div>}
    {loading ? <p className="admin-state" role="status">Ładowanie przypisanych zadań…</p> : !error && !items.length ? <p className="admin-state">Nie przypisano jeszcze zadań tej grupie.</p> : <div className="group-assigned-task-list">
      {items.map(item => <article className="group-assigned-task" key={item.task_id}>
        <span className="group-icon" aria-hidden="true" /><div className="group-assignment-task-copy"><h3>{item.title}</h3>
          <p>{item.topic} · {DIFFICULTIES[item.difficulty]}{item.is_archived ? " · Zarchiwizowane" : ""}</p>
          <p>Liczba przypisań: {item.student_count} · Przypisano {new Date(item.created_at).toLocaleDateString("pl-PL")}</p></div>
        <button className="admin-text-button" disabled={pending} onClick={() => { setError(""); setRemoving(item); }} aria-label={`Usuń przypisanie: ${item.title}`}>Usuń przypisanie</button>
      </article>)}
    </div>}
    {removing && <GroupDialog labelledBy="remove-assignment-heading" onCancel={() => { if (!pending) { setRemoving(null); setError(""); } }}>
      <h2 id="remove-assignment-heading">Usuń przypisanie zadania</h2>
      <p>Cofnąć przypisanie zadania „{removing.title}” utworzone dla tej grupy?</p>
      <p>Dotyczy także uczniów, którzy opuścili grupę. Przypisania bezpośrednie i utworzone dla innych grup oraz zapisane rozwiązania pozostaną zachowane.</p>
      {error && <p role="alert">{error}</p>}
      <div className="group-actions"><button className="admin-button" disabled={pending} onClick={() => { setRemoving(null); setError(""); }}>Anuluj</button>
        <button className="admin-button primary" disabled={pending} onClick={remove}>{pending ? "Usuwanie…" : "Potwierdź usunięcie przypisania"}</button></div>
    </GroupDialog>}
  </section>;
}
