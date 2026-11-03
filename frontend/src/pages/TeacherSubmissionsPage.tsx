import { lazy, Suspense, useEffect, useState } from "react";
import { Link, useLocation, useParams } from "react-router-dom";
import { getTask } from "../api/tasks";
import type { Task } from "../api/tasks";
import { listSubmissions, submissionHistory, submissionDetail } from "../api/teacherSubmissions";
import type { SubmissionList, SubmissionHistory, SubmissionDetail, Version, TestSnapshot } from "../api/teacherSubmissions";
const PythonCodeEditor = lazy(() => import("../components/PythonCodeEditor"));
import { useTheme } from "../theme/ThemeProvider";
import avatar from "../assets/submissions/list-Avatar.svg";
import darkAvatar from "../assets/submissions/dark-Avatar.svg";
import lightFile from "../assets/submissions/light-FileCode2.svg";
import darkFile from "../assets/submissions/dark-FileCode2.svg";
import lightCheck from "../assets/submissions/light-Check.svg";
import darkCheck from "../assets/submissions/dark-Check.svg";
import "../styles/teacher-submissions.css";
import SubmissionReview from "../components/teacher/SubmissionReview";
import TeacherStudentNote from "../components/teacher/TeacherStudentNote";
import { REVIEW_LABELS } from "../api/reviews";

const date = (value: string) => new Date(value).toLocaleString("pl-PL", { dateStyle: "short", timeStyle: "short" });
function Score({ value }: { value: Version }) {
  return <span className={`submission-chip ${value.all_passed ? "passed" : "failed"}`}>{value.passed_tests} / {value.total_tests} testów</span>;
}
const display = (value: unknown) => typeof value === "string" ? value : JSON.stringify(value, null, 2);
const structuralRules: Record<string, string> = {
  FUNCTION_EXISTS: "Kod powinien zawierać funkcję", CLASS_EXISTS: "Kod powinien zawierać klasę",
  CALLS_FUNCTION: "Kod powinien wywoływać funkcję", USES_FOR: "Kod powinien zawierać pętlę for",
  USES_WHILE: "Kod powinien zawierać pętlę while", USES_IF: "Kod powinien zawierać instrukcję if",
};
function TestResult({ test }: { test: TestSnapshot }) {
  const { theme } = useTheme();
  const passed = test.result.status === "passed";
  const details = test.result.details;
  const config = test.definition.config ?? {};
  const rule = typeof config.rule_type === "string" ? config.rule_type : null;
  let expectation = "Brak zapisanego oczekiwania.";
  if (test.definition.test_type === "STRUCTURAL" && rule) {
    expectation = `${structuralRules[rule] ?? "Kod powinien spełniać zapisaną regułę"}${typeof config.expected_value === "string" && config.expected_value ? `: ${config.expected_value}` : ""}`;
  } else if (test.definition.test_type === "INPUT_OUTPUT" && typeof config.expected_output === "string") {
    expectation = `Oczekiwane wyjście: ${config.expected_output}`;
  } else if (test.definition.test_type === "FUNCTION" && "expected_result" in config) {
    const args = Array.isArray(config.arguments) ? config.arguments.map(display).join(", ") : "";
    expectation = `${config.function_name ?? "Funkcja"}(${args}) powinno zwrócić: ${display(config.expected_result)}`;
  }
  const actual = test.definition.test_type === "FUNCTION"
    ? details?.has_actual_result ? display(details.actual_result) : undefined : details?.actual_output;
  const executionStatus = details?.execution?.status;
  return <article className="submission-test">
    <div className="submission-test-summary"><span className={`submission-result-icon ${passed ? "passed" : "failed"}`}>
      {passed ? <img src={theme === "dark" ? darkCheck : lightCheck} alt="" /> : "×"}</span>
      <span className="submission-test-name"><strong>{test.definition.name ?? `Test ${test.number}`}</strong>
        <small>{test.definition.test_type}</small>
        <span className="submission-rule-description">{expectation}</span>
        {!passed && actual !== undefined && <span className="submission-rule-description">Otrzymano: {actual || "(puste wyjście)"}</span>}
        {executionStatus === "time_limit_exceeded" && <small>Przekroczono limit czasu.</small>}
        {executionStatus === "execution_error" && <small>Błąd podczas wykonywania kodu.</small>}</span>
      <span className={`submission-chip ${passed ? "passed" : "failed"}`}>{passed ? "PASS" : "FAIL"}</span>
      <span className="submission-chip">{test.definition.is_hidden ? "Ukryty" : "Publiczny"}</span></div>
  </article>;
}

