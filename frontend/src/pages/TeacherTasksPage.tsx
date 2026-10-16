import { useEffect, useState } from "react";
import { Link, NavLink, Outlet } from "react-router-dom";
import { DIFFICULTIES, STATUSES, TASK_TYPES, listTasks, TasksApiError } from "../api/tasks";
import type { TaskFilters, TaskList } from "../api/tasks";
import { useAuth } from "../auth/AuthProvider";
import DesignIcon from "../components/admin/DesignIcon";
import LogoutButton from "../components/LogoutButton";
import ThemeSwitch from "../components/ThemeSwitch";
import clipboardIcon from "../assets/teacher/clipboard-list.svg";
import plusIcon from "../assets/teacher/plus.svg";
import metricTasksIcon from "../assets/teacher/metric-tasks.svg";
import metricAssignedIcon from "../assets/teacher/metric-assigned.svg";
import metricDraftsIcon from "../assets/teacher/metric-drafts.svg";
import metricPublicationIcon from "../assets/teacher/metric-publication.svg";
import "../styles/admin-users.css";
import "../styles/teacher-tasks.css";

const initialFilters: TaskFilters = {
  q: "", topic: "", difficulty: "", status: "", sort_by: "updated_at", sort_order: "desc", offset: 0,
};

const taskMetrics = [
  { title: "Wszystkie zadania", icon: metricTasksIcon, status: "" },
  { title: "Przypisane", icon: metricAssignedIcon, status: null },
  { title: "Wersje robocze", icon: metricDraftsIcon, status: "DRAFT" },
  { title: "Proces publikacji", icon: metricPublicationIcon, status: null },
];

function TaskCountMetric({ title, icon, status, revision }: {
  title: string; icon: string; status: string | null; revision: number;
}) {
  const [count, setCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(status !== null);
  const [error, setError] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (status === null) return;
    const controller = new AbortController();
    setLoading(true); setError(false);
    listTasks({ ...initialFilters, status }, controller.signal, 1).then(result => {
      if (!controller.signal.aborted) setCount(result.total);
    }).catch(() => {
      if (!controller.signal.aborted) { setCount(null); setError(true); }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
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
      </div> : loading ? <p className="teacher-metric-note">Ładowanie liczby zadań…</p> : null}
  </article>;
}

export function TeacherLayout() {
  const { user } = useAuth();
  return <div className="admin-layout teacher-layout">
    <aside className="admin-sidebar">
      <div className="admin-brand"><DesignIcon name="CodeGardenLogo" /><strong>Code Garden</strong></div>
      <nav aria-label="Panel nauczyciela"><NavLink to="/teacher/tasks"><span className="teacher-nav-icon" aria-hidden="true" style={{ maskImage: `url("${clipboardIcon}")` }} />Zadania</NavLink></nav>
      <div className="admin-sidebar-footer">
        <div className="admin-identity"><DesignIcon name="Avatar" /><div><strong>{user?.login}</strong><span>Nauczyciel</span></div></div>
        <LogoutButton />
      </div>
    </aside>
    <div className="admin-application">
      <header className="admin-topbar"><span>Panel nauczyciela / Zadania</span><ThemeSwitch /></header>
      <main className="admin-content"><Outlet /></main>
    </div>
  </div>;
}

export function TaskPlaceholder({ create = false }: { create?: boolean }) {
  return <section className="admin-card admin-state">
    <h1>{create ? "Utwórz zadanie" : "Szczegóły zadania"}</h1>
    <p>{create ? "Ekran tworzenia zadania będzie dostępny w kolejnym etapie." : "Ekran szczegółów i edycji zadania będzie dostępny w kolejnym etapie."}</p>
    <Link className="admin-button" to="/teacher/tasks">Wróć do listy zadań</Link>
  </section>;
}

export default function TeacherTasksPage() {
  const { retrySession } = useAuth();
  const [filters, setFilters] = useState(initialFilters);
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState("");
  const [data, setData] = useState<TaskList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [revision, setRevision] = useState(0);

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
    setFilters(previous => ({ ...previous, [key]: value, offset: 0 }));
  }
  const filtered = Boolean(filters.q || filters.topic || filters.status || filters.difficulty);
  function clearFilters() { setSearch(""); setTopic(""); setFilters(initialFilters); }

  return <>
    <div className="teacher-heading admin-page-heading">
      <div><h1>Zarządzanie zadaniami</h1><p>Twoje zadania, wersje robocze i materiały gotowe do dalszej pracy.</p></div>
      <Link className="admin-button primary" to="/teacher/tasks/new"><img src={plusIcon} alt="" width={15} height={15} />Utwórz zadanie</Link>
    </div>
    <section className="teacher-metrics" aria-label="Statystyki zadań">
      {taskMetrics.map(metric => <TaskCountMetric key={metric.title} {...metric} revision={revision} />)}
    </section>
    <div className="admin-card teacher-tabs" role="group" aria-label="Status zadań">
      {[["", "Wszystkie"], ...Object.entries(STATUSES)].map(([value, label]) => <button
        key={value} type="button" aria-pressed={filters.status === value}
        onClick={() => filterChange("status", value)}>{label}</button>)}
    </div>
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
      <div className="users-list-heading"><h2>Moje zadania</h2>{!loading && data && <p className="muted">{filtered ? "Wyniki" : "Wszystkie zadania"}: {data.total}</p>}</div>
      {loading ? <p className="admin-state" role="status">Ładowanie zadań…</p>
        : error ? <div className="admin-state" role="alert"><p className="error-message">{error}</p><button className="admin-button" onClick={() => setRevision(value => value + 1)}>Spróbuj ponownie</button></div>
        : !data?.items.length ? <div className="admin-state" role="status"><h2>{filtered ? "Brak pasujących zadań" : "Nie masz jeszcze żadnych zadań"}</h2><p>{filtered ? "Zmień wyszukiwanie lub wyczyść filtry." : "Twoje zadania pojawią się na tej liście."}</p>{filtered && <button className="admin-button" onClick={clearFilters}>Wyczyść filtry</button>}</div>
        : <><div className="users-table-scroll"><table className="users-table teacher-table"><caption className="sr-only">Zadania zalogowanego nauczyciela</caption>
          <thead><tr>{["Zadanie", "Temat i poziom", "Typ", "Stan", "Aktualizacja", "Akcje"].map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{data.items.map(task => <tr key={task.id}>
            <td><Link to={`/teacher/tasks/${task.id}`} className="teacher-task-link">{task.title}</Link></td>
            <td>{task.topic} · {DIFFICULTIES[task.difficulty]}</td><td>{TASK_TYPES[task.task_type]}</td>
            <td><span className={`user-badge ${task.status === "READY" ? "status-active" : "task-draft"}`}>{STATUSES[task.status]}</span></td>
            <td><time dateTime={task.updated_at}>{new Date(task.updated_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time></td>
            <td><Link className="teacher-open-link" to={`/teacher/tasks/${task.id}`} aria-label={`Otwórz zadanie: ${task.title}`}>Otwórz</Link></td>
          </tr>)}</tbody>
        </table></div><nav className="admin-pagination" aria-label="Strony listy zadań">
          <button className="admin-button" disabled={filters.offset === 0} onClick={() => setFilters(previous => ({ ...previous, offset: Math.max(0, previous.offset - data.limit) }))}>Poprzednia</button>
          <span>{data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} z {data.total}</span>
          <button className="admin-button" disabled={data.offset + data.limit >= data.total} onClick={() => setFilters(previous => ({ ...previous, offset: previous.offset + data.limit }))}>Następna</button>
        </nav></>}
    </section>
  </>;
}
