import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { getStudentTask, runStudentCode } from "../api/studentTasks";
import type { RunResult, StudentTaskDetail } from "../api/studentTasks";
import { TasksApiError } from "../api/tasks";
import { useAuth } from "../auth/AuthProvider";
import TaskBadges from "../components/TaskBadges";
import StudentTaskHints from "../components/StudentTaskHints";
import "../styles/student-task.css";

const PythonCodeEditor = lazy(() => import("../components/PythonCodeEditor"));

function TaskWorkspace({ task }: { task: StudentTaskDetail }) {
  // The task owns the starter; only this mounted workspace owns the student's edits.
  const [studentCode, setStudentCode] = useState(() => task.starter_code ?? "");
  const [stdin, setStdin] = useState("");
  const [running, setRunning] = useState(false);
  const [runError, setRunError] = useState("");
  const [result, setResult] = useState<RunResult | null>(null);
  const { retrySession } = useAuth();
  async function run() {
    if (running) return;
    setRunning(true); setRunError(""); setResult(null);
    try { setResult(await runStudentCode(task.id, studentCode, stdin)); }
    catch (reason) {
      setRunError(reason instanceof Error ? reason.message : "Nie udało się uruchomić kodu.");
      if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    } finally { setRunning(false); }
  }
  return <div className="student-task-detail" data-run-status={result?.status}>
    <header className="student-task-header">
      <div className="student-task-identity">
        <nav className="student-task-breadcrumb" aria-label="Ścieżka zadania"><Link to="/student/tasks">Zadania</Link><span>/ {task.topic}</span></nav>
        <h1>{task.title}</h1><TaskBadges task={task} />
        <p className="student-task-time">{task.estimated_time_minutes == null ? "Czas nieokreślony" : `Szacowany czas: ~${task.estimated_time_minutes} min`}</p>
      </div>
      <div className="student-task-actions"><button className="admin-button" disabled><span className="student-detail-icon" data-icon="save" aria-hidden="true" />Zapisz wersję roboczą</button><button className="admin-button primary" disabled><span className="student-detail-icon" data-icon="send" aria-hidden="true" />Wyślij rozwiązanie</button></div>
    </header>
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
          <Suspense fallback={<p className="admin-state" role="status">Ładowanie edytora kodu…</p>}><PythonCodeEditor value={studentCode} onChange={setStudentCode} readOnly={false} height={360} ariaLabel="Twój kod Python" /></Suspense>
        </div>
        <div className="student-run-controls">
          <section className="admin-card student-input-card" aria-label="Dane wejściowe"><label htmlFor="student-stdin">Dane wejściowe</label><textarea id="student-stdin" value={stdin} onChange={event => setStdin(event.target.value)} placeholder="Tutaj podasz dane wejściowe programu" /></section>
          <div className="student-execution-actions"><button className="admin-button primary" disabled={running} onClick={run}><span className="student-detail-icon" data-icon="play" aria-hidden="true" />{running ? "Uruchamianie…" : "Uruchom kod"}</button></div>
        </div>
        {running && <p role="status">Twój kod jest uruchamiany.</p>}
        {runError && <p role="alert" className="error-message">{runError}</p>}
        <section className="admin-card student-material-card" aria-labelledby="student-tests-title"><h2 id="student-tests-title">Testy automatyczne</h2><p className="student-placeholder-copy">Po uruchomieniu kodu tutaj pojawią się wyniki testów automatycznych.</p></section>
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
