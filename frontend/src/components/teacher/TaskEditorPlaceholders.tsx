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
const tests = [
  ["Podstawowy zakres", "stdin: 10  →  stdout: 2 3 5 7", "Publiczny"],
  ["Brak liczb pierwszych", "stdin: 1  →  stdout: empty line", "Publiczny"],
  ["Wartość graniczna", "stdin: 2  →  stdout: 2", "Ukryty"],
  ["Większy zakres", "stdin: 100  →  stdout: 2 3 5 7 … 97", "Ukryty"],
];
const hints = [
  ["Kierunek", "Obsłuż liczby mniejsze niż 2 przed rozpoczęciem pętli sprawdzającej dzielniki."],
  ["Schemat", "Użyj pętli od 2 do int(n ** 0.5) + 1."],
  ["Szczegółowa", "Zwróć False, gdy n % divisor == 0; jeśli pętla zakończy się bez znalezienia dzielnika, zwróć True."],
];
export function TaskContentPlaceholders() {
  return <>
    <section className="admin-card editor-card" aria-label="Treści edukacyjne — placeholder">
      <Heading title="Treści edukacyjne" detail="Teoria i szczegółowe wymagania"><PlaceholderTag /></Heading>
      <label>Krótka teoria<textarea disabled rows={3} placeholder="Placeholder — tutaj dodasz krótką teorię do zadania." /></label>
      <label>Treść zadania<textarea disabled rows={3} placeholder="Placeholder — tutaj dodasz polecenie i szczegółowe wymagania zadania." /></label>
    </section>
    <section className="admin-card editor-card" aria-label="Kod startowy — placeholder">
      <Heading title="Kod startowy" detail="Wczytywany domyślnie w edytorze ucznia"><PlaceholderTag /></Heading>
      <div className="editor-code-field"><span>Kod startowy Python</span><pre aria-label="Przykładowy kod startowy"><code><span className="editor-code-keyword">def</span>{" is_prime(n):\n    # Placeholder — edytor kodu wkrótce\n    pass\n\nlimit = int(input())\n# Print primes up to limit"}</code></pre></div>
    </section>
    <section className="admin-card editor-card" aria-label="Przypadki testowe — placeholder">
      <Heading title="Przypadki testowe" detail="Testy publiczne pokazują dane wejściowe i wynik; testy ukryte pokazują wyłącznie zaliczenie lub niezaliczenie"><PlaceholderButton icon="Plus">Dodaj przypadek testowy</PlaceholderButton></Heading>
      <div className="editor-note"><strong>Typy testów <PlaceholderTag /></strong><p>Używaj testów wejścia/wyjścia do sprawdzania oczekiwanych wyników, testów funkcji do weryfikacji sygnatury i zachowania oraz testów strukturalnych do sprawdzania nazw, struktury i reguł implementacji.</p></div>
      <div className="editor-example-list" aria-label="Przykładowe przypadki testowe">{tests.map(([title, example, visibility], index) => <div className="editor-test-row" key={title}>
        <span className="editor-test-number">{index + 1}</span><div className="editor-row-copy"><strong>{title}</strong><code>{example}</code></div>
        <span className={`user-badge ${visibility === "Publiczny" ? "status-active" : "task-draft"}`}>{visibility}</span><EditorIcon name="GripVertical" />
      </div>)}</div>
    </section>
    <section className="admin-card editor-card" aria-label="Podpowiedzi — placeholder">
      <Heading title="Podpowiedzi" detail="Ułóż podpowiedzi od ogólnego kierunku do niemal gotowego rozwiązania"><PlaceholderButton icon="Plus">Dodaj podpowiedź</PlaceholderButton></Heading>
      <div className="editor-note"><strong>Wskazówki dotyczące podpowiedzi <PlaceholderTag /></strong><p>Używaj podpowiedzi kierunkowych do ogólnego podejścia, podpowiedzi ze schematem do kluczowej logiki oraz szczegółowych podpowiedzi do kroków implementacji.</p></div>
      <div className="editor-example-list" aria-label="Przykładowe podpowiedzi">{hints.map(([title, text], index) => <div className={`editor-hint-row ${index === 2 ? "editor-hint-detailed" : ""}`} key={title}>
        <EditorIcon name="GripVertical" /><div className="editor-row-copy"><strong>Podpowiedź {index + 1} · {title}</strong><p>{text}</p></div><button type="button" disabled className="admin-text-button" title="Placeholder — edycja podpowiedzi wkrótce">Edytuj</button>
      </div>)}</div>
    </section>
  </>;
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
