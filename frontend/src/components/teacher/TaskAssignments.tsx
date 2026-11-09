import { useEffect, useRef, useState } from "react";
import { listGroups, GroupsApiError } from "../../api/groups";
import type { Group } from "../../api/groups";
import type { StudentIdentity } from "../../api/groupInvitations";
import { assignTaskToGroup, assignTaskToStudent, AssignmentsApiError, listTaskAssignments, searchAssignmentStudents } from "../../api/taskAssignments";
import type { TaskAssignment } from "../../api/taskAssignments";
import { useAuth } from "../../auth/AuthProvider";
import GroupDialog from "./GroupDialog";
import "../../styles/teacher-groups.css";

export default function TaskAssignments({ taskId, available, onClose }: { taskId: string; available: boolean; onClose?: () => void }) {
  const { retrySession } = useAuth();
  const [opened, setOpened] = useState(Boolean(onClose));
  const [groups, setGroups] = useState<Group[]>([]);
  const [students, setStudents] = useState<StudentIdentity[]>([]);
  const [assignments, setAssignments] = useState<TaskAssignment[]>([]);
  const [query, setQuery] = useState("");
  const [studentId, setStudentId] = useState("");
  const [groupId, setGroupId] = useState("");
  const [loading, setLoading] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [searchError, setSearchError] = useState("");
  const [success, setSuccess] = useState("");
  const [attempt, setAttempt] = useState(0);
  const mutation = useRef<AbortController | null>(null);
  function message(reason: unknown) {
    if ((reason instanceof AssignmentsApiError || reason instanceof GroupsApiError) && reason.status === 401) retrySession();
    return reason instanceof Error ? reason.message : "Sprawdź połączenie i spróbuj ponownie.";
  }
  useEffect(() => () => mutation.current?.abort(), [taskId]);
  useEffect(() => {
    if (!opened) return;
    const controller = new AbortController();
    setLoading(true); setError("");
    Promise.all([listGroups(controller.signal), listTaskAssignments(taskId, controller.signal)])
      .then(([groupList, rows]) => { if (!controller.signal.aborted) { setGroups(groupList); setAssignments(rows); } })
      .catch(reason => { if (!controller.signal.aborted) setError(message(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [opened, taskId, attempt, retrySession]);
  useEffect(() => {
    if (!opened || !available) return;
    const controller = new AbortController();
    setSearching(true); setSearchError(""); setStudentId(""); setStudents([]);
    const timer = window.setTimeout(() => {
      searchAssignmentStudents(query, controller.signal)
        .then(rows => { if (!controller.signal.aborted) setStudents(rows); })
        .catch(reason => { if (!controller.signal.aborted) setSearchError(message(reason)); })
        .finally(() => { if (!controller.signal.aborted) setSearching(false); });
    }, 300);
    return () => { window.clearTimeout(timer); controller.abort(); };
  }, [opened, available, query, attempt, retrySession]);
  async function assign(kind: "student" | "group") {
    if (mutation.current && !mutation.current.signal.aborted) return;
    const controller = new AbortController(); mutation.current = controller;
    setBusy(true); setError(""); setSuccess("");
    try {
      if (kind === "student") {
        await assignTaskToStudent(taskId, Number(studentId), controller.signal);
        if (!controller.signal.aborted) setSuccess("Zadanie zostało przypisane uczniowi.");
      } else {
        const result = await assignTaskToGroup(taskId, Number(groupId), controller.signal);
        if (!controller.signal.aborted) setSuccess(`Przypisano zadanie: ${result.assigned_count} uczniów. Już przypisane: ${result.already_assigned_count}.`);
      }
      const rows = await listTaskAssignments(taskId, controller.signal);
      if (!controller.signal.aborted) setAssignments(rows);
    } catch (reason) { if (!controller.signal.aborted) setError(message(reason)); }
    finally { if (!controller.signal.aborted) setBusy(false); controller.abort(); }
  }
  const selectedGroup = groups.find(group => group.id === Number(groupId));
  const content = <>
    <div className="group-form-heading"><h2 id="task-assignments-heading">{onClose ? "Przypisz zadanie" : "Przypisania zadania"}</h2>
      {onClose && <button type="button" className="group-close" aria-label="Zamknij przypisywanie" disabled={busy} onClick={onClose} />}</div>
    {!opened ? <button type="button" className="admin-button" onClick={() => setOpened(true)}>Pokaż przypisania</button> : <>
      {loading && <p role="status">Ładowanie przypisań…</p>}
      {error && <div role="alert"><p>{error}</p><button type="button" className="admin-button" onClick={() => setAttempt(value => value + 1)}>Odśwież przypisania</button></div>}
      {success && <p role="status">{success}</p>}
      {!available && <p>Przypisywać można zapisane, gotowe i niezarchiwizowane zadania.</p>}
      <fieldset className="group-form task-assignment-fields" disabled={!available || loading || busy}>
        <legend>Przypisz uczniowi</legend>
        <label>Szukaj ucznia w swoich grupach<input maxLength={50} value={query} onChange={event => setQuery(event.target.value)} /></label>
        {searching && <p role="status">Wyszukiwanie uczniów…</p>}
        {searchError && <p role="alert">{searchError}</p>}
        {!!students.length && <div className="task-assignment-table-scroll" tabIndex={0} role="region" aria-label="Lista uczniów do wyboru">
          <table className="task-assignment-table"><caption className="sr-only">Uczniowie z Twoich grup</caption>
            <thead><tr><th scope="col">Wybierz</th><th scope="col">Login ucznia</th></tr></thead>
            <tbody>{students.map(student => <tr key={student.id} className={studentId === String(student.id) ? "is-selected" : ""}>
              <td><input id={`assignment-student-${student.id}`} type="radio" name="assignment-student" value={student.id} checked={studentId === String(student.id)} onChange={() => setStudentId(String(student.id))} aria-label={`Wybierz ucznia: ${student.login}`} /></td>
              <td><label htmlFor={`assignment-student-${student.id}`}>{student.login}</label></td>
            </tr>)}</tbody>
          </table>
        </div>}
        {!searching && !searchError && !students.length && available && <p>Brak pasujących uczniów w Twoich grupach.</p>}
        <button type="button" className="admin-button" disabled={!studentId || searching} onClick={() => assign("student")}>Przypisz uczniowi</button>
        <h3>Przypisz grupie</h3>
        <label>Grupa<select value={groupId} onChange={event => setGroupId(event.target.value)}>
          <option value="">Wybierz grupę</option>{groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
        </select></label>
        {selectedGroup && <p>Liczba uczniów: {selectedGroup.student_count}. Osoby, które już mają zadanie, zostaną pominięte.</p>}
        <p>Przypisanie obejmie aktualnych członków grupy. Osoby dołączające później nie otrzymają go automatycznie.</p>
        <button type="button" className="admin-button" disabled={!groupId} onClick={() => assign("group")}>Przypisz grupie</button>
      </fieldset>
      {!loading && <><h3>Uczniowie z Twoimi przypisaniami <span className="muted">({assignments.length})</span></h3>{assignments.length ?
        <div className="task-assignment-table-scroll" tabIndex={0} role="region" aria-label="Lista przypisań uczniów">
          <table className="task-assignment-table"><caption className="sr-only">Uczniowie z przypisanym zadaniem</caption>
            <thead><tr><th scope="col">Uczeń</th><th scope="col">Źródło przypisania</th><th scope="col">Data</th></tr></thead>
            <tbody>{assignments.map(row => <tr key={row.id}><td className="task-assignment-login">{row.student_login}</td>
              <td>{row.group_name || "Bezpośrednio lub usunięta grupa"}</td>
              <td><time dateTime={row.created_at}>{new Date(row.created_at).toLocaleDateString("pl-PL")}</time></td>
            </tr>)}</tbody>
          </table>
        </div> : <p>Nie przypisano jeszcze zadania.</p>}</>}
    </>}
    {onClose && <div className="group-actions"><button type="button" className="admin-button" disabled={busy} onClick={onClose}>Zamknij</button></div>}
  </>;
  return onClose ? <GroupDialog className="group-assignment-dialog" labelledBy="task-assignments-heading" onCancel={() => { if (!busy) onClose(); }}>{content}</GroupDialog>
    : <section className="admin-card editor-card" aria-label="Przypisania zadania">{content}</section>;
}
