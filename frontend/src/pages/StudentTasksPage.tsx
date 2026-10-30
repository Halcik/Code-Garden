import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { DIFFICULTIES, TASK_TYPES, TasksApiError } from "../api/tasks";
import { listStudentTasks } from "../api/studentTasks";
import type { CatalogFilters, StudentTaskList } from "../api/studentTasks";
import { useAuth } from "../auth/AuthProvider";
import DesignIcon from "../components/admin/DesignIcon";
import ThemeSwitch from "../components/ThemeSwitch";
import LogoutButton from "../components/LogoutButton";
import TaskBadges from "../components/TaskBadges";
import codeIcon from "../assets/student/code.svg";
import clipboardIcon from "../assets/teacher/clipboard-list.svg";
import "../styles/admin-users.css";
import "../styles/student-tasks.css";

const initial: CatalogFilters = { search: "", topic: "", difficulty: "", task_type: "", sort_by: "created_at", sort_order: "desc", offset: 0 };
const progressLabels = { NOT_STARTED: "Nierozpoczęte", IN_PROGRESS: "W toku", COMPLETED: "Ukończone" };

export function StudentLayout() {
  const { user } = useAuth();
  return <div className="admin-layout student-layout">
    <aside className="admin-sidebar">
      <div className="admin-brand"><DesignIcon name="CodeGardenLogo" /><strong>Code Garden</strong></div>
      <nav aria-label="Panel ucznia"><NavLink to="/student/tasks"><span className="student-nav-icon" style={{ maskImage: `url("${clipboardIcon}")` }} aria-hidden="true" />Zadania</NavLink></nav>
      <div className="admin-sidebar-footer"><div className="admin-identity"><DesignIcon name="Avatar" /><div><strong>{user?.login}</strong><span>Uczeń</span></div></div><LogoutButton /></div>
    </aside>
    <div className="admin-application"><header className="admin-topbar"><span>Panel ucznia / Zadania</span><ThemeSwitch /></header><main className="admin-content"><Outlet /></main></div>
  </div>;
}

