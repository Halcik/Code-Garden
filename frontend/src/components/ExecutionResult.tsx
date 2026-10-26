import type { RunResult } from "../api/studentTasks";
import { parsePythonError } from "../utils/pythonError";
import circleAlert from "../assets/student/circle-alert.svg";

export function ExecutionSummary({ result }: { result: RunResult }) {
  const failed = result.status !== "completed";
  return <>
    <span title="Tekst wypisany przez Twój program, np. za pomocą print().">Wyjście programu</span>
    <span title="Dodatkowe komunikaty programu, np. ostrzeżenia lub szczegóły błędu. Ich obecność nie oznacza, że program zakończył się błędem." className={result.stderr && result.status === "execution_error" ? "execution-stderr-label" : undefined}>Diagnostyka programu</span>
    <span className={`execution-state ${failed ? "is-error" : "is-success"}`}>{result.status === "time_limit_exceeded" ? "Przekroczono czas" : failed ? "Zakończono błędem" : "Zakończono poprawnie"}</span>
    {(result.time != null || result.memory != null) && <span className="execution-metrics">
      {result.time != null && <span>Czas: {result.time} s</span>}
      {result.memory != null && <span>Pamięć: {result.memory} KB</span>}
    </span>}
  </>;
}

export default function ExecutionResult({ result }: { result: RunResult }) {
  const failed = result.status === "execution_error";
  const error = failed && result.stderr ? parsePythonError(result.stderr) : null;
  return <>
    {result.stdout ? <pre aria-label="Wyjście programu">{result.stdout}</pre> : result.status === "completed" && <p className="student-placeholder-copy">Program nie wypisał nic na standardowe wyjście.</p>}
    {result.status === "time_limit_exceeded" && <p className="execution-error" role="status">Program przekroczył dozwolony czas wykonania i został zatrzymany. Sprawdź, czy w kodzie nie występuje nieskończona pętla lub zbyt kosztowna operacja.</p>}
    {!failed && result.stderr && <pre aria-label="Diagnostyka programu">{result.stderr}</pre>}
    {failed && <section className="execution-error" aria-label="Błąd programu">
      <h3 className="execution-accessible-label">Błąd{error?.exception_type ? `: ${error.exception_type}` : " programu"}</h3>
      {error && <pre aria-label="Oryginalny błąd" className="execution-traceback">{error.original_error}</pre>}
      <div className="execution-explanation">
        <img src={circleAlert} alt="" width={16} height={16} />
        <div><h4 className="execution-accessible-label">Wyjaśnienie</h4>
          {error?.line_number != null && <p className="execution-line-number">Błąd w linii: {error.line_number}</p>}
          <p>{error?.friendly_message_pl ?? "Program zakończył się błędem. Usługa nie zwróciła szczegółów błędu."}</p>
        </div>
      </div>
    </section>}
  </>;
}
