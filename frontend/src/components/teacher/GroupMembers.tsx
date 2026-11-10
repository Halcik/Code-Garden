import { useEffect, useRef, useState } from "react";
import { listGroupMembers, removeGroupMember } from "../../api/groupInvitations";
import type { StudentIdentity } from "../../api/groupInvitations";
import type { Group } from "../../api/groups";
import { GroupsApiError } from "../../api/groups";
import { useAuth } from "../../auth/AuthProvider";
import GroupDialog from "./GroupDialog";

export default function GroupMembers({ group, onInvite, onChanged }: { group: Group; onInvite: () => void; onChanged: () => void }) {
  const { retrySession } = useAuth();
  const [members, setMembers] = useState<StudentIdentity[]>([]);
  const [search, setSearch] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [removing, setRemoving] = useState<StudentIdentity | null>(null);
  const [pending, setPending] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const lock = useRef(false);
  function failed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Nie udało się pobrać uczniów grupy.");
    if (reason instanceof GroupsApiError && [401, 403].includes(reason.status)) retrySession();
  }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError("");
    listGroupMembers(group.id, controller.signal).then(data => { if (!controller.signal.aborted) setMembers(data); })
      .catch(reason => { if (!controller.signal.aborted) failed(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [group.id, group.student_count, attempt]);
  useEffect(() => { if (showSearch) input.current?.focus(); }, [showSearch]);
  async function remove() {
    if (!removing || lock.current) return;
    lock.current = true; setPending(true); setError("");
    try { await removeGroupMember(group.id, removing.id); setMembers(previous => previous.filter(item => item.id !== removing.id)); setRemoving(null); onChanged(); }
    catch (reason) { failed(reason); }
    finally { lock.current = false; setPending(false); }
  }
  const filtered = members.filter(member => member.login.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()));
  return <section className="admin-card group-students" aria-labelledby="group-students-heading">
    <div className="group-students-heading"><div><h2 id="group-students-heading">Uczniowie</h2><p className="muted">Liczba uczniów: {group.student_count} · Oczekujące zaproszenia: {group.pending_invitation_count}</p></div>
      <div className="group-detail-actions"><button className="admin-button group-detail-secondary" onClick={() => setShowSearch(value => !value)}><span className="group-detail-icon search" aria-hidden="true" />Szukaj uczniów</button>
        <button className="admin-button group-detail-secondary" onClick={onInvite}><span className="group-detail-icon invite" aria-hidden="true" />Zaproś</button></div>
    </div>
    {showSearch && <div className="admin-filters"><label>Szukaj członka grupy<input ref={input} type="search" value={search} onChange={event => setSearch(event.target.value)} /></label></div>}
    {error && !removing && <div className="admin-state" role="alert"><p>{error}</p><button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button></div>}
    <div className="users-table-scroll"><table className="users-table group-students-table" aria-label="Uczniowie grupy">
      <thead><tr>{["Uczeń", "Ukończone", "Najnowsze zadanie", "Status", "Ostatnia aktywność", "Akcje"].map(column => <th key={column} scope="col">{column}</th>)}</tr></thead>
      <tbody>{loading ? <tr><td colSpan={6} className="group-students-empty" role="status">Ładowanie uczniów…</td></tr>
        : !filtered.length ? <tr><td colSpan={6} className="group-students-empty">{search ? "Brak pasujących uczniów." : error ? "Lista uczniów jest niedostępna." : "Grupa nie ma jeszcze członków."}</td></tr>
        : filtered.map(member => <tr key={member.id}><td><span className="group-member-login">{member.login}</span></td><td>—</td><td>—</td><td>—</td><td>—</td><td><button className="admin-text-button" onClick={() => { setError(""); setRemoving(member); }} aria-label={`Usuń ucznia ${member.login}`}>Usuń</button></td></tr>)}</tbody>
    </table></div>
    {removing && <GroupDialog labelledBy="remove-member-heading" onCancel={() => { if (!lock.current) setRemoving(null); }}>
      <h2 id="remove-member-heading">Usuń ucznia z grupy</h2><p>Czy usunąć ucznia {removing.login} z grupy? Konto ucznia pozostanie bez zmian.</p>
      {error && <p role="alert">{error}</p>}
      <div className="group-actions"><button className="admin-button" autoFocus disabled={pending} onClick={() => setRemoving(null)}>Anuluj</button>
        <button className="admin-button submission-return-button" disabled={pending} onClick={remove}>{pending ? "Usuwanie…" : "Usuń ucznia"}</button></div>
    </GroupDialog>}
  </section>;
}
