import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createGroup, deleteGroup, getGroup, GroupsApiError, listGroups, updateGroup } from "../api/groups";
import type { Group, GroupInput } from "../api/groups";
import { useAuth } from "../auth/AuthProvider";
import plusIcon from "../assets/teacher/plus.svg";
import GroupDetails from "../components/teacher/GroupDetails";
import GroupDialog from "../components/teacher/GroupDialog";
import GroupInvitationsDialog from "../components/teacher/GroupInvitationsDialog";
import GroupAssignmentDialog from "../components/teacher/GroupAssignmentDialog";
import "../styles/teacher-groups.css";

function GroupForm({ group, onSave, onCancel, onError }: {
  group?: Group; onSave: (group: Group) => void; onCancel: () => void; onError: (reason: unknown) => void;
}) {
  const [name, setName] = useState(group?.name ?? "");
  const [description, setDescription] = useState(group?.description ?? "");
  const [ageRange, setAgeRange] = useState(group?.age_range ?? "");
  const [achievements, setAchievements] = useState(group?.achievements_enabled ?? true);
  const [studyStreak, setStudyStreak] = useState(group?.study_streak_enabled ?? false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const lock = useRef(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !name.trim()) return;
    lock.current = true; setPending(true); setError("");
    const data: GroupInput = {
      name: name.trim(), description: description.trim() || null, age_range: ageRange.trim() || null,
      achievements_enabled: achievements, study_streak_enabled: studyStreak,
    };
    try { onSave(await (group ? updateGroup(group.id, data) : createGroup(data))); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się zapisać grupy."); onError(reason); }
    finally { lock.current = false; setPending(false); }
  }
  return <GroupDialog labelledBy="group-form-heading" onCancel={() => { if (!lock.current) onCancel(); }}>
    <div className="group-form-heading"><div>
      <h2 id="group-form-heading">{group ? "Edytuj grupę" : "Utwórz grupę"}</h2>
      <p className="muted">Uzupełnij dane grupy i wybierz domyślne ustawienia.</p>
    </div><button type="button" className="group-close" aria-label="Zamknij formularz" disabled={pending} onClick={onCancel} /></div>
    <form className="group-form" onSubmit={submit}>
      <label>Nazwa grupy<input autoFocus required maxLength={200} value={name} disabled={pending}
        onChange={event => setName(event.target.value)} /></label>
      <label>Przedział wieku<input maxLength={50} placeholder="np. 14–18 lat" value={ageRange} disabled={pending}
        onChange={event => setAgeRange(event.target.value)} /></label>
      <label>Opis (opcjonalny)<textarea rows={5} value={description} disabled={pending}
        onChange={event => setDescription(event.target.value)} /></label>
      <fieldset className="group-defaults"><legend>Domyślne ustawienia motywacyjne</legend>
        <div className="group-default-options">
          <button type="button" aria-pressed={achievements} disabled={pending} onClick={() => setAchievements(value => !value)}>{achievements ? "Osiągnięcia włączone" : "Osiągnięcia wyłączone"}</button>
          <button type="button" aria-pressed={studyStreak} disabled={pending} onClick={() => setStudyStreak(value => !value)}>Seria nauki</button>
        </div>
      </fieldset>
      <p className="group-form-note">Ustawienia motywacyjne zostaną zapisane dla grupy. Funkcje osiągnięć i serii nauki będą dostępne w kolejnych etapach.</p>
      {error && <p role="alert">{error}</p>}
      <div className="group-actions"><button type="button" className="admin-button" disabled={pending} onClick={onCancel}>Anuluj</button>
        <button className="admin-button primary" disabled={pending || !name.trim()}>{pending ? "Zapisywanie…" : group ? "Zapisz zmiany" : "Utwórz grupę"}</button></div>
    </form>
  </GroupDialog>;
}

export default function TeacherGroupsPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { retrySession } = useAuth();
  const [groups, setGroups] = useState<Group[]>([]);
  const [search, setSearch] = useState("");
  const [group, setGroup] = useState<Group | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [editing, setEditing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [inviteGroup, setInviteGroup] = useState<Group | null>(null);
  const [assignmentGroup, setAssignmentGroup] = useState<Group | null>(null);
  const [assignmentRevision, setAssignmentRevision] = useState(0);
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState("");
  const actionLock = useRef(false);
  function authError(reason: unknown) {
    if (reason instanceof GroupsApiError && [401, 403].includes(reason.status)) retrySession();
  }
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setGroup(null); setGroups([]); setEditing(false); setConfirmDelete(false); setInviteGroup(null);
    setAssignmentGroup(null);
    setAssignmentRevision(0);
    const load = async () => {
      try {
        if (groupId) {
          const result = await getGroup(groupId, controller.signal);
          if (!controller.signal.aborted) setGroup(result);
        } else {
          const result = await listGroups(controller.signal);
          if (!controller.signal.aborted) setGroups(result);
        }
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError(reason instanceof Error ? reason.message : "Nie udało się pobrać grup.");
          if (reason instanceof GroupsApiError && [401, 403].includes(reason.status)) retrySession();
        }
      } finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load();
    return () => controller.abort();
  }, [groupId, revision, retrySession]);

  async function remove() {
    if (!group || actionLock.current) return;
    actionLock.current = true; setPending(true); setError("");
    try {
      await deleteGroup(group.id);
      setFeedback("Grupa została usunięta.");
      navigate("/teacher/groups");
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Nie udało się usunąć grupy."); authError(reason);
    } finally { actionLock.current = false; setPending(false); }
  }
  function saved(result: Group) {
    setEditing(false);
    setFeedback(groupId ? "Zmiany zostały zapisane." : "Grupa została utworzona.");
    if (groupId) setGroup(result);
    else setGroups(previous => [result, ...previous]);
  }
  async function refreshGroup(id: number) {
    try {
      const result = await getGroup(String(id), new AbortController().signal);
      if (groupId) setGroup(result);
      else setGroups(previous => previous.map(item => item.id === id ? result : item));
    } catch (reason) { setError(reason instanceof Error ? reason.message : "Nie udało się odświeżyć grupy."); authError(reason); }
  }
  const query = search.trim().toLocaleLowerCase("pl");
  const visibleGroups = groups.filter(item => `${item.name} ${item.description ?? ""}`.toLocaleLowerCase("pl").includes(query));
  return <>
    {(!groupId || !group) && <div className="teacher-heading admin-page-heading">
      <div><h1>{groupId ? "Szczegóły grupy" : "Grupy"}</h1><p>Twórz i zarządzaj swoimi grupami uczniów.</p></div>
      {!groupId && <button className="admin-button primary" disabled={loading || editing || !!error} onClick={() => { setEditing(true); setFeedback(""); }}>
        <img src={plusIcon} alt="" width={15} height={15} />Utwórz grupę</button>}
      {groupId && <Link className="admin-button" to="/teacher/groups">Wszystkie grupy</Link>}
    </div>}
    {feedback && <p className="task-save-success" role="status">{feedback}</p>}
    {!groupId && <section className="teacher-metrics" aria-label="Statystyki grup">
      {[
        { title: "Aktywne grupy", value: loading || error ? "—" : groups.length, note: "Twoje grupy", icon: "users" },
        { title: "Aktywne zadania", value: loading || error ? "—" : groups.reduce((sum, item) => sum + (item.active_task_count ?? 0), 0), note: "Łącznie w Twoich grupach", icon: "tasks" },
        { title: "Zadania po terminie", value: "—", note: "Terminy zadań wkrótce", icon: "alert" },
        { title: "Oczekujące zaproszenia", value: loading || error ? "—" : groups.reduce((sum, item) => sum + item.pending_invitation_count, 0), note: "Wysłane do uczniów", icon: "mail" },
      ].map(metric => <article className="admin-card teacher-metric" key={metric.title}>
        <div className="teacher-metric-heading"><h2>{metric.title}</h2><span className={`group-metric-icon group-metric-${metric.icon}`} aria-hidden="true" /></div>
        <p className="teacher-metric-value">{metric.value}</p><p className="teacher-metric-note">{metric.note}</p>
      </article>)}
    </section>}
    {!groupId && <div className="admin-card admin-filters group-filters">
      <label className="admin-search"><span className="sr-only">Szukaj grupy</span>
        <input type="search" placeholder="Szukaj grupy po nazwie lub opisie" value={search} onChange={event => setSearch(event.target.value)} />
      </label>
      {search && <button className="admin-button" onClick={() => setSearch("")}>Wyczyść wyszukiwanie</button>}
    </div>}
    {loading && <p className="admin-state" role="status">Ładowanie grup…</p>}
    {error && <div className="admin-card admin-state" role="alert"><p>{error}</p>
      <button className="admin-button" disabled={pending} onClick={() => setRevision(value => value + 1)}>Spróbuj ponownie</button></div>}
    {!loading && (!error || group) && <div className="group-columns">
      <section className="group-list" aria-label={groupId ? "Szczegóły grupy" : "Lista grup"}>
        {groupId && group ? <>
          <GroupDetails group={group} editing={editing} pending={pending} confirmDelete={confirmDelete} deleteError={error} assignmentRevision={assignmentRevision}
            onEdit={() => { setEditing(true); setConfirmDelete(false); setFeedback(""); }}
            onDelete={() => setConfirmDelete(true)} onCancelDelete={() => setConfirmDelete(false)} onConfirmDelete={remove}
            onInvite={() => setInviteGroup(group)} onAssign={() => setAssignmentGroup(group)} onChanged={() => { void refreshGroup(group.id); }} />
        </> : !groupId && <>
          {!groups.length && <div className="admin-card admin-state"><h2>Nie masz jeszcze żadnych grup</h2><p>Utwórz pierwszą grupę uczniów.</p></div>}
          {!!groups.length && !visibleGroups.length && <div className="admin-card admin-state"><h2>Brak pasujących grup</h2><p>Zmień nazwę lub opis w wyszukiwaniu.</p></div>}
          {visibleGroups.map(item => <article className="admin-card group-card" key={item.id}>
            <div className="group-card-heading"><span className="group-icon" aria-hidden="true" /><div>
              <h2><Link className="group-name-link" to={`/teacher/groups/${item.id}`}>{item.name}</Link></h2>
              <p className="muted">Liczba uczniów: {item.student_count} · Przypisane zadania: <span title="Licznik przypisań będzie dostępny w kolejnym etapie">—</span></p>
            </div></div>
            <div className="group-summary-progress">
              <div className="group-summary-progress-label"><span>Średni poziom ukończenia</span><span className="muted" title="Statystyki wykonania będą dostępne w kolejnym etapie">—</span></div>
              <div className="group-empty-track" aria-hidden="true" />
            </div>
            <dl className="group-card-details"><div><dt>Oczekujące zaproszenia</dt><dd>{item.pending_invitation_count}</dd></div></dl>
            <div className="group-card-footer">
              <div className="group-actions">
                <button type="button" className="admin-text-button" onClick={() => setInviteGroup(item)}>Zaproś</button>
                <button type="button" className="admin-text-button" onClick={() => setAssignmentGroup(item)}>Przypisz zadanie</button>
              </div>
              <Link className="admin-button group-open-button" aria-label={`Otwórz grupę ${item.name}`} to={`/teacher/groups/${item.id}`}>Otwórz grupę</Link>
            </div>
          </article>)}
        </>}
      </section>
      {editing && <GroupForm key={group?.id ?? "new"} group={group ?? undefined} onSave={saved}
        onCancel={() => setEditing(false)} onError={authError} />}
      {inviteGroup && <GroupInvitationsDialog key={inviteGroup.id} group={inviteGroup} onClose={() => setInviteGroup(null)} onChanged={() => { void refreshGroup(inviteGroup.id); }} />}
      {assignmentGroup && <GroupAssignmentDialog key={assignmentGroup.id} group={assignmentGroup} onClose={() => setAssignmentGroup(null)} onAssigned={() => { setAssignmentRevision(value => value + 1); void refreshGroup(assignmentGroup.id); }} />}
    </div>}
  </>;
}
