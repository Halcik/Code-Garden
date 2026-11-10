import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";
import { generateInvitationCode, getInvitationCode } from "../../api/groupInvitations";
import type { InvitationCode } from "../../api/groupInvitations";
import { GroupsApiError } from "../../api/groups";
import { useAuth } from "../../auth/AuthProvider";
import GroupDialog from "./GroupDialog";

export default function GroupCodePanel({ groupId }: { groupId: number }) {
  const { retrySession } = useAuth();
  const [code, setCode] = useState<InvitationCode | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(7);
  const [unit, setUnit] = useState<"hours" | "days">("days");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  function failed(reason: unknown) {
    setError(reason instanceof Error ? reason.message : "Nie udało się pobrać kodu grupy.");
    if (reason instanceof GroupsApiError && [401, 403].includes(reason.status)) retrySession();
  }
  useEffect(() => {
    const controller = new AbortController(); setLoading(true); setError(""); setCode(null);
    getInvitationCode(groupId, controller.signal).then(data => { if (!controller.signal.aborted) setCode(data); })
      .catch(reason => { if (!controller.signal.aborted) failed(reason); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [groupId, attempt]);
  useEffect(() => {
    if (!code) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [code]);
  async function generate(event: FormEvent) {
    event.preventDefault();
    if (lock.current || !Number.isInteger(value) || value < 1 || value > (unit === "days" ? 30 : 720)) return;
    lock.current = true; setSaving(true); setError(""); setFeedback("");
    try { setCode(await generateInvitationCode(groupId, value, unit)); setNow(Date.now()); setOpen(false); setFeedback("Wygenerowano nowy kod zaproszenia."); }
    catch (reason) { failed(reason); }
    finally { lock.current = false; setSaving(false); }
  }
  async function copy() {
    setFeedback("");
    try { await navigator.clipboard.writeText(code!.code); setFeedback("Kod został skopiowany."); }
    catch { setFeedback("Nie udało się skopiować kodu. Zaznacz go i skopiuj ręcznie."); }
  }
  const expired = code !== null && new Date(code.expires_at).getTime() <= now;
  return <section className="admin-card group-card" aria-label="Kod zaproszenia"><h2>Kod zaproszenia</h2>
    {loading ? <p role="status">Ładowanie kodu…</p> : code ? <>
      <code className="group-code-value">{code.code}</code>
      <p className="muted">Ważny do: {new Date(code.expires_at).toLocaleString("pl-PL")}</p>
      {expired && <p className="error-message">Kod wygasł. Wygeneruj nowy kod.</p>}
      <button className="admin-button" disabled={expired} onClick={copy}>Kopiuj kod</button>
    </> : <p className="muted">Ta grupa nie ma jeszcze kodu zaproszenia.</p>}
    {!loading && <button className="admin-button primary" onClick={() => { setOpen(true); setError(""); setFeedback(""); }}>{code ? "Wygeneruj nowy kod" : "Wygeneruj kod"}</button>}
    {error && !open && <div role="alert"><p>{error}</p><button className="admin-text-button" onClick={() => setAttempt(previous => previous + 1)}>Spróbuj ponownie</button></div>}
    {feedback && <p role="status">{feedback}</p>}
    {open && <GroupDialog labelledBy="group-code-heading" onCancel={() => { if (!lock.current) setOpen(false); }}>
      <h2 id="group-code-heading">Wygeneruj kod zaproszenia</h2>
      <p>Wybierz ważność od 1 godziny do 30 dni. Nowy kod natychmiast zastąpi poprzedni.</p>
      <form className="group-form" onSubmit={generate}>
        <label>Czas ważności<input autoFocus type="number" min={1} max={unit === "days" ? 30 : 720} step={1} required value={value} disabled={saving} onChange={event => setValue(Number(event.target.value))} /></label>
        <label>Jednostka<select value={unit} disabled={saving} onChange={event => setUnit(event.target.value as "hours" | "days")}><option value="hours">Godziny</option><option value="days">Dni</option></select></label>
        {error && <p role="alert">{error}</p>}
        <div className="group-actions"><button className="admin-button" type="button" disabled={saving} onClick={() => setOpen(false)}>Anuluj</button>
          <button className="admin-button primary" disabled={saving}>{saving ? "Generowanie…" : "Generuj kod"}</button></div>
      </form>
    </GroupDialog>}
  </section>;
}