export default function TeacherSubmissionsPage() {
  const { taskId = "", studentId } = useParams();
  const fromQueue = useLocation().pathname.startsWith("/teacher/submissions");
  const { theme } = useTheme();
  const [task, setTask] = useState<Task | null>(null);
  const [list, setList] = useState<SubmissionList | null>(null);
  const [history, setHistory] = useState<SubmissionHistory | null>(null);
  const [selected, setSelected] = useState<number | null>(null);
  const [detail, setDetail] = useState<SubmissionDetail | null>(null);
  const [offset, setOffset] = useState(0);
  const [retry, setRetry] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true); setError(""); setDetail(null); setHistory(null); setSelected(null); setList(null);
    Promise.all([getTask(taskId, controller.signal), studentId
      ? submissionHistory(taskId, studentId, controller.signal) : listSubmissions(taskId, offset, controller.signal)])
      .then(([nextTask, data]) => {
        if (controller.signal.aborted) return;
        setTask(nextTask);
        if ("student" in data) { setHistory(data); setSelected(data.items[0]?.id ?? null); }
        else setList(data);
      }).catch(reason => { if (!controller.signal.aborted) setError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [taskId, studentId, offset, retry]);

  useEffect(() => {
    if (selected === null) return;
    const controller = new AbortController();
    setDetail(null); setDetailError(""); setDetailLoading(true);
    submissionDetail(selected, controller.signal).then(data => {
      if (controller.signal.aborted) return;
      if (data.task_id !== Number(taskId) || data.student.id !== Number(studentId)) throw new Error("Nie znaleziono rozwiązania.");
      setDetail(data);
    }).catch(reason => { if (!controller.signal.aborted) setDetailError(reason.message); })
      .finally(() => { if (!controller.signal.aborted) setDetailLoading(false); });
    return () => controller.abort();
  }, [selected, taskId, studentId, retry]);

  return <>
    <nav aria-label="Ścieżka rozwiązań" className="submission-breadcrumb"><Link to={fromQueue ? "/teacher/submissions" : "/teacher/tasks"}>{fromQueue ? "Prace uczniów" : "Moje zadania"}</Link><span>/</span>
      <Link to={`/teacher/tasks/${taskId}/edit`}>{task?.title ?? "Zadanie"}</Link><span>/</span>
      <Link to={`/teacher/tasks/${taskId}/submissions`}>Rozwiązania uczniów</Link></nav>
    <div className="admin-page-heading"><h1>{studentId ? `${history?.student?.login ?? "Uczeń"} · ${task?.title ?? "Rozwiązania"}${detail ? ` · Wersja ${detail.version}` : ""}` : "Rozwiązania uczniów"}</h1>
      {!studentId && <p>Przeglądaj formalnie wysłane rozwiązania uczniów i wyniki testów automatycznych.</p>}
      {detail && <div className="submission-chips"><Score value={detail} /><span className="submission-chip">{date(detail.submitted_at)}</span>
        <span className="submission-chip">Podpowiedzi: {detail.used_hints.length}</span></div>}</div>
    {loading ? <p role="status">Ładowanie rozwiązań…</p> : error ? <div role="alert"><p>{error}</p><button className="admin-button" onClick={() => setRetry(n => n + 1)}>Spróbuj ponownie</button></div>
      : !studentId ? <section className="admin-card users-list"><div className="users-list-heading"><h2>{task?.title}</h2><p className="muted">Wyłącznie uczniowie z formalnie wysłanym rozwiązaniem.</p></div>
        {!list?.items.length ? <p className="admin-state" role="status">Żaden uczeń nie wysłał jeszcze rozwiązania tego zadania.</p> : <>
          <div className="users-table-scroll"><table className="users-table"><thead><tr><th>Uczeń</th><th>Wysłane wersje</th><th>Ostatnio wysłano</th><th>Testy ostatniej wersji</th><th>Akcje</th></tr></thead>
            <tbody>{list.items.map(row => <tr key={row.student.id}><td><span className="submission-student"><img src={theme === "dark" ? darkAvatar : avatar} alt="" /><strong>{row.student.login}</strong></span>{row.student.status !== "ACTIVE" && <small>Konto nieaktywne</small>}</td>
              <td>{row.submission_count}</td><td><time dateTime={row.latest_submission.submitted_at}>{date(row.latest_submission.submitted_at)}</time></td><td><Score value={row.latest_submission} /></td>
              <td><Link className="teacher-open-link" to={`/teacher/tasks/${taskId}/students/${row.student.id}/submissions`}>Zobacz rozwiązania</Link></td></tr>)}</tbody></table></div>
          <nav className="admin-pagination" aria-label="Strony rozwiązań"><button className="admin-button" disabled={!offset} onClick={() => setOffset(Math.max(0, offset - list.limit))}>Poprzednia</button>
            <span>{offset + 1}–{Math.min(offset + list.limit, list.total)} z {list.total}</span><button className="admin-button" disabled={offset + list.limit >= list.total} onClick={() => setOffset(offset + list.limit)}>Następna</button></nav></>}
      </section> : !history?.items.length ? <p role="status">Ten uczeń nie ma wysłanych rozwiązań tego zadania.</p>
      : <div className="submission-layout"><div className="submission-main" aria-busy={detailLoading}>
        <section className="admin-card submission-panel" aria-labelledby="submission-instructions-title">
          <h2 id="submission-instructions-title">Polecenie</h2>
          {task?.description?.trim() && <p className="submission-instructions">{task.description}</p>}
          {task?.instructions?.trim() ? <p className="submission-instructions">{task.instructions}</p>
            : !task?.description?.trim() && <p>Brak polecenia zadania.</p>}
        </section>
        {detailLoading && <p role="status">Ładowanie wersji…</p>}
        {detailError && <div role="alert"><p>{detailError}</p><button className="admin-button" onClick={() => setRetry(n => n + 1)}>Spróbuj ponownie</button></div>}
        {detail && <><section className="admin-card submission-code"><header><span><img src={theme === "dark" ? darkFile : lightFile} alt="" />solution.py</span><small>Tylko do odczytu · {detail.source_code.split("\n").length} linii</small></header>
          <Suspense fallback={<p role="status">Ładowanie edytora kodu…</p>}><PythonCodeEditor value={detail.source_code} onChange={() => {}} readOnly height={340} ariaLabel="Kod rozwiązania ucznia — tylko do odczytu" /></Suspense></section>
          <section className="admin-card submission-panel"><div className="submission-panel-title"><h2>Wyniki testów automatycznych</h2><Score value={detail} /></div>
            {!detail.test_results.length ? <p>Brak zapisanych wyników testów dla tej wersji.</p> : detail.test_results.map(test => <TestResult key={test.number} test={test} />)}</section>
          <SubmissionReview key={detail.id} submissionId={detail.id} version={detail.version} review={detail.review} onSaved={review => {
            const id = detail.id;
            setDetail(previous => previous?.id === id ? { ...previous, review } : previous);
            setHistory(previous => previous ? { ...previous, items: previous.items.map(item => item.id === id ? { ...item, review } : item) } : previous);
          }} />
          </>}
      </div><aside className="submission-side">
        {detail && <section className="admin-card submission-panel"><h2>Szczegóły rozwiązania</h2><dl className="submission-facts">
          {[["Uczeń", detail.student.login], ["Wersja", detail.version], ["Wysłano", date(detail.submitted_at)], ["Zaliczone", `${detail.passed_tests} z ${detail.total_tests}`],
            ["Podpowiedzi", `${detail.used_hints.length} z ${Math.max(detail.total_hints ?? detail.used_hints.length, detail.used_hints.length)}`], ["Weryfikacja", REVIEW_LABELS[detail.review?.status ?? "PENDING"]]].map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value}</dd></div>)}</dl></section>}
        <section className="admin-card submission-panel"><h2>Przesłane rozwiązania</h2>{history.items.map(version => <button key={version.id} className="submission-version" aria-pressed={selected === version.id} onClick={() => setSelected(version.id)}>
          <strong>Wersja {version.version}</strong><span>{version.passed_tests} / {version.total_tests} testów · {date(version.submitted_at)}</span><span>{REVIEW_LABELS[version.review?.status ?? "PENDING"]}</span></button>)}</section>
        {history.student && <TeacherStudentNote key={history.student.id} studentId={history.student.id} />}
      </aside></div>}
  </>;
}
