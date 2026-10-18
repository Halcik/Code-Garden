import type { ReactNode } from "react";
import EditorIcon from "./EditorIcon";
import type { EditorIconName } from "./EditorIcon";
export function PlaceholderButton({ children, icon, primary = false, className = "" }: { children: ReactNode; icon?: EditorIconName; primary?: boolean; className?: string }) {
  return <button type="button" disabled title="Placeholder — funkcja będzie dostępna w kolejnym etapie" className={`admin-button editor-placeholder-button ${primary ? "primary" : ""} ${className}`}>
    {icon && <EditorIcon name={icon} />}{children}
  </button>;
}
function Heading({ title, detail, children }: { title: string; detail?: string; children?: ReactNode }) {
  return <div className="editor-section-heading"><div><h2>{title}</h2>{detail && <p>{detail}</p>}</div>{children}</div>;
}
function PlaceholderTag() { return <span className="editor-placeholder-tag">Placeholder</span>; }
export function ReviewRule() {
  return <div className="editor-note"><strong>Zasada ponownej recenzji <PlaceholderTag /></strong><p>Istotne zmiany wprowadzone po rozpoczęciu recenzji lub zatwierdzeniu unieważniają wcześniejsze akceptacje i powodują powrót zadania do recenzji. Dotyczy to zmian opisu, teorii, kodu startowego, przypadków testowych, podpowiedzi i wymagań rozwiązania.</p></div>;
}
export function TaskSettingsPlaceholders({ onArchive, archiving = false, busy = false }: { onArchive?: () => void; archiving?: boolean; busy?: boolean }) {
  return <>
    <section className="admin-card editor-card" aria-label="Ustawienia wykonania — placeholder">
      <Heading title="Ustawienia wykonania" /><PlaceholderTag />
      <dl className="editor-settings-details"><div><dt>Środowisko</dt><dd>Python 3.12</dd></div><div><dt>Limit czasu</dt><dd>2,0 sekundy</dd></div><div><dt>Pamięć</dt><dd>128 MB</dd></div></dl>
      <PlaceholderButton icon="Settings">Edytuj limity</PlaceholderButton>
    </section>
    <section className="admin-card editor-card editor-readiness" aria-label="Gotowość zadania — placeholder">
      <Heading title="Gotowość zadania" /><PlaceholderTag />
      <ul><li>— Treść zadania</li><li>— Przypadki testowe</li><li>— Zasada recenzji</li><li>— Rozwiązanie referencyjne</li></ul>
      <PlaceholderButton icon="Play1" primary>Przetestuj zadanie</PlaceholderButton>
    </section>
    <section className="admin-card editor-card" aria-label="Publikacja — placeholder">
      <Heading title="Publikacja" /><PlaceholderTag /><p>Zadania publiczne wymagają zatwierdzenia przez innego nauczyciela i administratora.</p>
      <PlaceholderButton icon="Send">Wyślij do recenzji publicznej</PlaceholderButton>
      {onArchive && <button type="button" className="admin-button editor-archive" disabled={busy} onClick={onArchive}><EditorIcon name="Archive" />{archiving ? "Archiwizowanie…" : "Archiwizuj zadanie"}</button>}
    </section>
  </>;
}
