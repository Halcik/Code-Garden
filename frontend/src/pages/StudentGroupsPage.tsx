import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { answerGroupInvitation, getStudentGroup, joinGroupByCode, leaveStudentGroup, listStudentGroups, listStudentInvitations } from "../api/groupInvitations";
import type { GroupInvitation, StudentGroup } from "../api/groupInvitations";
import { GroupsApiError } from "../api/groups";
import { listStudentTasks } from "../api/studentTasks";
import { useAuth } from "../auth/AuthProvider";
import GroupDialog from "../components/teacher/GroupDialog";
import "../styles/teacher-groups.css";
import "../styles/student-groups.css";

export default function StudentGroupsPage() {
  const { groupId } = useParams();
  const navigate = useNavigate();
  const { retrySession } = useAuth();
  const [groups, setGroups] = useState<StudentGroup[]>([]);
  const [invitations, setInvitations] = useState<GroupInvitation[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [revision, setRevision] = useState(0);
  const [code, setCode] = useState("");
  const [catalogCount, setCatalogCount] = useState<number | null>(null);
  const [leaving, setLeaving] = useState<StudentGroup | null>(null);
  const lock = useRef(false);
  function failed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Nie udało się wykonać operacji. Spróbuj ponownie.");
    if (reason instanceof GroupsApiError && [401, 403].includes(reason.status)) retrySession();
  }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setGroups([]); setInvitations([]); setLeaving(null);
    const load = async () => {
      try {
        const [data, invited] = groupId
          ? [[await getStudentGroup(groupId, controller.signal)], [] as GroupInvitation[]]
          : await Promise.all([listStudentGroups(controller.signal), listStudentInvitations(controller.signal)]);
        if (!controller.signal.aborted) { setGroups(data); setInvitations(invited); }
      } catch (reason) { if (!controller.signal.aborted) failed(reason); }
      finally { if (!controller.signal.aborted) setLoading(false); }
    };
    void load(); return () => controller.abort();
  }, [groupId, revision]);
  useEffect(() => {
    if (groupId) return;
    const controller = new AbortController();
    listStudentTasks({ search: "", topic: "", difficulty: "", task_type: "", sort_by: "created_at", sort_order: "desc", offset: 0, view: "catalog" }, controller.signal)
      .then(data => { if (!controller.signal.aborted) setCatalogCount(data.total); }).catch(() => { /* Membership remains usable if the catalog is unavailable. */ });
    return () => controller.abort();
  }, [groupId]);
  async function action(work: () => Promise<unknown>, message: string) {
    if (lock.current) return;
    lock.current = true; setPending(true); setError(""); setFeedback("");
    try { await work(); setFeedback(message); setRevision(value => value + 1); }
    catch (reason) { failed(reason); }
    finally { lock.current = false; setPending(false); }
  }
  function join(event: FormEvent) {
    event.preventDefault();
    if (!code.trim()) return;
    void action(async () => { await joinGroupByCode(code.trim()); setCode(""); }, "Dołączono do grupy.");
  }
  return <>
    <div className="admin-page-heading student-heading"><div><h1>{groupId ? groups[0]?.name ?? "Twoja grupa" : "Twoje grupy"}</h1>
      <p>Możesz należeć do wielu grup albo do żadnej. Zadania publiczne pozostają dostępne niezależnie od członkostwa.</p></div>
      {groupId && <Link className="admin-button" to="/student/groups">Twoje grupy</Link>}
    </div>
    {feedback && <p role="status" className="student-group-success">{feedback}</p>}
    {error && !leaving && <div className="admin-card admin-state" role="alert"><p>{error}</p><button className="admin-button" disabled={pending} onClick={() => setRevision(value => value + 1)}>Odśwież grupy</button></div>}
    {loading ? <p role="status">Ładowanie grup…</p> : <>
      {!!invitations.length && <section className="student-group-invitations" aria-label="Zaproszenia do grup">
        {invitations.map(invitation => <article className="student-group-invitation" key={invitation.id}>
          <span className="student-group-mail" aria-hidden="true" />
          <div className="student-group-invitation-copy"><h2>Zaproszenie do grupy {invitation.group_name} <span className="user-badge approval-pending">Oczekujące</span></h2>
            <p>Zaprosił {invitation.teacher_login} · {new Date(invitation.created_at).toLocaleDateString("pl-PL")}</p></div>
          <div className="student-group-actions">
            <button className="admin-button student-group-leave" disabled={pending} onClick={() => { void action(() => answerGroupInvitation(invitation.id, false), "Zaproszenie zostało odrzucone."); }}>Odrzuć</button>
            <button className="admin-button primary" disabled={pending} onClick={() => { void action(() => answerGroupInvitation(invitation.id, true), "Zaproszenie zostało zaakceptowane. Dołączono do grupy."); }}>Zaakceptuj zaproszenie</button>
          </div>
        </article>)}
      </section>}
      {!groupId && <section className="student-group-summary" aria-label="Podsumowanie członkostwa">
        <article className="admin-card"><p>Aktywne członkostwa</p><strong>{groups.length} {groups.length === 1 ? "grupa" : groups.length % 10 >= 2 && groups.length % 10 <= 4 && (groups.length % 100 < 12 || groups.length % 100 > 14) ? "grupy" : "grup"}</strong><span>Różni nauczyciele i plany nauki</span></article>
        <article className="admin-card"><p>Nauka samodzielna</p><Link to="/student/tasks">{catalogCount === null ? "Katalog zadań" : `${catalogCount} zadań`}</Link><span>Dostępne bez dołączania do grupy</span></article>
      </section>}
      <section className="student-group-grid" aria-label="Twoje członkostwa">
        {!groups.length && !error && <div className="admin-card admin-state"><h2>Nie należysz jeszcze do żadnej grupy</h2><p>Zaakceptuj zaproszenie nauczyciela albo wpisz kod grupy poniżej.</p></div>}
        {groups.map(group => <article className="admin-card student-group-card" key={group.id}>
          <div className="student-group-heading"><span className="student-group-icon" aria-hidden="true" /><div><h2>{groupId ? group.name : <Link to={`/student/groups/${group.id}`}>{group.name}</Link>}</h2><p>Nauczyciel · {group.teacher_login}</p></div><span className="user-badge status-active">Aktywna</span></div>
          {groupId && <p className="group-description">{group.description || "Brak opisu."}</p>}
          <div className="student-group-progress"><div><span>Twój postęp w grupie</span><span title="Postępy będą dostępne po przypisaniu zadań">—</span></div><div className="student-group-track" aria-hidden="true" /></div>
          <dl className="student-group-data"><div><dt>Członkowie</dt><dd>{group.student_count} uczniów</dd></div><div><dt>Najbliższy termin</dt><dd>—</dd></div><div><dt>Twoje aktywne zadania</dt><dd>{group.active_task_count ?? 0}</dd></div></dl>
          <div className="student-group-card-actions"><button className="admin-button student-group-leave" disabled={pending} onClick={() => { setError(""); setLeaving(group); }}>Opuść grupę</button>
            {!groupId && <Link className="admin-button student-group-open" to={`/student/groups/${group.id}`} aria-label={`Otwórz grupę ${group.name}`}>Otwórz grupę</Link>}</div>
        </article>)}
      </section>
      {!groupId && <section className="admin-card student-group-join" aria-labelledby="join-group-heading"><h2 id="join-group-heading">Jak dołączyć do grupy</h2>
        <p>Zaakceptuj zaproszenie nauczyciela albo użyj otrzymanego od niego kodu. Aktywny kod pozwoli Ci od razu dołączyć do grupy.</p>
        <form onSubmit={join}><label>Kod grupy<input required maxLength={64} autoComplete="off" spellCheck={false} value={code} disabled={pending} onChange={event => setCode(event.target.value)} /></label>
          <button className="admin-button primary" disabled={pending || !code.trim()}>{pending ? "Dołączanie…" : "Dołącz do grupy"}</button></form>
      </section>}
    </>}
    {leaving && <GroupDialog labelledBy="leave-group-heading" onCancel={() => { if (!lock.current) setLeaving(null); }}><h2 id="leave-group-heading">Opuść grupę</h2><p>Czy chcesz opuścić grupę „{leaving.name}”?</p>
      {error && <p role="alert">{error}</p>}
      <div className="group-actions"><button className="admin-button" autoFocus disabled={pending} onClick={() => setLeaving(null)}>Anuluj</button>
        <button className="admin-button student-group-leave" disabled={pending} onClick={() => { void action(async () => { await leaveStudentGroup(leaving.id); setLeaving(null); if (groupId) navigate("/student/groups"); }, "Opuszczono grupę."); }}>Potwierdź opuszczenie</button></div>
    </GroupDialog>}
  </>;
}
