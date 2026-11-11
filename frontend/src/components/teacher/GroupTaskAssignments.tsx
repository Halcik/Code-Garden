import DeadlinePicker from "./DeadlinePicker";
import { useEffect, useRef, useState } from "react";
import { DIFFICULTIES } from "../../api/tasks";
import { AssignmentsApiError, listGroupTaskAssignments, removeGroupTaskAssignment, updateGroupAssignmentDeadline } from "../../api/taskAssignments";
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
  const [editing, setEditing] = useState<GroupTaskAssignment | null>(null);
  const [deadline, setDeadline] = useState("");
  const [noDeadline, setNoDeadline] = useState(false);
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
  async function saveDeadline() {
    if (!editing || (!noDeadline && !deadline) || action.current && !action.current.signal.aborted) return;
    const controller = new AbortController(); action.current = controller;
    setPending(true); setError(""); setFeedback("");
    try {
      await updateGroupAssignmentDeadline(groupId, editing.task_id, noDeadline ? null : new Date(deadline).toISOString(), controller.signal);
      if (!controller.signal.aborted) {
        setEditing(null); setFeedback("Zapisano termin zadania dla grupy.");
        setAttempt(value => value + 1); onChanged?.();
      }
    } catch (reason) { if (!controller.signal.aborted) setError(message(reason)); }
    finally { if (!controller.signal.aborted) setPending(false); controller.abort(); }
  }
  return <section className="admin-card group-students" aria-label="Zadania przypisane grupie">
    <div className="group-students-heading"><div><h2>Przypisane zadania</h2><p className="muted">Zadania przypisane tej grupie</p></div>
      <button className="admin-button primary" onClick={onAssign} disabled={pending}>Dodaj zadanie</button></div>
    {feedback && <p className="task-save-success group-task-feedback" role="status">{feedback}</p>}
    {error && !removing && !editing && <div className="admin-state" role="alert"><p>{error}</p><button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button></div>}
    {loading ? <p className="admin-state" role="status">Ładowanie przypisanych zadań…</p> : !error && !items.length ? <p className="admin-state">Nie przypisano jeszcze zadań tej grupie.</p> : <div className="group-assigned-task-list">
      {items.map(item => <article className="group-assigned-task" key={item.task_id}>
        <span className="group-icon" aria-hidden="true" /><div className="group-assignment-task-copy"><h3>{item.title}</h3>
          <p>{item.topic} · {DIFFICULTIES[item.difficulty]}{item.is_archived ? " · Zarchiwizowane" : ""}</p>
          <p>Liczba przypisań: {item.student_count} · Przypisano {new Date(item.created_at).toLocaleDateString("pl-PL")}</p>
          {item.deadlines_differ ? <p>Różne terminy dla uczniów{item.deadline && <> · Najwcześniejszy: <time dateTime={item.deadline}>{new Date(item.deadline).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time></>}</p>
            : <p>Termin: {item.deadline ? <time dateTime={item.deadline}>{new Date(item.deadline).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time> : "Bez terminu"}</p>}</div>
        <button className="admin-text-button" disabled={pending} onClick={() => {
          setError(""); setEditing(item);
          const date = item.deadline && !item.deadlines_differ ? new Date(item.deadline) : null;
          setNoDeadline(!item.deadline && !item.deadlines_differ);
          setDeadline(date ? new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
        }} aria-label={`Edytuj termin: ${item.title}`}>Edytuj termin</button>
        <button className="admin-text-button" disabled={pending} onClick={() => { setError(""); setRemoving(item); }} aria-label={`Usuń przypisanie: ${item.title}`}>Usuń przypisanie</button>
      </article>)}
    </div>}
    {editing && <GroupDialog labelledBy="edit-group-deadline-heading" onCancel={() => { if (!pending) { setEditing(null); setError(""); } }}>
      <h2 id="edit-group-deadline-heading">Edytuj termin zadania dla grupy</h2>
      <p>{editing.title}</p>
      <p>Zmiana obejmie wszystkie przypisania z tej grupy, także byłych członków. Pozostałe źródła przypisania zachowają swoje terminy.</p>
      {editing.deadlines_differ && <p>Uczniowie mają różne terminy. Zapis zastąpi je jednym wybranym terminem.</p>}
      <label className="group-deadline-checkbox"><input type="checkbox" checked={noDeadline} disabled={pending} onChange={event => setNoDeadline(event.target.checked)} />Bez terminu (usuń termin)</label>
      <DeadlinePicker label="Termin wykonania" disabled={pending || noDeadline} value={deadline} onChange={setDeadline} />
      <p>{noDeadline ? "Zapis usunie termin z przypisań tej grupy." : "Wybierz datę i godzinę. Aby usunąć termin, zaznacz „Bez terminu”."}</p>
      {error && <p role="alert">{error}</p>}
      <div className="group-actions">
        <button className="admin-button" disabled={pending} onClick={() => { setEditing(null); setError(""); }}>Anuluj</button>
        <button className="admin-button primary" disabled={pending || (!noDeadline && !deadline)} onClick={saveDeadline}>{pending ? "Zapisywanie…" : "Zapisz termin"}</button>
      </div>
    </GroupDialog>}
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
