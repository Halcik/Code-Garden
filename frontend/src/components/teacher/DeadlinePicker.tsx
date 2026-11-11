import { useId, useState } from "react";
import "../../styles/deadline-picker.css";

const localDate = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;

export default function DeadlinePicker({ label, value, onChange, disabled = false }: {
  label: string; value: string; onChange: (value: string) => void; disabled?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => new Date());
  const selected = value ? new Date(value) : null;
  const first = new Date(month.getFullYear(), month.getMonth(), 1);
  const start = (first.getDay() + 6) % 7;
  const days = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
  function choose(date: Date) { onChange(`${localDate(date)}T${value.split("T")[1] || "23:59"}`); }
  return <div className="deadline-picker">
    <label htmlFor={id}>{label}</label>
    <div className="deadline-picker-field">
      <input id={id} type="datetime-local" value={value} disabled={disabled} onChange={event => onChange(event.target.value)} />
      <button type="button" className="deadline-picker-trigger" disabled={disabled} aria-label={`Wybierz datę: ${label}`} aria-expanded={open} aria-controls={`${id}-calendar`} onClick={() => {
        if (!open) setMonth(selected || new Date());
        setOpen(previous => !previous);
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" aria-hidden="true"><rect x="3" y="5" width="18" height="16" rx="3" /><path d="M16 3v4M8 3v4M3 11h18" /></svg>
      </button>
    </div>
    {open && !disabled && <div id={`${id}-calendar`} className="deadline-calendar" role="group" aria-label="Kalendarz terminu" onKeyDown={event => {
      if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); document.getElementById(id)?.focus(); }
    }}>
      <div className="deadline-calendar-heading">
        <button type="button" aria-label="Poprzedni miesiąc" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1))}>‹</button>
        <strong aria-live="polite">{month.toLocaleDateString("pl-PL", { month: "long", year: "numeric" })}</strong>
        <button type="button" aria-label="Następny miesiąc" onClick={() => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1))}>›</button>
      </div>
      <div className="deadline-calendar-days">
        {["Pn", "Wt", "Śr", "Cz", "Pt", "So", "Nd"].map(day => <span className="deadline-weekday" key={day}>{day}</span>)}
        {Array.from({ length: start }, (_, index) => <span key={`empty-${index}`} />)}
        {Array.from({ length: days }, (_, index) => {
          const date = new Date(month.getFullYear(), month.getMonth(), index + 1);
          const day = localDate(date);
          return <button type="button" key={day} aria-label={date.toLocaleDateString("pl-PL", { day: "numeric", month: "long", year: "numeric" })} aria-pressed={value.slice(0, 10) === day} aria-current={day === localDate(new Date()) ? "date" : undefined} onClick={() => choose(date)}>{index + 1}</button>;
        })}
      </div>
      <div className="deadline-calendar-time"><label htmlFor={`${id}-time`}>Godzina</label><input id={`${id}-time`} type="time" value={value.split("T")[1] || "23:59"} onChange={event => {
        if (event.target.value) onChange(`${value.slice(0, 10) || localDate(new Date())}T${event.target.value}`);
      }} /></div>
      <div className="deadline-calendar-actions">
        <button type="button" onClick={() => { const today = new Date(); setMonth(today); choose(today); }}>Dzisiaj</button>
        <button type="button" onClick={() => onChange("")}>Wyczyść</button>
        <button type="button" className="deadline-calendar-done" onClick={() => setOpen(false)}>Gotowe</button>
      </div>
    </div>}
  </div>;
}
