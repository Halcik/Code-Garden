import AdminNavigation from "../components/admin/AdminNavigation";
import TaskTests from "../components/teacher/TaskTests";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthProvider";
import { DIFFICULTIES, STATUSES, TASK_TYPES } from "../api/tasks";
import { decidePublication, publicationDetail, publicationQueue, PublicationError } from "../api/publication";
import type { PublicationDetail, PublicationHistory } from "../api/publication";
import DesignIcon from "../components/admin/DesignIcon";
import ThemeSwitch from "../components/ThemeSwitch";
import LogoutButton from "../components/LogoutButton";
import badge from "../assets/publication/BadgeCheck1.svg";
import available from "../assets/publication/BadgeCheck2.svg";
import clock from "../assets/publication/Clock3.svg";
import shield from "../assets/publication/ShieldCheck.svg";
import message from "../assets/publication/MessageSquareWarning.svg";
import eyeOff from "../assets/publication/EyeOff.svg";
import "../styles/admin-users.css";
import "../styles/teacher-tasks.css";
import "../styles/publication.css";
import "../styles/task-editor.css";
const PythonCodeEditor = lazy(() => import("../components/PythonCodeEditor"));

const date = (value: string) => new Date(value).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });

export function PublicationHistoryList({ history }: { history: PublicationHistory[] }) {
  return <section className="admin-card publication-panel" aria-label="Historia recenzji zadania"><h2>Historia recenzji zadania</h2>
    {!history.length ? <p className="muted">Brak decyzji recenzentów.</p> : history.map(item => <article className="publication-history" key={item.id}>
      <strong>{item.stage === "TEACHER" ? "Nauczyciel" : "Administrator"} · {item.decision === "ACCEPTED" ? "Zatwierdzono" : "Do poprawy"}</strong>
      <small>{item.reviewer_login} · Runda {item.publication_round} · {date(item.created_at)}</small>
      {item.comment && <p>{item.comment}</p>}
    </article>)}
  </section>;
}

export function AuthorPublicationHistory({ taskId, revision = 0 }: { taskId: string; revision?: number }) {
  const [data, setData] = useState<PublicationDetail | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setError("");
    publicationDetail(taskId, controller.signal).then(value => { if (!controller.signal.aborted) setData(value); })
      .catch(reason => { if (!controller.signal.aborted) setError(reason.message); });
    return () => controller.abort();
  }, [taskId, revision, attempt]);
  return error ? <div role="alert">{error}<button className="admin-button" onClick={() => setAttempt(n => n + 1)}>Odśwież historię</button></div>
    : data ? <PublicationHistoryList history={data.history ?? []} /> : <p role="status">Ładowanie historii publikacji…</p>;
}

function Workflow({ status }: { status?: string }) {
  const step = status === "PUBLISHED" ? 4 : status === "PENDING_ADMIN_REVIEW" ? 3 : 2;
  return <div className="publication-workflow admin-card">{["Autor zgłosił", "Niezależny nauczyciel", "Administrator", "Katalog publiczny"].map((label, i) =>
    <div key={label} className={i + 1 <= step ? "is-current" : ""}><span>{i + 1 < step ? "✓" : i + 1}</span><div><strong>{label}</strong>
      <small>{i === 3 ? "Po obu zatwierdzeniach" : i + 1 === step ? "Aktualny etap" : i + 1 < step ? "Zakończono" : "Oczekuje"}</small></div>{i < 3 && <b>→</b>}</div>)}</div>;
}

