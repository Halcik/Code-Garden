import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { cancelGroupInvitation, inviteStudent, listGroupInvitations, searchGroupStudents } from "../../api/groupInvitations";
import type { GroupInvitation, StudentIdentity } from "../../api/groupInvitations";
import { GroupsApiError } from "../../api/groups";
import { useAuth } from "../../auth/AuthProvider";
import GroupDialog from "./GroupDialog";

export default function GroupInvitationsDialog({ group, onClose, onChanged }: {
  group: { id: number; name: string }; onClose: () => void; onChanged: () => void;
}) {
  const { retrySession } = useAuth();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentIdentity[] | null>(null);
  const [selected, setSelected] = useState("");
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const searchController = useRef<AbortController | null>(null);
  function failed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Nie udało się obsłużyć zaproszenia.");
    if (reason instanceof GroupsApiError && [401, 403].includes(reason.status)) retrySession();
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listGroupInvitations(group.id, controller.signal).then(data => { if (!controller.signal.aborted) setInvitations(data); })
      .catch(reason => { if (!controller.signal.aborted) failed(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); searchController.current?.abort(); };
  }, [group.id, attempt]);
  async function search(event: FormEvent) {
    event.preventDefault();
    if (!query.trim() || searching) return;
    searchController.current?.abort();
    const controller = new AbortController(); searchController.current = controller;
    setSearching(true); setSelected(""); setResults(null); setError(""); setFeedback("");
    try { const data = await searchGroupStudents(group.id, query.trim(), controller.signal); if (!controller.signal.aborted) setResults(data); }
    catch (reason) { if (!controller.signal.aborted) failed(reason); }
    finally { if (!controller.signal.aborted) setSearching(false); }
  }
  async function send() {
    if (lock.current || !selected) return;
    lock.current = true; setSaving(true); setError(""); setFeedback("");
    try {
      const invitation = await inviteStudent(group.id, selected);
      setInvitations(previous => [invitation, ...previous]); setSelected("");
      setFeedback(`Zaproszenie do grupy zostało wysłane do ${invitation.student_login}.`); onChanged();
    } catch (reason) { failed(reason); }
    finally { lock.current = false; setSaving(false); }
  }
  async function cancel(id: number) {
    if (lock.current) return;
    lock.current = true; setSaving(true); setError(""); setFeedback("");
    try { await cancelGroupInvitation(group.id, id); setInvitations(previous => previous.filter(item => item.id !== id)); setFeedback("Zaproszenie zostało anulowane."); onChanged(); }
    catch (reason) { failed(reason); }
    finally { lock.current = false; setSaving(false); }
  }
  return <GroupDialog labelledBy="invite-group-heading" onCancel={() => { if (!lock.current) onClose(); }}>
    <div className="group-form-heading"><div><h2 id="invite-group-heading">Zaproś ucznia</h2><p className="muted">{group.name}</p></div>
      <button className="group-close" aria-label="Zamknij zaproszenia" disabled={saving} onClick={onClose} /></div>
    <form className="group-form" onSubmit={search}>
      <label>Login ucznia<input autoFocus maxLength={50} value={query} disabled={saving} onChange={event => {
        searchController.current?.abort(); setSearching(false); setQuery(event.target.value); setResults(null); setSelected("");
      }} /></label>
      <button className="admin-button" disabled={!query.trim() || searching || saving}>{searching ? "Wyszukiwanie…" : "Szukaj ucznia"}</button>
    </form>
    {results && <div className="group-invite-results" role="group" aria-label="Wyniki wyszukiwania uczniów">
      {!results.length && <p>Nie znaleziono ucznia o podanym loginie.</p>}
      {results.map(student => <label key={student.id}><input type="radio" name="invited-student" value={student.login} checked={selected === student.login} disabled={saving} onChange={() => setSelected(student.login)} />{student.login}</label>)}
      {!!results.length && <button className="admin-button primary" disabled={!selected || saving} onClick={send}>{saving ? "Wysyłanie…" : "Wyślij zaproszenie"}</button>}
    </div>}
    {error && <div role="alert"><p>{error}</p><button className="admin-text-button" disabled={saving} onClick={() => setAttempt(value => value + 1)}>Odśwież zaproszenia</button></div>}
    {feedback && <p role="status" className="task-save-success">{feedback}</p>}
    <section className="group-pending-invitations" aria-label="Oczekujące zaproszenia"><h3>Oczekujące zaproszenia</h3>
      {loading ? <p role="status">Ładowanie zaproszeń…</p> : !invitations.length ? <p className="muted">Brak oczekujących zaproszeń.</p> : invitations.map(item => <div key={item.id}><span>{item.student_login}</span>
        <button className="admin-text-button" disabled={saving} onClick={() => cancel(item.id)} aria-label={`Anuluj zaproszenie ${item.student_login}`}>Anuluj zaproszenie</button></div>)}
    </section>
    <div className="group-actions"><button className="admin-button" disabled={saving} onClick={onClose}>Zamknij</button></div>
  </GroupDialog>;
}
