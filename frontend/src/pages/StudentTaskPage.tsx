import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { checkStudentSolution, getStudentTask, runStudentCode } from "../api/studentTasks";
import type { CheckResult, RunResult, StudentTaskDetail } from "../api/studentTasks";
import { TasksApiError } from "../api/tasks";
import { useAuth } from "../auth/AuthProvider";
import ExecutionResult, { ExecutionSummary } from "../components/ExecutionResult";
import TaskBadges from "../components/TaskBadges";
import StudentTaskHints from "../components/StudentTaskHints";
import SolutionCheckResult, { SolutionCheckSummary } from "../components/SolutionCheckResult";
import "../styles/student-task.css";
import { useSolutionDraft } from "../components/useSolutionDraft";
import { submitSolution } from "../api/solutions";
import type { SubmissionSummary } from "../api/solutions";
import SubmitConfirmation from "../components/SubmitConfirmation";

const PythonCodeEditor = lazy(() => import("../components/PythonCodeEditor"));

function TaskWorkspace({ task }: { task: StudentTaskDetail }) {
  // The task owns the starter; only this mounted workspace owns the student's edits.
  const work = useSolutionDraft(task.id);
  const studentCode = work.code;
  const setStudentCode = work.edit;
  const [checkedCode, setCheckedCode] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submitPending = useRef(false);
  const [confirming, setConfirming] = useState(false);
  const [submitMessage, setSubmitMessage] = useState("");
  const [submitError, setSubmitError] = useState("");
  const [latest, setLatest] = useState<SubmissionSummary | null>(null);
  const [stdin, setStdin] = useState("");
  const [running, setRunning] = useState(false);
  const runPending = useRef(false);
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const { retrySession } = useAuth();
  const [checking, setChecking] = useState(false);
  const checkPending = useRef(false);
  const [checkError, setCheckError] = useState("");
  const [checkResult, setCheckResult] = useState<CheckResult | null>(null);
  const hydrated = useRef(false);
  useEffect(() => {
    if (work.draft && !hydrated.current) {
      hydrated.current = true;
      setCheckResult(work.draft.last_check);
      setCheckedCode(work.draft.check_is_current ? work.draft.source_code : null);
      setLatest(work.draft.latest_submission);
    }
  }, [work.draft]);
  async function submit() {
    if (submitPending.current) return;
    submitPending.current = true; setSubmitting(true); setConfirming(false);
    setSubmitError(""); setSubmitMessage("");
    try {
      const revision = await work.flush();
      const value = await submitSolution(task.id, revision);
      setLatest(value.submission); setCheckResult(value.draft.last_check);
      setCheckedCode(value.draft.check_is_current ? value.draft.source_code : null);
      setSubmitMessage(`Rozwiązanie zostało wysłane jako wersja ${value.submission.version}. ${value.submission.passed_tests}/${value.submission.total_tests} testów zaliczonych.`);
    } catch (reason) {
      setSubmitError(reason instanceof Error ? reason.message : "Nie udało się wysłać rozwiązania. Spróbuj ponownie.");
    } finally { submitPending.current = false; setSubmitting(false); }
  }
  async function check() {
    if (checkPending.current) return;
    checkPending.current = true;
    setChecking(true); setCheckError(""); setCheckResult(null);
    try {
      const revision = await work.flush();
      setCheckResult(await checkStudentSolution(task.id, studentCode, revision)); setCheckedCode(studentCode);
    }
    catch (reason) {
      setCheckError(reason instanceof TasksApiError ? reason.message : "Nie udało się połączyć z usługą sprawdzania. Spróbuj ponownie.");
      if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    } finally { checkPending.current = false; setChecking(false); }
  }
  async function run() {
    if (runPending.current) return;
    runPending.current = true;
    setRunning(true); setRunError(""); setResult(null);
    try { setResult(await runStudentCode(task.id, studentCode, stdin)); }
    catch (reason) {
      setRunError(reason instanceof TasksApiError ? reason.message : "Nie udało się połączyć z usługą uruchamiania kodu. Spróbuj ponownie.");
      if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    } finally { runPending.current = false; setRunning(false); }
  }
  return <div className="student-task-detail" data-run-status={result?.status}>
    <header className="student-task-header">
      <div className="student-task-identity">
        <nav className="student-task-breadcrumb" aria-label="Ścieżka zadania"><Link to="/student/tasks">Zadania</Link><span>/ {task.topic}</span></nav>
        <h1>{task.title}</h1><TaskBadges task={task} />
        <p className="student-task-time">{task.estimated_time_minutes == null ? "Czas nieokreślony" : `Szacowany czas: ~${task.estimated_time_minutes} min`}</p>
      </div>
      <div className="student-task-actions"><button className="admin-button" disabled={!work.draft} onClick={() => { void work.flush().catch(() => {}); }}><span className="student-detail-icon" data-icon="save" aria-hidden="true" />Zapisz wersję roboczą</button><button className="admin-button primary" disabled={!work.draft || submitting || checking} onClick={() => setConfirming(true)}><span className="student-detail-icon" data-icon="send" aria-hidden="true" />{submitting ? "Wysyłanie…" : "Wyślij rozwiązanie"}</button></div>
    </header>
    {work.draft && work.status.startsWith("Nie udało się") && <p role="alert">{work.status}</p>}
    {!work.draft && <button className="admin-button" onClick={work.retry}>Ponów wczytanie wersji roboczej</button>}
    {confirming && <SubmitConfirmation confirm={() => { void submit(); }} cancel={() => setConfirming(false)} />}
    {submitMessage && <p role="status">{submitMessage}</p>}
    {submitError && <p role="alert">{submitError}</p>}
    {latest && <p>Ostatnio wysłano: wersja {latest.version} — {latest.passed_tests}/{latest.total_tests} testów — {new Date(latest.submitted_at).toLocaleString("pl-PL")}</p>}
    <div className="student-task-workspace">
      <div className="student-task-materials">
        <section className="admin-card student-material-card" aria-labelledby="student-instructions-title" id="student-task-instructions">
          <h2 id="student-instructions-title">Treść zadania</h2>
          {task.description.trim() && <p className="student-task-text">{task.description}</p>}
          {task.instructions?.trim() ? <p className="student-task-text">{task.instructions}</p> : !task.description.trim() && <p className="student-task-text">Brak opisu zadania.</p>}
        </section>
        <section className="admin-card student-material-card" aria-labelledby="student-theory-title" id="student-task-theory"><h2 id="student-theory-title">Krótka teoria</h2><p className="student-task-text student-theory-text">{task.theory?.trim() ? task.theory : "Do tego zadania nie dodano teorii."}</p></section>
        <StudentTaskHints taskId={task.id} />
        <section className="admin-card student-material-card student-teacher-comment" aria-labelledby="student-comment-title"><h2 id="student-comment-title">Komentarz nauczyciela</h2><p className="student-placeholder-copy">Tutaj pojawi się komentarz nauczyciela do Twojego rozwiązania.</p></section>
      </div>
      <section className="student-coding-area" aria-label="Kod ucznia">
        <div className="student-code-panel">
          <div className="student-code-toolbar"><div><span className="student-detail-icon" data-icon="file" aria-hidden="true" /><span>solution.py</span><span className="student-code-language">Python</span></div><span>Twój kod</span></div>
          {work.draft ? <Suspense fallback={<p className="admin-state" role="status">Ładowanie edytora kodu…</p>}><PythonCodeEditor value={studentCode} onChange={setStudentCode} readOnly={!work.draft} height={360} ariaLabel="Twój kod Python" /></Suspense> : <p role="status">{work.status}</p>}
        </div>
        <div className="student-run-controls">
          <section className="admin-card student-input-card" aria-label="Dane wejściowe"><label htmlFor="student-stdin">Dane wejściowe</label><textarea id="student-stdin" value={stdin} onChange={event => setStdin(event.target.value)} placeholder="Tutaj podasz dane wejściowe programu" /></section>
          <div className="student-execution-actions">
            <button className="admin-button primary" disabled={running || !work.draft} onClick={run}><span className="student-detail-icon" data-icon="play" aria-hidden="true" />{running ? "Uruchamianie…" : "Uruchom kod"}</button>
            <button className="admin-button primary" disabled={checking || submitting || !work.draft} onClick={check}>{checking ? "Sprawdzanie…" : "Sprawdź rozwiązanie"}</button>
          </div>
        </div>
        {runError && <p role="alert" className="error-message">{runError}</p>}
        <section className="student-output-panel" aria-labelledby="student-output-title" aria-busy={running}>
          <header className="student-output-header"><h2 id="student-output-title" aria-label="Wynik uruchomienia">Wynik</h2>{result && <ExecutionSummary result={result} />}</header>
          <div className="student-output-content" aria-live="polite">
            {result ? <ExecutionResult result={result} /> : <p className="student-placeholder-copy">{running ? "Oczekiwanie na wynik…" : runError ? "Możesz ponownie uruchomić kod." : "Uruchom kod, aby zobaczyć wynik programu."}</p>}
          </div>
        </section>
        <section className="admin-card student-material-card solution-check-card" aria-labelledby="student-tests-title" aria-busy={checking}>
          <header className="solution-check-header">
            <div><h2 id="student-tests-title">Testy automatyczne</h2><p>{checking ? "Trwa sprawdzanie rozwiązania" : checkResult ? "Wynik ostatniego sprawdzenia" : "Sprawdź kod na testach zadania"}</p></div>
            {checkResult && <SolutionCheckSummary result={checkResult} />}
          </header>
          {checkResult && checkedCode !== studentCode && <p role="status">Kod został zmieniony od ostatniego sprawdzenia.</p>}
          {checkError && <p role="alert" className="error-message">{checkError}</p>}
          <div aria-live="polite">{checking ? <p role="status">Oczekiwanie na wyniki testów…</p> : checkResult ? <SolutionCheckResult result={checkResult} /> : <p className="student-placeholder-copy">Sprawdź rozwiązanie, aby zobaczyć wyniki testów.</p>}</div>
          <footer className="solution-check-footer">
            <p>{checkResult?.total ? "Kliknij publiczny test, aby zobaczyć szczegóły." : "Testy zadania działają niezależnie od Twoich danych stdin."}</p>
          </footer>
        </section>
      </section>
    </div>
  </div>;
}