export default function PublicationReviewsPage({ admin = false }: { admin?: boolean }) {
  const { taskId } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const base = admin ? "/admin/reviews" : "/teacher/reviews";
  const [filters, setFilters] = useState({ q: "", topic: "", difficulty: "", sort: "newest", offset: 0 });
  const [queue, setQueue] = useState<Awaited<ReturnType<typeof publicationQueue>> | null>(null);
  const [detail, setDetail] = useState<PublicationDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [decisionError, setDecisionError] = useState("");
  const lock = useRef(false);
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setDetail(null); setComment("");
    const work = taskId ? publicationDetail(taskId, controller.signal).then(value => { if (!controller.signal.aborted) setDetail(value); })
      : publicationQueue(admin, new URLSearchParams(Object.entries(filters).map(([k, v]) => [k, String(v)]).filter(([, v]) => v !== "")), controller.signal)
        .then(value => { if (!controller.signal.aborted) { setQueue(value); } });
    work.catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [admin, taskId, filters, attempt]);
  async function decide(decision: "ACCEPTED" | "CHANGES_REQUESTED") {
    if (lock.current || !detail) return;
    if (decision === "CHANGES_REQUESTED" && !comment.trim()) { setDecisionError("Napisz, co autor powinien poprawić."); return; }
    lock.current = true; setBusy(true); setDecisionError("");
    try { await decidePublication(admin, detail.task.id, detail.task.publication_round, decision, comment.trim()); navigate(base, { state: { publicationDecision: true } }); }
    catch (reason) {
      setDecisionError(reason instanceof Error ? reason.message : "Nie udało się zapisać decyzji.");
      if (reason instanceof PublicationError && reason.status === 409) { setAttempt(n => n + 1); }
    } finally { lock.current = false; setBusy(false); }
  }
  const actions = detail && detail.task.author_id !== user?.id && !detail.task.is_archived && detail.task.status === (admin ? "PENDING_ADMIN_REVIEW" : "PENDING_TEACHER_REVIEW")
    ? <div className="publication-actions"><button type="button" className="admin-button" disabled={busy} onClick={() => decide("CHANGES_REQUESTED")}><img src={message} alt="" />Poproś o poprawki</button>
      <button type="button" className="admin-button primary" disabled={busy} onClick={() => decide("ACCEPTED")}><img src={badge} alt="" />{admin ? "Zatwierdź publikację" : "Zatwierdź jako nauczyciel"}</button></div> : null;
  const content = <div className="publication-page">
    {taskId && <Link className="teacher-open-link" to={base}>Recenzje zadań publicznych / Kolejka</Link>}
    <header className="admin-page-heading publication-heading"><div><h1>{detail ? `${detail.task.title} · ${detail.task.status === "PUBLISHED" ? "Podgląd zadania publicznego" : admin ? "Zatwierdzenie administratora" : "Recenzja nauczyciela"}` : admin ? "Recenzje i zatwierdzenia" : "Recenzje zadań publicznych"}</h1>
      <p>{taskId ? "Sprawdź pełną treść zadania przed podjęciem decyzji." : admin ? "Zatwierdzaj publikację zadań po niezależnej recenzji nauczyciela." : "Sprawdzaj zadania innych nauczycieli przed przekazaniem ich do zatwierdzenia administratorowi."}</p></div>{actions}</header>
    {loading ? <p role="status">Ładowanie recenzji…</p> : error ? <div className="admin-card admin-state" role="alert"><p>{error}</p><button className="admin-button" onClick={() => setAttempt(n => n + 1)}>Spróbuj ponownie</button><Link to={base}>Wróć do kolejki</Link></div>
      : detail ? <>
        <div className="publication-chips"><span>{detail.task.topic}</span><span>{DIFFICULTIES[detail.task.difficulty]}</span><span>{STATUSES[detail.task.status]}</span></div>
        <Workflow status={detail.task.status} />
        <div className="publication-columns"><div className="publication-main">
          <section className="admin-card publication-panel"><h2>Podgląd zadania</h2><p className="muted">Dokładnie tak zobaczą je uczniowie</p><p>{detail.task.description}</p><p>{detail.task.instructions}</p>
            <hr /><h3>Krótka teoria</h3><p>{detail.task.theory || "Brak teorii."}</p></section>
          <section className="admin-card publication-panel publication-code"><h2>Kod startowy</h2><Suspense fallback={<p role="status">Ładowanie edytora kodu…</p>}><PythonCodeEditor value={detail.task.starter_code ?? ""} onChange={() => {}} readOnly height={280} ariaLabel="Kod startowy zadania — tylko do odczytu" /></Suspense></section>
          <TaskTests readOnly hideActions providedTests={detail.tests} />
          <section className="admin-card publication-panel"><h2>Podpowiedzi</h2><p className="muted">{detail.hints.length} podpowiedzi · rosnący poziom szczegółowości</p>
            {detail.hints.map((hint, i) => <article className="publication-hint" key={hint.id}><h3>Podpowiedź {i + 1} · {hint.title}</h3><p>{hint.content}</p></article>)}</section>
          <PublicationHistoryList history={detail.history} />
          {actions && <section className="admin-card publication-panel publication-decision"><h2>Komentarz recenzenta</h2><p className="publication-placeholder">Zatwierdzenie dotyczy bieżącej treści. Istotne zmiany wymagają ponownej recenzji nauczyciela i administratora.</p>
            <label className="publication-comment">Komentarz do decyzji<textarea rows={5} maxLength={5000} value={comment} disabled={busy} placeholder="Dodaj uzasadnienie, jeśli prosisz o wprowadzenie poprawek…" onChange={e => setComment(e.target.value)} /></label>
            {decisionError && <p role="alert" className="error-message">{decisionError}</p>}{actions}</section>}
        </div><aside className="publication-side"><section className="admin-card publication-panel"><h2>Autor</h2><strong>{detail.author_login}</strong><p className="muted">Nauczyciel</p><hr /><dl>
          <dt>Zgłoszono</dt><dd>{detail.task.publication_submitted_at ? date(detail.task.publication_submitted_at) : "—"}</dd><dt>Typ zadania</dt><dd>{TASK_TYPES[detail.task.task_type]}</dd>
          <dt>Środowisko</dt><dd>Python {detail.task.python_version}</dd><dt>Limit czasu</dt><dd>{detail.task.time_limit_seconds} s</dd><dt>Pamięć</dt><dd>{detail.task.memory_limit_mb} MB</dd><dt>Szacowany czas</dt><dd>{detail.task.estimated_time_minutes ? `${detail.task.estimated_time_minutes} min` : "—"}</dd></dl></section>
          <section className="admin-card publication-panel"><h2>Lista kontrolna recenzji</h2>{["Jednoznaczny opis", "Testy obejmują wartości graniczne", "Podpowiedzi stopniowo zwiększają szczegółowość", "Poziom trudności jest odpowiedni"].map(label => <label className="publication-check" key={label}><input type="checkbox" />{label}</label>)}</section>
        </aside></div>
      </> : <>
        <div className="publication-notice"><img src={badge} alt="" /><div><strong>Publikacja wymaga zatwierdzenia przez jednego niezależnego nauczyciela i jednego administratora</strong><p>Własne zadania nie pojawiają się w kolejce recenzji. Akceptacja nauczyciela nie publikuje zadania.</p></div></div>
        <section className="teacher-metrics" aria-label="Statystyki recenzji">{[
          ["Dostępne do Twojej recenzji", queue?.total ?? 0, available], ["Oczekuje na nauczyciela", queue?.metrics.PENDING_TEACHER_REVIEW ?? 0, clock],
          ["Oczekuje na administratora", queue?.metrics.PENDING_ADMIN_REVIEW ?? 0, shield], ["Wymagane poprawki", (queue?.metrics.CHANGES_REQUESTED_BY_TEACHER ?? 0) + (queue?.metrics.CHANGES_REQUESTED_BY_ADMIN ?? 0), message],
        ].map(([label, value, icon]) => <article className="admin-card teacher-metric" key={label}><div className="teacher-metric-heading"><h2>{label}</h2><img src={String(icon)} alt="" /></div><p className="teacher-metric-value">{value}</p></article>)}</section>
        <section className="admin-card admin-filters publication-filters" aria-label="Filtry recenzji"><label><span className="sr-only">Szukaj zadania</span><input type="search" maxLength={200} placeholder="Szukaj zadania…" value={filters.q} onChange={e => setFilters({ ...filters, q: e.target.value, offset: 0 })} /></label>
          <label><span className="sr-only">Temat</span><input placeholder="Temat: Wszystkie" maxLength={100} value={filters.topic} onChange={e => setFilters({ ...filters, topic: e.target.value, offset: 0 })} /></label>
          <label><span className="sr-only">Trudność</span><select value={filters.difficulty} onChange={e => setFilters({ ...filters, difficulty: e.target.value, offset: 0 })}><option value="">Trudność: Wszystkie</option>{Object.entries(DIFFICULTIES).map(([v, label]) => <option key={v} value={v}>{label}</option>)}</select></label>
          <label><span className="sr-only">Sortowanie</span><select value={filters.sort} onChange={e => setFilters({ ...filters, sort: e.target.value, offset: 0 })}><option value="newest">Zgłoszone: Najnowsze</option><option value="oldest">Zgłoszone: Najstarsze</option></select></label></section>
        <div className="admin-card publication-rule"><img src={message} alt="" /><div><strong>Zasada edycji po zgłoszeniu</strong><p>W czasie recenzji treść jest tylko do odczytu. Po zwrocie do poprawy autor może edytować zadanie. Ponowne zgłoszenie rozpoczyna recenzję nauczyciela.</p></div></div>
        <section className="admin-card users-list"><div className="users-list-heading"><h2>{admin ? "Centralna kolejka recenzji" : "Kolejka zadań do recenzji"}</h2><p className="muted">{admin ? "Zadania zaakceptowane przez niezależnego nauczyciela" : "Zadania autorstwa bieżącego nauczyciela nie pojawiają się tutaj"}</p></div>
          {!queue?.items.length ? <p className="admin-state" role="status">Brak zadań oczekujących na recenzję.</p> : <div className="users-table-scroll"><table className="users-table publication-table"><thead><tr>{["Zadanie", "Autor", "Temat / trudność", "Nauczyciel", "Administrator", "Zgłoszono", "Akcja"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>{queue.items.map(task => <tr key={task.id}>
            <td><strong>{task.title}</strong></td><td>{task.author_login}</td><td>{task.topic}<small>{DIFFICULTIES[task.difficulty]}</small></td><td><span className="publication-status">{admin ? "Zatwierdzono" : "Oczekuje na Ciebie"}</span></td><td>{admin ? "Oczekuje" : "Nierozpoczęte"}</td><td>{task.publication_submitted_at ? date(task.publication_submitted_at) : "—"}</td><td><Link className="teacher-open-link" to={`${base}/${task.id}`}>Przejrzyj →</Link></td>
          </tr>)}</tbody></table></div>}
          {queue && queue.total > 0 && <nav className="admin-pagination" aria-label="Strony recenzji"><button className="admin-button" disabled={!filters.offset} onClick={() => setFilters({ ...filters, offset: Math.max(0, filters.offset - queue.limit) })}>Poprzednia</button><span>{filters.offset + 1}–{Math.min(filters.offset + queue.limit, queue.total)} z {queue.total}</span><button className="admin-button" disabled={filters.offset + queue.limit >= queue.total} onClick={() => setFilters({ ...filters, offset: filters.offset + queue.limit })}>Następna</button></nav>}
        </section>
        {!admin && <div className="publication-rule"><img src={eyeOff} alt="" /><p>Własne zadania pozostają dostępne w sekcji Zadania.</p><Link className="teacher-open-link" to="/teacher/tasks">Otwórz mój proces publikacji →</Link></div>}
      </>}
  </div>;
  return admin ? <div className="admin-layout teacher-layout"><aside className="admin-sidebar"><div className="admin-brand"><DesignIcon name="CodeGardenLogo" /><strong>Code Garden</strong></div><AdminNavigation /><div className="admin-sidebar-footer"><div className="admin-identity"><DesignIcon name="Avatar" /><div><strong>{user?.login}</strong><span>Administrator</span></div></div><LogoutButton /></div></aside><div className="admin-application"><header className="admin-topbar"><span>Administracja / Recenzje</span><ThemeSwitch /></header><main className="admin-content">{content}</main></div></div> : content;
}
