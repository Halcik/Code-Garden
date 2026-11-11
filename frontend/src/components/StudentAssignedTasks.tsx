import { useEffect, useState } from "react";
import { listStudentTasks } from "../api/studentTasks";
import type { CatalogFilters, StudentTaskList } from "../api/studentTasks";
import { TasksApiError } from "../api/tasks";
import { useAuth } from "../auth/AuthProvider";
import StudentTaskCard from "./StudentTaskCard";
import clipboardIcon from "../assets/teacher/clipboard-list.svg";

export default function StudentAssignedTasks({ filters }: { filters: CatalogFilters }) {
  const { retrySession } = useAuth();
  const [data, setData] = useState<StudentTaskList | null>(null);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    listStudentTasks({ ...filters, offset, view: "assigned" }, controller.signal)
      .then(result => {
        if (controller.signal.aborted) return;
        if (result.total > 0 && offset >= result.total) setOffset(Math.floor((result.total - 1) / result.limit) * result.limit);
        setData(result);
      })
      .catch(reason => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Nie udało się pobrać przypisanych zadań.");
        if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
      }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters.search, filters.topic, filters.difficulty, filters.task_type, filters.sort_by, filters.sort_order, filters.progress_status, filters.overdue, offset, attempt, retrySession]);
  return <section className="student-assigned-section" aria-label="Przypisane zadania" aria-busy={loading}>
    <div className="student-section-heading"><div><h2>Zadania przypisane przez nauczyciela</h2></div></div>
    {loading ? <p className="admin-card admin-state" role="status">Ładowanie przypisanych zadań…</p>
      : error ? <div className="admin-card admin-state" role="alert"><p>{error}</p><button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Odśwież przypisane zadania</button></div>
      : !data?.items.length ? <div className="admin-card student-assigned-empty"><span className="student-topic-icon" aria-hidden="true"><span style={{ maskImage: `url("${clipboardIcon}")` }} /></span><div><h3>{filters.overdue === "true" ? "Brak zadań po terminie" : "Brak przypisanych zadań"}</h3><p>Możesz ćwiczyć samodzielnie, wybierając zadania z katalogu poniżej.</p></div></div>
      : <><div className="student-task-grid">{data.items.map(task => <StudentTaskCard key={task.id} task={task} />)}</div>
        <nav className="admin-pagination student-pagination" aria-label="Strony przypisanych zadań">
          <button className="admin-button" disabled={!data.offset} onClick={() => setOffset(Math.max(0, data.offset - data.limit))}>Poprzednie przypisane</button>
          <span>{data.offset + 1}–{data.offset + data.items.length} z {data.total}</span>
          <button className="admin-button" disabled={data.offset + data.limit >= data.total} onClick={() => setOffset(data.offset + data.limit)}>Następne przypisane</button>
        </nav></>}
  </section>;
}
