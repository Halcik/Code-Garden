import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { submissionQueue } from "../api/teacherSubmissions";
import type { SubmissionQueue } from "../api/teacherSubmissions";
import { useTheme } from "../theme/ThemeProvider";
import avatar from "../assets/submissions/list-Avatar.svg";
import darkAvatar from "../assets/submissions/dark-Avatar.svg";
import inbox from "../assets/submissions/queue-Inbox.svg";
import check from "../assets/submissions/queue-CircleCheckBig.svg";
import rotate from "../assets/submissions/queue-RotateCcw.svg";
import alert from "../assets/submissions/queue-TriangleAlert.svg";
import lightInbox from "../assets/submissions/queue-light-Inbox.svg";
import lightCheck from "../assets/submissions/queue-light-CircleCheckBig.svg";
import lightRotate from "../assets/submissions/queue-light-RotateCcw.svg";
import lightAlert from "../assets/submissions/queue-light-TriangleAlert.svg";
import "../styles/teacher-submissions.css";

const initial = { q: "", task: "", sort: "newest", offset: 0 };
export default function TeacherSubmissionQueuePage() {
  const { theme } = useTheme();
  const [filters, setFilters] = useState(initial);
  const [data, setData] = useState<SubmissionQueue | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [retry, setRetry] = useState(0);
  const [tab, setTab] = useState("pending");
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError("");
    submissionQueue(filters, controller.signal).then(result => {
      if (!controller.signal.aborted) setData(result);
    }).catch(reason => { if (!controller.signal.aborted) { setError(reason.message); setData(null); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [filters, retry]);
  const change = (key: "q" | "task" | "sort", value: string) => setFilters(previous => ({ ...previous, [key]: value, offset: 0 }));
  return <>
    <div className="admin-page-heading"><h1>Prace uczniów</h1><p>Przeglądaj formalnie wysłane rozwiązania uczniów i wyniki testów automatycznych.</p></div>
    <section className="submission-queue-metrics" aria-label="Podsumowanie prac uczniów">
      {[{ label: "Do przejrzenia", icon: theme === "dark" ? inbox : lightInbox, value: loading ? "…" : data?.total ?? "—", note: "Najnowsza wersja każdego ucznia i zadania" },
        { label: "Zaakceptowane w tym tygodniu", icon: theme === "dark" ? check : lightCheck, value: "—", note: "Dostępne po włączeniu oceniania" },
        { label: "Wymaga poprawy", icon: theme === "dark" ? rotate : lightRotate, value: "—", note: "Dostępne po włączeniu oceniania" },
        { label: "Priorytet po terminie", icon: theme === "dark" ? alert : lightAlert, value: "—", note: "Brak ustalonych terminów" }].map(metric =>
        <article className="admin-card teacher-metric" key={metric.label}><div className="teacher-metric-heading"><h2>{metric.label}</h2><span className="teacher-metric-icon"><img src={metric.icon} alt="" /></span></div>
          <p className="teacher-metric-value">{metric.value}</p><p className="teacher-metric-note">{metric.note}</p></article>)}
    </section>
    <div className="admin-card teacher-tabs" role="group" aria-label="Kolejki prac uczniów">
      <button aria-pressed={tab === "pending"} onClick={() => setTab("pending")}>Do przejrzenia {data?.total ?? ""}</button>
      <button disabled title="Dostępne po włączeniu oceniania">Zaakceptowane</button><button disabled title="Dostępne po włączeniu oceniania">Do poprawy</button>
      <button aria-pressed={tab === "all"} onClick={() => setTab("all")}>Wszystkie {data?.total ?? ""}</button>
    </div>
    <section className="admin-card admin-filters submission-queue-filters" aria-label="Filtry prac uczniów">
      <label className="admin-search"><span className="sr-only">Szukaj ucznia lub zadania</span><input type="search" maxLength={200} placeholder="Szukaj ucznia lub zadania" value={filters.q} onChange={e => change("q", e.target.value)} /></label>
      <label><span className="sr-only">Grupa</span><select disabled title="Grupy nie są jeszcze dostępne"><option>Grupa: Wszystkie</option></select></label>
      <label><span className="sr-only">Zadanie</span><select value={filters.task} onChange={e => change("task", e.target.value)}><option value="">Zadanie: Wszystkie</option>{data?.tasks.map(task => <option key={task.id} value={task.id}>{task.title}</option>)}</select></label>
      <label><span className="sr-only">Priorytet</span><select disabled title="Priorytety nie są jeszcze dostępne"><option>Priorytet: Dowolny</option></select></label>
      <label><span className="sr-only">Sortowanie</span><select value={filters.sort} onChange={e => change("sort", e.target.value)}><option value="newest">Najnowsze</option><option value="oldest">Najstarsze</option></select></label>
    </section>
    <section className="admin-card users-list submission-queue-list" aria-label="Kolejka oceniania" aria-busy={loading}>
      <div className="users-list-heading"><h2>Kolejka oceniania</h2></div>
      {loading ? <p className="admin-state" role="status">Ładowanie prac uczniów…</p> : error ? <div className="admin-state" role="alert"><p>{error}</p><button className="admin-button" onClick={() => setRetry(n => n + 1)}>Spróbuj ponownie</button></div>
        : !data?.items.length ? <p className="admin-state" role="status">{filters.q || filters.task ? "Brak prac pasujących do filtrów." : "Żaden uczeń nie wysłał jeszcze rozwiązania Twoich zadań."}</p>
          : <div className="users-table-scroll"><table className="users-table submission-queue-table"><thead><tr>{["Uczeń", "Zadanie / temat / wysłano", "Testy automatyczne", "Rozwiązania / podpowiedzi", "Ocena / priorytet", "Akcja"].map(label => <th key={label}>{label}</th>)}</tr></thead>
            <tbody>{data.items.map(row => <tr key={`${row.task.id}:${row.student.id}`}><td><span className="submission-student"><img src={theme === "dark" ? darkAvatar : avatar} alt="" /><strong>{row.student.login}</strong></span></td>
              <td><strong>{row.task.title}</strong><small>{row.task.topic} · <time dateTime={row.latest_submission.submitted_at}>{new Date(row.latest_submission.submitted_at).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" })}</time></small></td>
              <td><span className={`submission-chip ${row.latest_submission.all_passed ? "passed" : "failed"}`}>{row.latest_submission.passed_tests} / {row.latest_submission.total_tests} testów</span></td>
              <td>{row.submission_count} wersji<small>{row.used_hint_count} wykorzystanych podpowiedzi</small></td>
              <td><span className="submission-chip failed">Do przejrzenia</span><small>Priorytet: —</small></td>
              <td><Link className="teacher-open-link" to={`/teacher/submissions/tasks/${row.task.id}/students/${row.student.id}`}>Zobacz rozwiązanie →</Link></td></tr>)}</tbody></table></div>}
    </section>
    {data && data.total > 0 && !loading && !error && <nav className="admin-pagination" aria-label="Strony prac uczniów"><span>Wyświetlono {data.offset + 1}–{Math.min(data.offset + data.limit, data.total)} z {data.total} prac</span>
      <div className="submission-pagination-actions"><button className="admin-text-button" disabled={data.offset === 0} onClick={() => setFilters(previous => ({ ...previous, offset: Math.max(0, previous.offset - data.limit) }))}>Poprzednia</button>
        <button className="admin-text-button" disabled={data.offset + data.limit >= data.total} onClick={() => setFilters(previous => ({ ...previous, offset: previous.offset + data.limit }))}>Następna</button></div></nav>}
  </>;
}
