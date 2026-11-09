import { useEffect, useRef, useState } from "react";
import type { Group } from "../../api/groups";
import { DIFFICULTIES, TASK_TYPES, listTasks, TasksApiError } from "../../api/tasks";
import type { TaskList } from "../../api/tasks";
import { assignTaskToGroup, AssignmentsApiError } from "../../api/taskAssignments";
import { useAuth } from "../../auth/AuthProvider";
import GroupDialog from "./GroupDialog";

export default function GroupAssignmentDialog({ group, onClose, onAssigned }: { group: Group; onClose: () => void; onAssigned: () => void }) {
  const { retrySession } = useAuth();
  const [search, setSearch] = useState("");
  const [filters, setFilters] = useState({ q: "", offset: 0 });
  const [page, setPage] = useState<TaskList | null>(null);
  const [selected, setSelected] = useState("");
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [attempt, setAttempt] = useState(0);
  const action = useRef<AbortController | null>(null);
  function message(reason: unknown) {
    if ((reason instanceof TasksApiError || reason instanceof AssignmentsApiError) && reason.status === 401) retrySession();
    return reason instanceof Error ? reason.message : "Nie udało się wykonać operacji. Spróbuj ponownie.";
  }
  useEffect(() => () => action.current?.abort(), []);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setSelected("");
    listTasks({ ...filters, archived: "false", topic: "", difficulty: "", status: "READY", sort_by: "title", sort_order: "asc" }, controller.signal)
      .then(result => { if (!controller.signal.aborted) setPage(result); })
      .catch(reason => { if (!controller.signal.aborted) { setPage(null); setError(message(reason)); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, attempt, retrySession]);
  async function assign() {
    if (!selected || action.current && !action.current.signal.aborted) return;
    const controller = new AbortController(); action.current = controller;
    setPending(true); setError(""); setSuccess("");
    try {
      const result = await assignTaskToGroup(selected, group.id, controller.signal);
      if (!controller.signal.aborted) {
        setSuccess(`Nowe przypisania: ${result.assigned_count}. Już przypisane: ${result.already_assigned_count}. Uczniów w grupie: ${result.total_students}.`);
        onAssigned();
      }
    } catch (reason) { if (!controller.signal.aborted) setError(message(reason)); }
    finally { if (!controller.signal.aborted) setPending(false); controller.abort(); }
  }
  return <GroupDialog className="group-assignment-dialog" labelledBy="group-assignment-heading" onCancel={() => { if (!pending) onClose(); }}>
    <div className="group-form-heading"><div><h2 id="group-assignment-heading">Przypisz zadanie grupie</h2><p>{group.name} · Liczba uczniów: {group.student_count}</p></div>
      <button type="button" className="group-close" aria-label="Zamknij przypisywanie" disabled={pending} onClick={onClose} /></div>
    <form className="group-form group-assignment-search group-filters" onSubmit={event => { event.preventDefault(); setFilters({ q: search.trim(), offset: 0 }); }}>
      <label className="admin-search"><span className="sr-only">Szukaj zadania</span><input type="search" autoFocus placeholder="Szukaj zadania po tytule…" maxLength={200} value={search} disabled={pending} onChange={event => setSearch(event.target.value)} /></label>
      <button className="admin-button" disabled={pending}>Szukaj</button>
    </form>
    <div className="group-assignment-list-heading"><h3>Wybierz zadanie</h3><span className="muted">Gotowe do przypisania{!loading && page ? ` · ${page.total}` : ""}</span></div>
    {loading ? <p className="admin-state" role="status">Ładowanie zadań…</p> : page && <>
      {page.items.length ? <fieldset className="group-assignment-options" disabled={pending}>
        <legend className="sr-only">Zadanie</legend>
        {page.items.map(task => <label className={`group-assignment-option ${selected === String(task.id) ? "is-selected" : ""}`} key={task.id}>
          <input type="radio" name="assignment-task" value={task.id} checked={selected === String(task.id)} onChange={() => { setSelected(String(task.id)); setSuccess(""); }} aria-label={task.title} />
          <span className="group-assignment-task-icon group-detail-icon assign" aria-hidden="true" />
          <span className="group-assignment-task-copy"><strong>{task.title}</strong><span>{task.topic}{task.topic && " · "}{TASK_TYPES[task.task_type]}</span></span>
          <span className="group-assignment-difficulty">{DIFFICULTIES[task.difficulty]}</span>
        </label>)}
      </fieldset> : <p className="admin-state">Brak gotowych zadań spełniających kryteria. Przygotuj zadanie lub zmień wyszukiwanie.</p>}
      <nav className="group-actions group-assignment-pagination" aria-label="Strony zadań do przypisania">
        <button type="button" className="admin-button" disabled={pending || !page.offset} onClick={() => setFilters(previous => ({ ...previous, offset: Math.max(0, page.offset - page.limit) }))}>Poprzednia</button>
        <span>Liczba zadań: {page.total}</span>
        <button type="button" className="admin-button" disabled={pending || page.offset + page.limit >= page.total} onClick={() => setFilters(previous => ({ ...previous, offset: page.offset + page.limit }))}>Następna</button>
      </nav>
    </>}
    <p className="group-form-note">Zadanie otrzymają aktualni członkowie grupy. Istniejące przypisania zostaną pominięte; osoby dołączające później nie otrzymają go automatycznie.</p>
    {error && <div role="alert"><p>{error}</p><button type="button" className="admin-text-button" disabled={pending} onClick={() => setAttempt(value => value + 1)}>Odśwież zadania</button></div>}
    {success && <p className="task-save-success" role="status">{success}</p>}
    <div className="group-actions group-assignment-footer"><button type="button" className="admin-button" disabled={pending} onClick={onClose}>Zamknij</button>
      <button type="button" className="admin-button primary" disabled={pending || loading || !selected} onClick={assign}>{pending ? "Przypisywanie…" : "Przypisz grupie"}</button></div>
  </GroupDialog>;
}
