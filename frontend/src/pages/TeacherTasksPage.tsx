import TabCount from "../components/TabCount";
import { submitPublication } from "../api/publication";
import reviewBadge from "../assets/publication/BadgeCheck.svg";
import { useEffect, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { DIFFICULTIES, STATUSES, TASK_TYPES, listTasks, archiveTask, restoreTask, TasksApiError } from "../api/tasks";
import type { Task, TaskFilters, TaskList } from "../api/tasks";
import TaskAssignments from "../components/teacher/TaskAssignments";
import { useAuth } from "../auth/AuthProvider";
import DesignIcon from "../components/admin/DesignIcon";
import LogoutButton from "../components/LogoutButton";
import ThemeSwitch from "../components/ThemeSwitch";
import clipboardIcon from "../assets/teacher/clipboard-list.svg";
import submissionsIcon from "../assets/submissions/queue-Inbox.svg";
import plusIcon from "../assets/teacher/plus.svg";
import metricTasksIcon from "../assets/teacher/metric-tasks.svg";
import metricAssignedIcon from "../assets/teacher/metric-assigned.svg";
import metricDraftsIcon from "../assets/teacher/metric-drafts.svg";
import metricPublicationIcon from "../assets/teacher/metric-publication.svg";
import "../styles/admin-users.css";
import "../styles/teacher-tasks.css";


const initialFilters: TaskFilters = {
  view: "all", own_only: "", in_review: "",
  q: "", topic: "", difficulty: "", status: "", archived: "", assigned: "", sort_by: "updated_at", sort_order: "desc", offset: 0,
};

const taskMetrics = [
  { title: "Wszystkie zadania", icon: metricTasksIcon, status: "" },
  { title: "Przypisane", icon: metricAssignedIcon, status: "ASSIGNED" },
  { title: "Wersje robocze", icon: metricDraftsIcon, status: "DRAFT" },
  { title: "Proces publikacji", icon: metricPublicationIcon, status: "PUBLICATION" },
];

function TaskCountMetric({ title, icon, status, revision }: {
  title: string; icon: string; status: string | null; revision: number;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(status !== null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [ownCount, setOwnCount] = useState<number | null>(null);

  useEffect(() => {
    if (status === null) return;
    const controller = new AbortController();
    setLoading(true); setError(false);
    listTasks({ ...initialFilters, view: status === "" || status === "ASSIGNED" ? "all" : "own", in_publication: status === "PUBLICATION" ? "true" : "", status: ["ASSIGNED", "PUBLICATION"].includes(status) ? "" : status, assigned: status === "ASSIGNED" ? "true" : "", archived: status === "DRAFT" ? "false" : "" }, controller.signal, 1).then(result => {
      if (!controller.signal.aborted) setCount(result.total);
    }).catch(() => {
      if (!controller.signal.aborted) { setCount(null); setError(true); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    if (status === "") {
      setOwnCount(null);
      listTasks({ ...initialFilters, view: "own" }, controller.signal, 1).then(result => {
        if (!controller.signal.aborted) setOwnCount(result.total);
      }).catch(() => { /* Keep the total available if the own count fails. */ });
    }
    return () => controller.abort();
  }, [status, revision, attempt]);

  return <article className="admin-card teacher-metric" aria-busy={loading}>
    <div className="teacher-metric-heading"><h2>{title}</h2>
      <span className="teacher-metric-icon" aria-hidden="true"><span style={{ maskImage: `url("${icon}")` }} /></span>
    </div>
    <p className="teacher-metric-value">{loading ? "…" : count ?? "—"}</p>
    {status === null ? <p className="teacher-metric-note">Placeholder · statystyki wkrótce</p>
      : error ? <div className="teacher-metric-note" role="alert">Nie udało się pobrać liczby zadań.
        <button className="admin-text-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button>
      </div> : loading ? <p className="teacher-metric-note">Ładowanie liczby zadań…</p>
      : status === "ASSIGNED" ? <p className="teacher-metric-note">Zadania przypisane uczniom</p>
      : status === "" && count !== null ? <p className="teacher-metric-note">W tym moje: {ownCount ?? "—"}</p> : null}
  </article>;
}

export function TeacherLayout() {
  const { user } = useAuth();
  const location = useLocation();
  const viewingSubmissions = location.pathname.includes("/submissions");
  const viewingGroups = location.pathname.startsWith("/teacher/groups");
  return <div className="admin-layout teacher-layout">
    <aside className="admin-sidebar">
      <div className="admin-brand"><DesignIcon name="CodeGardenLogo" /><strong>Code Garden</strong></div>
      <nav aria-label="Panel nauczyciela"><NavLink to="/teacher/groups"><DesignIcon name="Users" />Grupy</NavLink>
        <NavLink to="/teacher/tasks"><span className="teacher-nav-icon" aria-hidden="true" style={{ maskImage: `url("${clipboardIcon}")` }} />Zadania</NavLink>
        <NavLink to="/teacher/submissions"><span className="teacher-nav-icon" aria-hidden="true" style={{ maskImage: `url("${submissionsIcon}")` }} />Prace uczniów</NavLink><NavLink to="/teacher/reviews"><span className="teacher-nav-icon" aria-hidden="true" style={{ maskImage: `url("${reviewBadge}")` }} />Recenzje</NavLink></nav>
      <div className="admin-sidebar-footer">
        <div className="admin-identity"><DesignIcon name="Avatar" /><div><strong>{user?.login}</strong><span>Nauczyciel</span></div></div>
        <LogoutButton />
      </div>
    </aside>
    <div className="admin-application">
      <header className="admin-topbar"><span>Panel nauczyciela / {location.pathname.includes("/reviews") ? "Recenzje" : viewingGroups ? "Grupy" : viewingSubmissions ? "Rozwiązania" : "Zadania"}</span><ThemeSwitch /></header>
      <main className="admin-content"><Outlet /></main>
    </div>
  </div>;
}

export default function TeacherTasksPage() {
  const location = useLocation();
  const { user, retrySession } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<TaskList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);
  const [menuId, setMenuId] = useState<number | null>(null);
  const [pendingId, setPendingId] = useState<number | null>(null);
  const [actionError, setActionError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [assignmentTask, setAssignmentTask] = useState<Task | null>(null);
  const actionLock = useRef(false);

  useEffect(() => {
    if (menuId === null) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setMenuId(null); };
    const outside = (event: MouseEvent) => {
      if (event.target instanceof Element && !event.target.closest(".teacher-row-actions")) setMenuId(null);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("click", outside);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("click", outside); };
  }, [menuId]);

  async function changeArchive(id: number, archived: boolean) {
    if (actionLock.current) return;
    actionLock.current = true;
    setPendingId(id); setMenuId(null); setActionError(""); setFeedback("");
    try {
      await (archived ? archiveTask(id) : restoreTask(id));
      setFeedback(archived ? "Zadanie zostało zarchiwizowane." : "Zadanie zostało przywrócone.");
      setRevision(value => value + 1);
    } catch (reason) {
      setActionError(reason instanceof Error ? reason.message : "Nie udało się zmienić archiwizacji. Spróbuj ponownie.");
      if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    } finally { actionLock.current = false; setPendingId(null); }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(previous => {
      const q = search.trim(), nextTopic = topic.trim();
      return previous.q === q && previous.topic === nextTopic ? previous
        : { ...previous, q, topic: nextTopic, offset: 0 };
    }), 300);
    return () => window.clearTimeout(timer);
  }, [search, topic]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listTasks(filters, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.total > 0 && filters.offset >= result.total) {
        setFilters(previous => ({ ...previous, offset: Math.floor((result.total - 1) / result.limit) * result.limit }));
      }
      setData(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setData(null);
      setError(reason instanceof TasksApiError ? reason.message : "Nie można pobrać zadań. Sprawdź połączenie i spróbuj ponownie.");
      if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, revision, retrySession]);

  function filterChange(key: string, value: string) {
    setFilters(previous => ({ ...previous, [key]: value, ...(key === "status" ? { in_review: "" } : {}), offset: 0 }));
  }
  const filtered = Boolean(filters.q || filters.topic || filters.status || filters.difficulty || filters.archived || filters.assigned || filters.in_review || filters.own_only);
  function clearFilters() { setSearch(""); setTopic(""); setFilters(initialFilters); }

  return <>
    {location.state?.taskSaved && <p role="status" className="task-save-success">Zadanie zostało utworzone.</p>}
    <div className="teacher-heading admin-page-heading">
      <div><h1>Zarządzanie zadaniami</h1><p>Twoje zadania, wersje robocze i materiały gotowe do dalszej pracy.</p></div>
      <Link className="admin-button primary" to="/teacher/tasks/new"><img src={plusIcon} alt="" width={15} height={15} />Utwórz zadanie</Link>
    </div>
    {filters.view === "catalog" && <p className="muted">Katalog publiczny · zadania można przypisywać uczniom i grupom.</p>}
    <section className="teacher-metrics" aria-label="Statystyki zadań">
      {taskMetrics.map(metric => <TaskCountMetric key={metric.title} {...metric} revision={revision} />)}
    </section>
    <div className="admin-card teacher-tabs" role="group" aria-label="Status zadań">
      <button type="button" aria-pressed={filters.view !== "catalog" && !filters.own_only && !filters.status && !filters.archived && !filters.assigned && !filters.in_review} onClick={() => setFilters(previous => ({ ...previous, view: "all", own_only: "", in_review: "", status: "", archived: "", assigned: "", offset: 0 }))}>Wszystkie<TabCount count={loading ? undefined : data?.tab_counts?.ALL} /></button>
      <button type="button" aria-pressed={filters.view !== "catalog" && filters.own_only === "true" && !filters.status && !filters.archived && !filters.assigned && !filters.in_review} onClick={() => setFilters(previous => ({ ...previous, view: "all", own_only: "true", in_review: "", status: "", archived: "", assigned: "", offset: 0 }))}>Moje zadania<TabCount count={loading ? undefined : data?.tab_counts?.OWN} /></button>
      <button type="button" aria-pressed={filters.view !== "catalog" && filters.assigned === "true"} onClick={() => setFilters(previous => ({ ...previous, view: "all", own_only: "", in_review: "", status: "", archived: "", assigned: "true", offset: 0 }))}>Przypisane<TabCount count={loading ? undefined : data?.tab_counts?.ASSIGNED} /></button>
      <button type="button" aria-pressed={!filters.assigned && filters.status === "DRAFT" && filters.archived === "false"} onClick={() => setFilters(previous => ({ ...previous, view: "all", own_only: "true", in_review: "", status: "DRAFT", archived: "false", assigned: "", offset: 0 }))}>Wersje robocze<TabCount count={loading ? undefined : data?.tab_counts?.DRAFT} /></button>
      <button type="button" aria-pressed={filters.view === "catalog"} onClick={() => setFilters({ ...initialFilters, view: "catalog" })}>Publiczne<TabCount count={loading ? undefined : data?.tab_counts?.PUBLIC} /></button>
      <button type="button" aria-pressed={filters.in_review === "true"} onClick={() => setFilters(previous => ({ ...previous, view: "all", own_only: "true", in_review: "true", status: "", archived: "false", assigned: "", offset: 0 }))}>W recenzji<TabCount count={loading ? undefined : data?.tab_counts?.IN_REVIEW} /></button>
      <button type="button" aria-pressed={!filters.assigned && filters.archived === "true"} onClick={() => setFilters(previous => ({ ...previous, view: "all", own_only: "true", in_review: "", status: "", archived: "true", assigned: "", offset: 0 }))}>Zarchiwizowane<TabCount count={loading ? undefined : data?.tab_counts?.ARCHIVED} /></button>
    </div>
    {actionError && <p role="alert" className="error-message">{actionError}</p>}
    {feedback && <p role="status" className="task-save-success">{feedback}</p>}
    <section className="admin-card admin-filters teacher-filters" aria-label="Filtry zadań">
      <label className="admin-search"><span className="sr-only">Szukaj zadania</span><input type="search" maxLength={200} placeholder="Szukaj zadania…" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label><span className="sr-only">Temat</span><input maxLength={100} placeholder="Temat: Wszystkie tematy" value={topic} onChange={event => setTopic(event.target.value)} /></label>
      <label><span className="sr-only">Poziom trudności</span><select value={filters.difficulty} onChange={event => filterChange("difficulty", event.target.value)}>
        <option value="">Poziom: Wszystkie</option>{Object.entries(DIFFICULTIES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label><span className="sr-only">Status</span><select value={filters.status} onChange={event => filterChange("status", event.target.value)}>
        <option value="">Stan: Wszystkie</option>{Object.entries(STATUSES).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
      </select></label>
      <label className="teacher-sort"><span className="sr-only">Sortowanie</span><select value={`${filters.sort_by}:${filters.sort_order}`} onChange={event => {
        const [sort_by, sort_order] = event.target.value.split(":");
        setFilters(previous => ({ ...previous, sort_by, sort_order, offset: 0 }));
      }}>
        <option value="updated_at:desc">Aktualizacja: Najnowsze</option><option value="updated_at:asc">Aktualizacja: Najstarsze</option>
        <option value="created_at:desc">Utworzenie: Najnowsze</option><option value="created_at:asc">Utworzenie: Najstarsze</option>
        <option value="title:asc">Tytuł: A–Z</option><option value="title:desc">Tytuł: Z–A</option>
      </select></label>
      <button className="admin-button" onClick={clearFilters}>Wyczyść</button>
    </section>
    <section className="admin-card users-list" aria-label="Lista zadań" aria-busy={loading}>
      <div className="users-list-heading"><h2>{filters.view === "catalog" ? "Katalog publiczny" : filters.own_only === "true" ? "Moje zadania" : "Wszystkie zadania"}</h2>{!loading && data && <p className="muted">{filtered ? "Wyniki" : "Wszystkie zadania"}: {data.total}</p>}</div>
      {loading ? <p className="admin-state" role="status">Ładowanie zadań…</p>
        : error ? <div className="admin-state" role="alert"><p className="error-message">{error}</p><button className="admin-button" onClick={() => setRevision(value => value + 1)}>Spróbuj ponownie</button></div>
        : !data?.items.length ? <div className="admin-state" role="status"><h2>{filtered ? "Brak pasujących zadań" : "Nie masz jeszcze żadnych zadań"}</h2><p>{filtered ? "Zmień wyszukiwanie lub wyczyść filtry." : "Twoje zadania pojawią się na tej liście."}</p>{filtered && <button className="admin-button" onClick={clearFilters}>Wyczyść filtry</button>}</div>
        : <><div className="users-table-scroll"><table className="users-table teacher-table"><caption className="sr-only">Zadania nauczyciela i katalogu publicznego</caption>
          <thead><tr>{["Zadanie", "Temat i poziom", "Typ", "Stan", "Aktualizacja", "Przypisz", "Użycie", "Akcje"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{data.items.map(task => { const ownTask = task.author_id === user?.id; return <tr key={task.id}>
            <td><Link to={ownTask ? `/teacher/tasks/${task.id}/edit` : `/teacher/catalog/${task.id}`} className="teacher-task-link">{task.title}</Link></td>
            <td>{task.topic} · {DIFFICULTIES[task.difficulty]}</td><td>{TASK_TYPES[task.task_type]}</td>
            <td><span className={`user-badge ${!task.is_archived && task.status === "READY" ? "status-active" : "task-draft"}`}>{task.is_archived ? "Zarchiwizowane" : STATUSES[task.status]}</span></td>
            <td><time dateTime={task.updated_at}>{new Date(task.updated_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time></td>
            <td><button type="button" className="teacher-open-link teacher-assign-button" aria-label={`Przypisz zadanie: ${task.title}`} disabled={pendingId !== null || task.is_archived || !(task.status === "PUBLISHED" || (ownTask && task.status === "READY"))}
              title={task.is_archived ? "Przywróć zadanie przed przypisaniem" : !["READY", "PUBLISHED"].includes(task.status) ? "Zadanie musi mieć status Gotowe" : undefined}
              onClick={() => { setMenuId(null); setAssignmentTask(task); }}>Przypisz</button></td>
            <td>{task.is_archived && <p>Tylko do odczytu</p>}{ownTask && <Link className="teacher-open-link" to={`/teacher/tasks/${task.id}/submissions`}>Rozwiązania uczniów</Link>}</td>
            <td><div className="teacher-row-actions" aria-busy={pendingId === task.id}>
              {task.is_archived ? <button className="admin-text-button" disabled={pendingId !== null} onClick={() => changeArchive(task.id, false)}>{pendingId === task.id ? "Przywracanie…" : "Przywróć"}</button>
                : <>{ownTask && <Link className="teacher-open-link" to={`/teacher/tasks/${task.id}/edit`} aria-label={`Otwórz zadanie: ${task.title}`}>Otwórz</Link>}
                  {ownTask && <button className="teacher-more-button" aria-label={`Więcej akcji: ${task.title}`} aria-expanded={menuId === task.id} aria-controls={`task-actions-${task.id}`} disabled={pendingId !== null} onClick={() => setMenuId(previous => previous === task.id ? null : task.id)}>⋯</button>}
                  {ownTask && menuId === task.id && <div className="teacher-action-menu" id={`task-actions-${task.id}`}><button type="button" onClick={() => changeArchive(task.id, true)}>Archiwizuj</button>{["READY", "CHANGES_REQUESTED_BY_TEACHER", "CHANGES_REQUESTED_BY_ADMIN"].includes(task.status) && <button type="button" disabled={pendingId !== null} onClick={async () => { if (actionLock.current) return; actionLock.current = true; setPendingId(task.id); setActionError(""); try { await submitPublication(task.id); setMenuId(null); setRevision(n => n + 1); setFeedback("Zadanie zgłoszono do publikacji."); } catch (reason) { setActionError(reason instanceof Error ? reason.message : "Nie udało się zgłosić zadania."); } finally { actionLock.current = false; setPendingId(null); } }}>Zgłoś do publikacji</button>}</div>}
                </>}
            </div></td>
          </tr>; })}</tbody>
        </table></div><nav className="admin-pagination" aria-label="Strony listy zadań">
          <button className="admin-button" disabled={filters.offset === 0} onClick={() => setFilters(previous => ({ ...previous, offset: Math.max(0, previous.offset - data.limit) }))}>Poprzednia</button>
          <span>{data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} z {data.total}</span>
          <button className="admin-button" disabled={data.offset + data.limit >= data.total} onClick={() => setFilters(previous => ({ ...previous, offset: previous.offset + data.limit }))}>Następna</button>
        </nav></>}
    </section>
    {assignmentTask && <TaskAssignments key={assignmentTask.id} taskId={String(assignmentTask.id)} available={true} onClose={() => { setAssignmentTask(null); setRevision(value => value + 1); }} />}
  </>;
}
