import type { CheckResult, SolutionTestResult } from "../api/studentTasks";
import ExecutionResult from "./ExecutionResult";
import checkIcon from "../assets/student/test-check.svg";
import failIcon from "../assets/student/test-fail.svg";

function Value({ label, value }: { label: string; value: unknown }) {
  return <div><strong>{label}</strong><pre>{typeof value === "string" ? value : JSON.stringify(value, null, 2)}</pre></div>;
}

function text(value: unknown): string {
  return typeof value === "string" ? value : JSON.stringify(value) ?? "";
}

function preview(test: SolutionTestResult): string {
  if (!test.is_public) return "Dane wejściowe i oczekiwany wynik są ukryte";
  const details = test.details;
  if (!details) return "";
  if (details.execution?.status === "time_limit_exceeded") return "Przekroczono czas wykonania";
  if (details.execution?.status === "execution_error") return "Błąd wykonania programu";
  if (test.test_type === "STRUCTURAL") return details.message ?? "Analiza struktury kodu";
  const input = test.test_type === "FUNCTION" ? `${text(details.config.function_name)}(${(Array.isArray(details.config.arguments) ? details.config.arguments : []).map(text).join(", ")})` : text(details.config.input_data);
  const expected = test.test_type === "FUNCTION" ? details.config.expected_result : details.config.expected_output;
  const actual = test.test_type === "FUNCTION" ? details.actual_result ?? null : details.actual_output ?? "";
  return test.status === "passed" ? `${input} → ${text(expected)}` : `${input} → oczekiwano: ${text(expected)}, otrzymano: ${text(actual)}`;
}

export function SolutionCheckSummary({ result }: { result: CheckResult }) {
  return <div className={`solution-check-summary ${result.all_passed ? "is-success" : result.total ? "is-error" : ""}`}>
    <p className="solution-check-count" role="status" aria-label={`${result.passed} / ${result.total} testów zaliczonych`}>{result.passed} / {result.total}</p>
    {result.total > 0 && <span className="solution-test-badge">Sprawdzono</span>}
  </div>;
}

function TestHeading({ test }: { test: SolutionTestResult }) {
  return <>
    <span className="solution-test-icon" aria-hidden="true"><img src={test.status === "passed" ? checkIcon : failIcon} alt="" /></span>
    <div className="solution-test-copy">
      <h3>{test.is_public ? `Test publiczny · ${test.details?.name ?? test.number}` : `Ukryty test ${test.number}`}</h3>
      <p>{preview(test)}</p>
    </div>
    <span className="solution-test-badge">{test.status === "passed" ? "Zaliczony" : "Niezaliczony"}</span>
  </>;
}

export default function SolutionCheckResult({ result }: { result: CheckResult }) {
  return <div className="solution-check-results">
    {result.total === 0 ? <p>Do zadania nie dodano jeszcze testów.</p> : result.all_passed && <p className="execution-state is-success">Wszystkie testy zostały zaliczone.</p>}
    {result.total > 0 && <ol>{result.results.map(test => <li key={test.number} className={test.status === "passed" ? "is-success" : "is-error"}>
      {test.is_public && test.details ? <details>
        <summary className="solution-test-row" aria-label={`Szczegóły testu ${test.number}`}><TestHeading test={test} /></summary>
        <div className="solution-test-details">
        {test.test_type === "INPUT_OUTPUT" && <>
          <Value label="Wejście:" value={test.details.config.input_data} />
          <Value label="Oczekiwany wynik:" value={test.details.config.expected_output} />
          <Value label="Uzyskany wynik:" value={test.details.actual_output ?? ""} />
        </>}
        {test.test_type === "FUNCTION" && <>
          <Value label="Funkcja:" value={test.details.config.function_name} />
          <Value label="Argumenty:" value={test.details.config.arguments} />
          <Value label="Oczekiwana wartość:" value={test.details.config.expected_result} />
          {test.details.has_actual_result && <Value label="Uzyskana wartość:" value={test.details.actual_result ?? null} />}
        </>}
        {test.details.message && <p>{test.details.message}</p>}
        {test.details.execution && test.details.execution.status !== "completed" && <ExecutionResult result={test.details.execution} />}
        </div>
      </details> : <div className="solution-test-row"><TestHeading test={test} /></div>}
    </li>)}</ol>}
  </div>;
}