function StudentTaskContent({ taskId }: { taskId: string }) {
  const { retrySession } = useAuth();
  const [task, setTask] = useState<StudentTaskDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notFound, setNotFound] = useState(false);
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setNotFound(false);
    getStudentTask(taskId, controller.signal).then(result => {
      if (!controller.signal.aborted) setTask(result);
    }).catch(reason => {
      if (controller.signal.aborted) return;
      setError(reason instanceof Error ? reason.message : "Nie można pobrać zadania. Sprawdź połączenie i spróbuj ponownie.");
      if (reason instanceof TasksApiError) {
        setNotFound(reason.status === 404);
        if ([401, 403].includes(reason.status)) retrySession();
      }
    }).finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [taskId, attempt, retrySession]);
  if (loading) return <div className="admin-card admin-state" role="status">Ładowanie zadania…</div>;
  if (error) return <section className="admin-card admin-state" role="alert"><h1>{notFound ? "Zadanie niedostępne" : "Nie udało się wczytać zadania"}</h1><p className="error-message">{error}</p><div className="student-task-actions">{!notFound && <button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button>}<Link className="admin-button" to="/student/tasks">Wróć do katalogu zadań</Link></div></section>;
  return task && <TaskWorkspace key={task.id} task={task} />;
}

export default function StudentTaskPage() {
  const { taskId } = useParams();
  return taskId ? <StudentTaskContent key={taskId} taskId={taskId} /> : null;
}
