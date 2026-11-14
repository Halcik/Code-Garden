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
  return <div className="editor-note"><strong>Zasada ponownej recenzji</strong><p>W czasie recenzji treść jest tylko do odczytu. Opublikowane zadanie wycofaj do edycji przed zmianą treści. Ponowna publikacja wymaga akceptacji niezależnego nauczyciela i administratora.</p></div>;
}
export function TaskSettingsPlaceholders({ execution, onArchive, archiving = false, busy = false, publicationAvailable = false, publicationActions, publicationHistory }: { execution?: ReactNode; onArchive?: () => void; archiving?: boolean; busy?: boolean; publicationAvailable?: boolean; publicationActions?: ReactNode; publicationHistory?: ReactNode }) {
  return <>
    {execution}
    <section className="admin-card editor-card editor-readiness" aria-label="Gotowość zadania — placeholder">
      <Heading title="Gotowość zadania" /><PlaceholderTag />
      <ul><li>— Treść zadania</li><li>— Przypadki testowe</li><li>— Zasada recenzji</li><li>— Rozwiązanie referencyjne</li></ul>
      <PlaceholderButton icon="Play1" primary>Przetestuj zadanie</PlaceholderButton>
    </section>
    <section className="admin-card editor-card" aria-label={publicationAvailable ? "Publikacja" : "Publikacja — placeholder"}>
      <Heading title="Publikacja" />{!publicationAvailable && <PlaceholderTag />}<p>Zadania publiczne wymagają zatwierdzenia przez innego nauczyciela i administratora.</p>
      {!publicationAvailable && <PlaceholderButton icon="Send">Wyślij do recenzji publicznej</PlaceholderButton>}
      {publicationActions}
      {onArchive && <button type="button" className="admin-button editor-archive" disabled={busy} onClick={onArchive}><EditorIcon name="Archive" />{archiving ? "Archiwizowanie…" : "Archiwizuj zadanie"}</button>}
    </section>
    {publicationHistory}
  </>;
}
