import { lazy, Suspense, useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { createTask, getTask, updateTask, archiveTask, restoreTask, DIFFICULTIES, STATUSES, TASK_TYPES, TasksApiError } from "../api/tasks";
import type { TaskInput } from "../api/tasks";
import { useAuth } from "../auth/AuthProvider";

const PythonCodeEditor = lazy(() => import("../components/PythonCodeEditor"));
import EditorIcon from "../components/teacher/EditorIcon";
import { PlaceholderButton, ReviewRule, TaskContentPlaceholders, TaskSettingsPlaceholders } from "../components/teacher/TaskEditorPlaceholders";
import "../styles/task-editor.css";

const emptyForm = { title: "", topic: "", description: "", theory: "", instructions: "", starter_code: "", difficulty: "", task_type: "", status: "DRAFT", estimated_time_minutes: "" };
type Form = typeof emptyForm;
export default function TaskFormPage() {
  const { taskId } = useParams();
  const navigate = useNavigate();
  const { retrySession } = useAuth();
  const [form, setForm] = useState<Form>(emptyForm);
  const [original, setOriginal] = useState<TaskInput | null>(null);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [loadError, setLoadError] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [saving, setSaving] = useState(false);
  const [archived, setArchived] = useState(false);
  const [archiving, setArchiving] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const locked = useRef(false);
  const generation = useRef(0);
  function message(reason: unknown) {
    if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    return reason instanceof Error ? reason.message : "Sprawdź połączenie i spróbuj ponownie.";
  }
  useEffect(() => {
    const controller = new AbortController();
    generation.current += 1;
    setError(""); setLoadError(""); setSuccess(""); setOriginal(null); setForm(emptyForm); setArchived(false);
    if (!taskId) { setLoading(false); return () => controller.abort(); }
    setLoading(true);
    getTask(taskId, controller.signal).then(task => {
      if (controller.signal.aborted) return;
      setArchived(task.is_archived);
      const data: TaskInput = { title: task.title, topic: task.topic, description: task.description, theory: task.theory ?? "", instructions: task.instructions ?? "", starter_code: task.starter_code ?? "", difficulty: task.difficulty,
        task_type: task.task_type, status: task.status, estimated_time_minutes: task.estimated_time_minutes };
      setOriginal(data); setForm({ ...data, theory: data.theory ?? "", instructions: data.instructions ?? "", starter_code: data.starter_code ?? "", estimated_time_minutes: data.estimated_time_minutes?.toString() ?? "" });
    }).catch(reason => { if (!controller.signal.aborted) setLoadError(message(reason)); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); generation.current += 1; };
  }, [taskId, attempt, retrySession]);
  function change(key: keyof Form, value: string) { setForm(previous => ({ ...previous, [key]: value })); setSuccess(""); setError(""); }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked.current || archived) return;
    setError(""); setSuccess("");
    const minutes = form.estimated_time_minutes === "" ? null : Number(form.estimated_time_minutes);
    if (form.status === "READY" && !form.instructions.trim()) {
      setError("Gotowe zadanie musi zawierać polecenie."); return;
    }
    if (!form.title.trim() || !form.topic.trim() || !form.difficulty || !form.task_type ||
      (minutes !== null && (!Number.isInteger(minutes) || minutes <= 0 || minutes > 2147483647))) {
      setError("Uzupełnij tytuł, temat, poziom i typ zadania. Czas musi być dodatnią liczbą całkowitą."); return;
    }
    const data: TaskInput = { ...form, title: form.title.trim(), topic: form.topic.trim(), description: form.description.trim(),
      difficulty: form.difficulty as TaskInput["difficulty"], task_type: form.task_type as TaskInput["task_type"],
      status: form.status as TaskInput["status"], estimated_time_minutes: minutes };
    const patch = Object.fromEntries(Object.entries(data).filter(([key, value]) => value !== original?.[key as keyof TaskInput]));
    if (taskId && !Object.keys(patch).length) { setSuccess("Brak zmian do zapisania."); return; }
    locked.current = true; setSaving(true);
    const current = generation.current;
    try {
      if (taskId) await updateTask(taskId, patch); else await createTask(data);
      if (current !== generation.current) return;
      if (!taskId) navigate("/teacher/tasks", { state: { taskSaved: true } });
      else { setOriginal(data); setForm({ ...data, theory: data.theory ?? "", instructions: data.instructions ?? "", starter_code: data.starter_code ?? "", estimated_time_minutes: minutes?.toString() ?? "" }); setSuccess("Zmiany zostały zapisane."); }
    } catch (reason) { if (current === generation.current) setError(message(reason)); }
    finally { locked.current = false; setSaving(false); }
  }
  async function restore() {
    if (!taskId || locked.current) return;
    locked.current = true; setSaving(true); setError("");
    const current = generation.current;
    try {
      await restoreTask(taskId);
      if (current === generation.current) setAttempt(value => value + 1);
    } catch (reason) { if (current === generation.current) setError(message(reason)); }
    finally { locked.current = false; setSaving(false); }
  }
  async function archive() {
    if (!taskId || archived || locked.current) return;
    locked.current = true; setSaving(true); setArchiving(true); setError(""); setSuccess("");
    const current = generation.current;
    try {
      await archiveTask(Number(taskId));
      if (current === generation.current) {
        setArchived(true);
        setSuccess("Zadanie zostało zarchiwizowane.");
      }
    } catch (reason) { if (current === generation.current) setError(message(reason)); }
    finally { locked.current = false; setSaving(false); setArchiving(false); }
  }
  const select = (key: "difficulty" | "task_type" | "status", label: string, values: Record<string, string>) =>
    <label>{label}<select required value={form[key]} onChange={event => change(key, event.target.value)}>
      <option value="" disabled>Wybierz…</option>{Object.entries(values).map(([value, text]) => <option key={value} value={value}>{text}</option>)}
    </select></label>;
  return <div className="task-editor">
    <div className="editor-header">
      <div className="editor-heading">
        <nav className="editor-breadcrumb" aria-label="Ścieżka zadania"><Link to="/teacher/tasks" aria-label="Wróć do listy zadań">Zadania</Link><span>/ {taskId ? STATUSES[form.status as keyof typeof STATUSES] : "Nowe zadanie"}</span></nav>
        <div className="editor-title-row"><h1>{taskId ? original?.title || "Edycja zadania" : "Utwórz zadanie"}</h1><span className={`user-badge ${!archived && form.status === "READY" ? "status-active" : "task-draft"}`}>{archived ? "Zarchiwizowane" : STATUSES[form.status as keyof typeof STATUSES]}</span></div>
        <p className="editor-save-note">{saving ? "Zapisywanie zmian…" : success || (taskId ? "Edytuj podstawowe dane zadania · Ostatnia edycja: Ty" : "Nowa wersja robocza · Uzupełnij informacje i zapisz zadanie")}</p>
      </div>
      <div className="editor-header-actions"><PlaceholderButton icon="Eye">Podgląd</PlaceholderButton><PlaceholderButton icon="Play">Przetestuj zadanie</PlaceholderButton>
        {archived ? <button className="admin-button primary" type="button" disabled={saving} onClick={restore}>{saving ? "Przywracanie…" : "Przywróć"}</button>
          : <button className="admin-button primary" form="task-basics-form" disabled={saving || loading || Boolean(loadError)} type="submit"><EditorIcon name="Save" />{saving ? "Zapisywanie…" : taskId ? "Zapisz zmiany" : "Utwórz zadanie"}</button>}
      </div>
    </div>
    {loading ? <p role="status" className="admin-card admin-state">Ładowanie zadania…</p>
      : loadError ? <div role="alert" className="admin-card admin-state"><p>{loadError}</p><button className="admin-button" onClick={() => setAttempt(value => value + 1)}>Spróbuj ponownie</button></div>
      : <>
        {error && <p role="alert" className="error-message">{error}</p>}{success && <p role="status" className="task-save-success">{success}</p>}
        {archived && <p className="editor-archive-notice">Tylko do odczytu. Przywróć zadanie, aby ponownie je edytować.</p>}
        <div className="editor-columns">
          <div className="editor-main-column">
            <form id="task-basics-form" className="admin-card editor-card" onSubmit={submit} noValidate aria-busy={saving}>
              <div className="editor-section-heading"><div><h2>Podstawowe informacje</h2><p>Informacje widoczne dla ucznia przed otwarciem zadania</p></div></div>
              <fieldset disabled={saving || archived}>
                <label>Tytuł<input required maxLength={200} placeholder="Wpisz tytuł zadania" value={form.title} onChange={event => change("title", event.target.value)} /></label>
                <ReviewRule />
                <div className="editor-basics-grid">
                  <label>Temat<input required maxLength={100} placeholder="Wpisz temat" value={form.topic} onChange={event => change("topic", event.target.value)} /></label>
                  {select("difficulty", "Poziom trudności", DIFFICULTIES)}{select("task_type", "Typ zadania", TASK_TYPES)}
                  <label>Przewidywany czas (minuty)<input type="number" min={1} max={2147483647} step={1} placeholder="np. 20" value={form.estimated_time_minutes} onChange={event => change("estimated_time_minutes", event.target.value)} /></label>
                </div>
                <label>Krótki opis<textarea rows={3} placeholder="Dodaj krótki opis zadania" value={form.description} onChange={event => change("description", event.target.value)} /></label>
                <div className="editor-basics-footer">{select("status", "Status", STATUSES)}<Link className="admin-button" to="/teacher/tasks">Anuluj</Link></div>
              </fieldset>
            </form>
            <section className="admin-card editor-card" aria-label="Treści edukacyjne">
              <div className="editor-section-heading"><div><h2>Treści edukacyjne</h2><p>Teoria i szczegółowe wymagania zadania</p></div></div>
              <fieldset disabled={saving || archived}>
                <label>Krótka teoria<textarea form="task-basics-form" rows={4} value={form.theory} onChange={event => change("theory", event.target.value)} /></label>
                <label>Treść zadania<textarea form="task-basics-form" rows={5} placeholder="Dodaj polecenie i szczegółowe wymagania zadania" value={form.instructions} onChange={event => change("instructions", event.target.value)} /></label>
              </fieldset>
            </section>
            <section className="admin-card editor-card" aria-label="Kod startowy">
              <div className="editor-section-heading"><div><h2>Kod startowy</h2><p>Początkowa zawartość edytora ucznia · Python</p></div></div>
              <Suspense fallback={<p role="status">Ładowanie edytora kodu…</p>}>
                <PythonCodeEditor value={form.starter_code} onChange={value => change("starter_code", value)} readOnly={saving || archived} />
              </Suspense>
            </section>
            <TaskContentPlaceholders />
          </div>
          <aside className="editor-settings-column" aria-label="Ustawienia zadania"><TaskSettingsPlaceholders onArchive={taskId && !archived ? archive : undefined} busy={saving} archiving={archiving} /></aside>
        </div>
      </>}
  </div>;
}