export default function StudentTasksPage() {
  const { retrySession } = useAuth();
  const [filters, setFilters] = useState(initial);
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<StudentTaskList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [view, setView] = useState<"all" | "assigned" | "catalog">("all");
  useEffect(() => {
    const timer = window.setTimeout(() => setFilters(previous => previous.search === search.trim() && previous.topic === topic.trim() ? previous : { ...previous, search: search.trim(), topic: topic.trim(), offset: 0 }), 300);
    return () => window.clearTimeout(timer);
  }, [search, topic]);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listStudentTasks(filters, controller.signal).then(result => {
      if (controller.signal.aborted) return;
      if (result.total > 0 && filters.offset >= result.total) setFilters(previous => ({ ...previous, offset: Math.floor((result.total - 1) / result.limit) * result.limit }));
      setData(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setData(null); setError(reason instanceof Error ? reason.message : "Nie można pobrać zadań.");
      if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, attempt, retrySession]);
  function change(key: string, value: string) { setFilters(previous => ({ ...previous, [key]: value, offset: 0 })); }
  function reset() { setSearch(""); setTopic(""); setFilters(initial); }
  const catalogCount = data?.progress_counts ? Object.values(data.progress_counts).reduce((sum, count) => sum + count, 0) : data?.total;
  return <>
    <div className="admin-page-heading student-heading"><div><h1>Zadania</h1><p>Ćwicz we własnym tempie i odkrywaj zadania z różnych zagadnień programowania.</p></div></div>
    <div className="admin-card student-view-tabs" role="group" aria-label="Widok zadań">
      <button type="button" aria-pressed={view === "all" && !filters.progress_status} onClick={() => { setView("all"); if (filters.progress_status) change("progress_status", ""); }}>Wszystkie <span className="student-view-count">{loading ? "…" : catalogCount ?? "—"}</span></button>
      <button type="button" aria-pressed={view === "assigned"} onClick={() => { setView("assigned"); if (filters.progress_status) change("progress_status", ""); }}>Przypisane</button>
      <button type="button" aria-pressed={view === "catalog"} onClick={() => { setView("catalog"); if (filters.progress_status) change("progress_status", ""); }}>Z katalogu <span className="student-view-count">{loading ? "…" : catalogCount ?? "—"}</span></button>
      {Object.entries(progressLabels).map(([status, label]) => {
        const count = data?.progress_counts?.[status as keyof typeof progressLabels];
        return <button key={status} type="button" aria-pressed={filters.progress_status === status} onClick={() => { setView("all"); change("progress_status", status); }}>{label}{(loading || (count != null && count > 0)) && <span className="student-view-count">{loading ? "…" : count}</span>}</button>;
      })}
      <button type="button" disabled title="Filtrowanie według terminów będzie dostępne wkrótce">Po terminie</button>
    </div>
    {view !== "assigned" &&
    <div className="admin-card student-filters" role="search" aria-label="Filtry katalogu zadań">
      <label className="student-search">Wyszukaj<input maxLength={200} placeholder="Szukaj po tytule" value={search} onChange={event => setSearch(event.target.value)} /></label>
      <label>Temat<input maxLength={100} placeholder="Wszystkie tematy" value={topic} onChange={event => setTopic(event.target.value)} /></label>
      <label>Trudność<select value={filters.difficulty} onChange={event => change("difficulty", event.target.value)}><option value="">Wszystkie</option>{Object.entries(DIFFICULTIES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Typ<select value={filters.task_type} onChange={event => change("task_type", event.target.value)}><option value="">Wszystkie</option>{Object.entries(TASK_TYPES).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <button className="admin-button" onClick={reset}>Wyczyść filtry</button>
    </div>}
    {view !== "catalog" && <section className="student-assigned-section" aria-labelledby="student-assigned-heading">
      <div className="student-section-heading"><div><h2 id="student-assigned-heading">Zadania przypisane przez nauczyciela</h2></div></div>
      <div className="admin-card student-assigned-empty">
        <span className="student-topic-icon" aria-hidden="true"><span style={{ maskImage: `url("${clipboardIcon}")` }} /></span>
        <div><h3>Tutaj pojawią się zadania przypisane przez nauczyciela</h3><p>W tym czasie możesz ćwiczyć samodzielnie, wybierając zadania z katalogu poniżej.</p></div>
      </div>
    </section>}
    {view !== "assigned" && <>
    <div className="student-section-heading"><div><h2>Odkrywaj dalej</h2><p>Zadania z katalogu · ćwicz wybrane zagadnienia we własnym tempie</p></div><label>Sortuj według <select value={`${filters.sort_by}:${filters.sort_order}`} onChange={event => { const [sort_by, sort_order] = event.target.value.split(":"); setFilters(previous => ({ ...previous, sort_by, sort_order, offset: 0 })); }}><option value="created_at:desc">Najnowsze</option><option value="created_at:asc">Najstarsze</option><option value="title:asc">Tytuł A–Z</option><option value="title:desc">Tytuł Z–A</option></select></label></div>
    <section aria-label="Katalog zadań" aria-busy={loading}>
      {loading ? <div className="admin-card admin-state" role="status">Ładowanie zadań…</div>
        : error ? <div className="admin-card admin-state" role="alert"><p className="error-message">{error}</p><button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button></div>
        : !data?.items.length ? <div className="admin-card admin-state" role="status"><h2>Brak zadań</h2><p>Nie znaleziono dostępnych zadań. Zmień lub wyczyść filtry.</p><button className="admin-button" onClick={reset}>Wyczyść filtry</button></div>
        : <><div className="student-task-grid">{data.items.map(task => <article className="admin-card student-task-card" key={task.id}>
          <div className="student-card-heading">
            <span className="student-topic-icon"><span aria-hidden="true" style={{ maskImage: `url("${codeIcon}")` }} /></span>
            <span className="student-progress-badge" data-progress={task.progress_status ?? "NOT_STARTED"} title={task.progress_status === "COMPLETED" ? "Rozwiązanie wysłane — oczekuje na sprawdzenie przez nauczyciela" : undefined}>
              {task.progress_status === "COMPLETED" && <svg className="student-completion-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="m5 12 4 4L19 6" /></svg>}
              {progressLabels[task.progress_status ?? "NOT_STARTED"]}
            </span>
          </div>
          <h2><Link to={`/student/tasks/${task.id}`}>{task.title}</Link></h2><p className="student-description">{task.description}</p>
          <TaskBadges task={task} />
          <div className="student-card-footer"><span>{task.estimated_time_minutes == null ? "Czas nieokreślony" : `~${task.estimated_time_minutes} min`}</span><Link className="admin-button" to={`/student/tasks/${task.id}`}>Zobacz zadanie</Link></div>
        </article>)}</div><nav className="admin-pagination student-pagination" aria-label="Strony katalogu zadań"><button className="admin-button" disabled={data.offset === 0} onClick={() => setFilters(previous => ({ ...previous, offset: Math.max(0, previous.offset - data.limit) }))}>Poprzednia</button><span>{data.offset + 1}–{data.offset + data.items.length} z {data.total}</span><button className="admin-button" disabled={data.offset + data.limit >= data.total} onClick={() => setFilters(previous => ({ ...previous, offset: previous.offset + data.limit }))}>Następna</button></nav></>}
    </section>
    </>}
  </>;
}
