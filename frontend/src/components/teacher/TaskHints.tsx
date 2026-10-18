import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { DndContext, closestCenter } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import { SortableContext, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { useListSensors, useSortableRow, reorderList } from "./sortableList";
import { hintRequest } from "../../api/taskHints";
import type { TaskHint, HintInput } from "../../api/taskHints";
import { TasksApiError } from "../../api/tasks";
import { useAuth } from "../../auth/AuthProvider";
import EditorIcon from "./EditorIcon";
function HintRow({ hint, disabled, edit, remove }: { hint: TaskHint; disabled: boolean; edit: () => void; remove: () => void }) {
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, style } = useSortableRow(hint.id, disabled);
  return <div ref={setNodeRef} style={style} className="editor-hint-row">
    <button ref={setActivatorNodeRef} type="button" disabled={disabled} className="admin-text-button test-grip" aria-label={`Przenieś podpowiedź ${hint.title}`} {...attributes} {...listeners}><EditorIcon name="GripVertical" /></button>
    <div className="editor-row-copy"><strong>Podpowiedź {hint.position} · {hint.title}</strong><p>{hint.content}</p></div>
    <button type="button" className="admin-text-button" disabled={disabled} onClick={edit}>Edytuj</button><button type="button" className="admin-text-button" disabled={disabled} onClick={remove}>Usuń</button>
  </div>;
}
function HintForm({ initial, busy, save, close }: { initial: TaskHint | null; busy: boolean; save: (data: HintInput) => void; close: () => void }) {
  const [title, setTitle] = useState(initial?.title || "");
  const [content, setContent] = useState(initial?.content || "");
  const [error, setError] = useState("");
  const first = useRef<HTMLInputElement>(null);
  useEffect(() => { first.current?.focus(); }, []);
  function submit(event: FormEvent) {
    event.preventDefault();
    if (!title.trim() || !content.trim()) { setError("Podaj tytuł i treść podpowiedzi."); return; }
    save({ title: title.trim(), content: content.trim() });
  }
  return <form onSubmit={submit} className="test-case-form" aria-label={initial ? "Edycja podpowiedzi" : "Nowa podpowiedź"}>
    <h3>{initial ? "Edytuj podpowiedź" : "Nowa podpowiedź"}</h3>
    {error && <p role="alert" className="error-message">{error}</p>}
    <fieldset disabled={busy}>
      <label>Tytuł<input ref={first} maxLength={200} required value={title} onChange={e => setTitle(e.target.value)} /></label>
      <label>Treść podpowiedzi<textarea rows={4} required value={content} onChange={e => setContent(e.target.value)} /></label>
      <div className="test-form-actions"><button className="admin-button primary" type="submit">{busy ? "Zapisywanie…" : "Zapisz podpowiedź"}</button><button className="admin-button" type="button" onClick={close}>Anuluj</button></div>
    </fieldset>
  </form>;
}
export default function TaskHints({ taskId, readOnly }: { taskId?: string; readOnly: boolean }) {
  const { retrySession } = useAuth();
  const [hints, setHints] = useState<TaskHint[]>([]);
  const [loading, setLoading] = useState(Boolean(taskId));
  const [failed, setFailed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<TaskHint | null | undefined>();
  const [attempt, setAttempt] = useState(0);
  const lock = useRef(false);
  const generation = useRef(0);
  const sensors = useListSensors();
  function report(reason: unknown) {
    if (reason instanceof TasksApiError && [401, 403].includes(reason.status)) retrySession();
    setError(reason instanceof Error ? reason.message : "Sprawdź połączenie i spróbuj ponownie.");
  }
  useEffect(() => {
    const controller = new AbortController(); generation.current++;
    setHints([]); setEditing(undefined); setError(""); setFailed(false);
    if (!taskId) { setLoading(false); return; }
    setLoading(true);
    hintRequest<TaskHint[]>(taskId, "", "GET", undefined, controller.signal).then(items => { if (!controller.signal.aborted) setHints(items); })
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
      const items = await hintRequest<TaskHint[]>(taskId);
      if (current === generation.current) { setHints(items); setEditing(undefined); }
    } catch (reason) {
      if (current === generation.current) {
        report(reason);
        try {
          const items = await hintRequest<TaskHint[]>(taskId);
          if (current === generation.current) setHints(items);
        } catch { if (current === generation.current) setFailed(true); }
      }
    } finally { lock.current = false; setBusy(false); }
  }
  function drop(event: DragEndEvent) {
    if (!event.over || event.active.id === event.over.id || lock.current || busy || readOnly || loading || failed || editing !== undefined || !taskId) return;
    const reordered = reorderList(hints, event);
    if (!reordered) return;
    setHints(reordered);
    void mutate(() => hintRequest(taskId, "/reorder", "PATCH", { hint_ids: reordered.map(t => t.id) }));
  }
  const disabled = readOnly || busy || loading || failed;
  return <section className="admin-card editor-card" aria-label="Podpowiedzi" aria-busy={busy || loading}>
    <div className="editor-section-heading"><div><h2>Podpowiedzi</h2><p>Ułóż podpowiedzi od ogólnego kierunku do niemal gotowego rozwiązania</p></div><button type="button" className="admin-button" disabled={!taskId || disabled || editing !== undefined} onClick={() => setEditing(null)}><EditorIcon name="Plus" />Dodaj podpowiedź</button></div>
    {!taskId && <p>Zapisz zadanie, aby dodać podpowiedzi.</p>}
    {loading && <p role="status">Ładowanie podpowiedzi…</p>}
    {error && <p role="alert" className="error-message">{error}</p>}
    {failed && <button type="button" className="admin-button" onClick={() => setAttempt(n => n + 1)}>Odśwież podpowiedzi</button>}
    {editing !== undefined && !readOnly && <HintForm key={editing?.id ?? "new"} initial={editing} busy={busy || loading || failed} close={() => setEditing(undefined)} save={data => { void mutate(() => hintRequest(taskId!, editing ? `/${editing.id}` : "", editing ? "PATCH" : "POST", data)); }} />}
    <div className="editor-note"><strong>Wskazówki dotyczące podpowiedzi</strong><p>Używaj podpowiedzi kierunkowych do ogólnego podejścia, podpowiedzi ze schematem do kluczowej logiki oraz szczegółowych podpowiedzi do kroków implementacji.</p></div>
    {taskId && !loading && !failed && !hints.length && <p>Brak podpowiedzi. Dodaj pierwszą podpowiedź.</p>}
    <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={drop}><SortableContext items={hints.map(t => t.id)} strategy={verticalListSortingStrategy}><div className="editor-example-list">{hints.map(hint => <HintRow key={hint.id} hint={hint} disabled={disabled || editing !== undefined} edit={() => setEditing(hint)} remove={() => { if (window.confirm(`Usunąć podpowiedź „${hint.title}”?`)) void mutate(() => hintRequest(taskId!, `/${hint.id}`, "DELETE")); }} />)}</div></SortableContext></DndContext>
  </section>;
}
