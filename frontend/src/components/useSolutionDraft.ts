import { useEffect, useRef, useState } from "react";
import { getSolutionDraft, saveSolutionDraft } from "../api/solutions";
import type { SolutionDraft } from "../api/solutions";

export function useSolutionDraft(taskId: number) {
  const [code, setCode] = useState("");
  const [draft, setDraft] = useState<SolutionDraft | null>(null);
  const [status, setStatus] = useState("Ładowanie wersji roboczej…");
  const current = useRef("");
  const saved = useRef("");
  const revision = useRef(0);
  const ready = useRef(false);
  const alive = useRef(true);
  const queue = useRef<Promise<void>>(Promise.resolve());
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    alive.current = true;
    const controller = new AbortController();
    getSolutionDraft(taskId, controller.signal).then(value => {
      if (controller.signal.aborted) return;
      current.current = saved.current = value.source_code;
      revision.current = value.revision; ready.current = true;
      setCode(value.source_code); setDraft(value); setStatus("Zapisano");
    }).catch(() => { if (!controller.signal.aborted) setStatus("Nie udało się wczytać wersji roboczej"); });
    return () => { alive.current = false; controller.abort(); };
  }, [taskId, attempt]);

  function edit(value: string) {
    current.current = value; setCode(value); setStatus("Niezapisane zmiany");
  }
  function flush() {
    const operation = queue.current.catch(() => {}).then(async () => {
      if (!ready.current) throw new Error("Wersja robocza nie została wczytana.");
      // Serialize writes, reading the newest editor contents when a queued save starts.
      while (saved.current !== current.current) {
        const source = current.current;
        if (alive.current) setStatus("Zapisywanie…");
        const value = await saveSolutionDraft(taskId, source, revision.current);
        saved.current = source; revision.current = value.revision;
        if (alive.current) setDraft(value);
      }
      if (alive.current) setStatus("Zapisano");
    });
    queue.current = operation;
    return operation.then(() => revision.current).catch(reason => {
      if (alive.current) setStatus(reason instanceof Error ? `Nie udało się zapisać. ${reason.message}` : "Nie udało się zapisać");
      throw reason;
    });
  }
  useEffect(() => {
    if (!ready.current || code === saved.current) return;
    const timer = setTimeout(() => { void flush().catch(() => {}); }, 750);
    return () => clearTimeout(timer);
  }, [code]);
  return { code, edit, draft, status, flush, retry: () => setAttempt(value => value + 1) };
}
