import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useListSensors, useSortableRow, reorderList } from "./sortableList";
import { testRequest } from "../../api/taskTests";
import type { TaskTest, TestInput, TestType } from "../../api/taskTests";
import { TasksApiError } from "../../api/tasks";
import { useAuth } from "../../auth/AuthProvider";
import EditorIcon from "./EditorIcon";
import { useDraftItems } from "./useDraftItems";
const types: Record<TestType, string> = { INPUT_OUTPUT: "Input / Output", FUNCTION: "Test funkcji", STRUCTURAL: "Test strukturalny" };
const rules: Record<string, string> = { FUNCTION_EXISTS: "Istnieje funkcja", CLASS_EXISTS: "Istnieje klasa", CALLS_FUNCTION: "Wywołano funkcję", USES_FOR: "Użyto pętli for", USES_WHILE: "Użyto pętli while", USES_IF: "Użyto instrukcji if" };
function summary(test: TaskTest) {
  const c = test.config;
  if (test.test_type === "INPUT_OUTPUT") return `stdin: ${c.input_data || "(puste)"} → stdout: ${c.expected_output}`;
  if (test.test_type === "FUNCTION") return `${c.function_name}(${JSON.stringify(c.arguments)}) → ${JSON.stringify(c.expected_result)}`;
  return `${rules[String(c.rule_type)]} ${c.expected_value || ""}`;
}
function TestRow({ test, disabled, edit, remove }: { test: TaskTest; disabled: boolean; edit: () => void; remove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, style } = useSortableRow(test.id, disabled);
  return <div ref={setNodeRef} style={style} className="editor-test-row">
    <button type="button" disabled={disabled} ref={setActivatorNodeRef} className="admin-text-button test-grip" aria-label={`Przenieś test ${test.name}`} {...attributes} {...listeners}><EditorIcon name="GripVertical" /></button>
    <span className="editor-test-number">{test.position}</span><div className="editor-row-copy"><strong>{test.name}</strong><small>{types[test.test_type]}</small><code>{summary(test)}</code></div>
    <span className={`user-badge ${test.is_hidden ? "task-draft" : "status-active"}`}>{test.is_hidden ? "Ukryty" : "Publiczny"}</span>
    <button type="button" className="admin-text-button" disabled={disabled} onClick={edit}>Edytuj</button><button type="button" className="admin-text-button" disabled={disabled} onClick={remove}>Usuń</button>
  </div>;
}
function TestForm({ initial, busy, save, close }: { initial: TaskTest | null; busy: boolean; save: (data: TestInput) => void; close: () => void }) {
  const [type, setType] = useState<TestType>(initial?.test_type || "INPUT_OUTPUT");
  const [name, setName] = useState(initial?.name || "");
  const [hidden, setHidden] = useState(initial?.is_hidden || false);
  const c = initial?.config;
  const [input, setInput] = useState(String(c?.input_data ?? ""));
  const [output, setOutput] = useState(String(c?.expected_output ?? ""));
  const [fn, setFn] = useState(String(c?.function_name ?? ""));
  const [args, setArgs] = useState(c && "arguments" in c ? JSON.stringify(c.arguments) : "");
  const [result, setResult] = useState(c && "expected_result" in c ? JSON.stringify(c.expected_result) : "");
  const [rule, setRule] = useState(String(c?.rule_type ?? "FUNCTION_EXISTS"));
  const [expected, setExpected] = useState(String(c?.expected_value ?? ""));
  const [error, setError] = useState("");
  const needsName = ["FUNCTION_EXISTS", "CLASS_EXISTS", "CALLS_FUNCTION"].includes(rule);
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault(); setError("");
    let config: Record<string, unknown>;
    if (!name.trim()) { setError("Podaj nazwę testu."); return; }
    if (type === "INPUT_OUTPUT") {
      if (!output.length) { setError("Podaj oczekiwany output."); return; }
      config = { input_data: input, expected_output: output };
    } else if (type === "FUNCTION") {
      if (!fn.trim()) { setError("Podaj nazwę funkcji."); return; }
      try {
        const argumentsValue: unknown = JSON.parse(args);
        if (!Array.isArray(argumentsValue)) throw new Error();
        config = { function_name: fn.trim(), arguments: argumentsValue, expected_result: JSON.parse(result) };
      } catch { setError("Argumenty muszą być tablicą JSON, a oczekiwany wynik poprawną wartością JSON."); return; }
    } else {
      if (needsName && !expected.trim()) { setError("Podaj oczekiwaną nazwę."); return; }
      config = { rule_type: rule, ...(needsName ? { expected_value: expected.trim() } : {}) };
    }
    save({ name: name.trim(), test_type: type, config, is_hidden: hidden });
  }
  return <form onSubmit={submit} className="test-case-form" aria-label={initial ? "Edycja przypadku testowego" : "Nowy przypadek testowy"}>
    <h3>{initial ? "Edytuj przypadek testowy" : "Nowy przypadek testowy"}</h3>
    {error && <p role="alert" className="error-message">{error}</p>}
    <fieldset disabled={busy}>
      <label>Nazwa testu<input ref={first} maxLength={200} required value={name} onChange={e => setName(e.target.value)} /></label>
      <label>Typ testu<select value={type} onChange={e => setType(e.target.value as TestType)}>{Object.entries(types).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      {type === "INPUT_OUTPUT" && <><label>Dane wejściowe<textarea rows={3} value={input} onChange={e => setInput(e.target.value)} /></label><label>Oczekiwany output<textarea rows={3} required value={output} onChange={e => setOutput(e.target.value)} /></label></>}
      {type === "FUNCTION" && <><label>Nazwa funkcji<input required value={fn} onChange={e => setFn(e.target.value)} placeholder="pole_prostokata" /></label><label>Argumenty (tablica JSON)<textarea required value={args} onChange={e => setArgs(e.target.value)} placeholder="[2, 3]" /></label><label>Oczekiwany wynik (JSON)<textarea required value={result} onChange={e => setResult(e.target.value)} placeholder="6" /></label></>}
      {type === "STRUCTURAL" && <><label>Typ reguły<select value={rule} onChange={e => setRule(e.target.value)}>{Object.entries(rules).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>{needsName && <label>Oczekiwana nazwa<input required value={expected} onChange={e => setExpected(e.target.value)} /></label>}</>}
      <label>Widoczność<select value={String(hidden)} onChange={e => setHidden(e.target.value === "true")}><option value="false">Publiczny</option><option value="true">Ukryty</option></select></label>
      <div className="test-form-actions"><button className="admin-button primary" type="submit">{busy ? "Zapisywanie…" : "Zapisz test"}</button><button className="admin-button" type="button" onClick={close}>Anuluj</button></div>
    </fieldset>
  </form>;
}
export default function TaskTests({ taskId, readOnly, onDraftChange, onEditingChange }: { taskId?: string; readOnly: boolean; onDraftChange?: (items: TestInput[]) => void; onEditingChange?: (editing: boolean) => void }) {
  const { retrySession } = useAuth();
  const [tests, setTests] = useState<TaskTest[]>([]);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TaskTest | null | undefined>();
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  const sensors = useListSensors();
  function changeDraft(items: TaskTest[]) {
    setTests(items);
    onDraftChange?.(items.map(({ name, test_type, config, is_hidden }) => ({ name, test_type, config, is_hidden })));
  }
  const draft = useDraftItems(tests, changeDraft);
  useEffect(() => { onEditingChange?.(editing !== undefined); }, [editing, onEditingChange]);
  function report(reason: unknown) {
    if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    setError(reason instanceof Error ? reason.message : "Sprawdź połączenie i spróbuj ponownie.");
  }
  useEffect(() => {
    const controller = new AbortController(); generation.current++;
    setTests([]); setEditing(undefined); setError(""); setFailed(false);
    if (!taskId) { setLoading(false); return; }
    setLoading(true);
    testRequest<TaskTest[]>(taskId, "", "GET", undefined, controller.signal).then(items => { if (!controller.signal.aborted) setTests(items); })
      .catch(reason => { if (!controller.signal.aborted) { report(reason); setFailed(true); } })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); generation.current++; };
  }, [taskId, attempt]);
  useEffect(() => { if (readOnly) setEditing(undefined); }, [readOnly]);
  async function mutate(operation: () => Promise<unknown>) {
    if (!taskId || readOnly || loading || failed || lock.current) return;
    lock.current = true; setBusy(true); setError("");
    const current = generation.current;
    try {
      await operation();
      if (current === generation.current) setEditing(undefined);
      const items = await testRequest<TaskTest[]>(taskId);
      if (current === generation.current) { setTests(items); setEditing(undefined); }
    } catch (reason) {
      if (current === generation.current) {
        report(reason);
        try {
          const items = await testRequest<TaskTest[]>(taskId);
          if (current === generation.current) setTests(items);
        } catch { if (current === generation.current) setFailed(true); }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  function drop(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || lock.current || busy || readOnly || loading || failed || editing !== undefined) return;
    const reordered = reorderList(tests, event);
    if (!reordered) return;
    if (!taskId) { changeDraft(reordered); return; }
    setTests(reordered.map((test, i) => ({ ...test, position: i + 1 })));
    void mutate(() => testRequest(taskId, "/reorder", "PATCH", { test_ids: reordered.map(t => t.id) }));
  }
  const disabled = readOnly || busy || loading || failed;
  return <section className="admin-card editor-card" aria-label="Przypadki testowe" aria-busy={busy || loading}>
    <div className="editor-section-heading"><div><h2>Przypadki testowe</h2><p>Definiuj dane testów i przeciągaj za uchwyt, aby ustawić kolejność.</p></div><button type="button" className="admin-button" disabled={disabled || editing !== undefined} onClick={() => setEditing(null)}><EditorIcon name="Plus" />Dodaj przypadek testowy</button></div>
    {!taskId && <p>Wpisy zostaną zapisane razem z zadaniem.</p>}
    {loading && <p role="status">Ładowanie testów…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {failed && <button type="button" className="admin-button" onClick={() => setAttempt(n => n + 1)}>Odśwież testy</button>}
    {editing !== undefined && !readOnly && <TestForm key={editing?.id ?? "new"} initial={editing} busy={busy || loading || failed} close={() => setEditing(undefined)} save={data => { if (!taskId) { draft.save(data, editing); setEditing(undefined); } else void mutate(() => testRequest(taskId, editing ? `/${editing.id}` : "", editing ? "PATCH" : "POST", data)); }} />}
    {!loading && !failed && !tests.length && <p>Brak przypadków testowych. Dodaj pierwszy test.</p>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}><SortableContext items={tests.map(t => t.id)} strategy={verticalListSortingStrategy}><div className="editor-example-list">{tests.map(test => <TestRow key={test.id} test={test} disabled={disabled || editing !== undefined} edit={() => setEditing(test)} remove={() => { if (window.confirm(`Usunąć test „${test.name}”?`)) { if (!taskId) draft.remove(test.id); else void mutate(() => testRequest(taskId, `/${test.id}`, "DELETE")); } }} />)}</div></SortableContext></DndContext>
  </section>;
}
