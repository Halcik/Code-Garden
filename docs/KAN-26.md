# KAN-26 — treść zadania i kod startowy

Rozszerzenie istniejącego formularza KAN-25 i przygotowanego wcześniej układu Figmy. Bez nowego ekranu ani endpointów.

## Zmienione pliki i pola

- `backend/app/models/task.py`: nowe opcjonalne kolumny `theory`, `instructions`, `starter_code`, wszystkie typu `Text`. Dotychczasowe `description` pozostaje krótkim opisem w podstawowych informacjach. W treściach edukacyjnych `theory` oznacza krótką teorię, a `instructions` właściwą treść zadania. Wskazówki i podpowiedzi pozostają poza zakresem KAN-26.
- `backend/app/schemas/task.py`: pola dostępne w create/update/response. Przycinanie białych znaków dotyczy tytułu, tematu i krótkiego opisu (`description`). Teoria (`theory`), treść zadania (`instructions`) i kod (`starter_code`) zachowują białe znaki. Dla READY `strip()` służy wyłącznie do sprawdzenia, czy polecenie nie jest puste; nie zmienia zapisywanej treści. PATCH pozwala wyczyścić nowe pola przez null (z wyjątkiem `instructions` dla READY); brak pola pozostawia wartość bez zmian.
- `backend/app/api/teacher.py`: walidacja niepustego polecenia dla READY na połączonym stanie rekordu i PATCH. DRAFT nadal dopuszcza puste polecenie. Istniejąca kontrola właściciela i blokada archiwizacji obejmują wszystkie nowe pola.
- `backend/alembic/versions/0005_task_content.py`: pierwotna migracja dodaje `theory`, `additional_context` i `starter_code` jako nullable Text. Rewizja `0006_task_instructions.py` zmienia nazwę `additional_context` na `instructions`, zachowując dane. Obsługuje także bazę, która zastosowała przejściową wersję 0005 z nazwą `instructions`. Downgrade 0006 przywraca dawną nazwę; downgrade 0005 usuwa te trzy kolumny wraz z zawartością.
- `frontend/src/api/tasks.ts`: rozszerzony kontrakt Task i TaskInput.
- `frontend/src/pages/TaskFormPage.tsx`: krótki opis w podstawowych informacjach; krótka teoria i treść zadania w treściach edukacyjnych; kod w Monaco. Wspólny zapis, odczyt, błędy i stan saving. Edytor ładowany na żądanie.
- `frontend/src/components/teacher/TaskEditorPlaceholders.tsx`: usunięte zastąpione placeholdery edukacji i kodu. Pozostałe sekcje nadal są nieaktywne.
- `frontend/src/components/PythonCodeEditor.tsx`: współdzielony Monaco przyjmujący value, onChange, readOnly i opcjonalne height. Python, linie, tabSize=4, spacje, bez minimapy i przewijania poza ostatni wiersz, automatyczny layout, font 14 px. Kod i worker dostarczane lokalnie. Istniejący useTheme wybiera light/vs-dark, również po zmianie motywu aplikacji. readOnly blokuje edycję i callback zapisu.
- `frontend/package.json`, `frontend/package-lock.json`: @monaco-editor/react i bezpośrednia zależność monaco-editor.
- `backend/tests/test_teacher_tasks_integration.py`, `frontend/src/pages/TaskFormPage.test.tsx`, `TeacherTasksPage.test.tsx`: aktualizacja kontraktów i testy zapisu treści, wcięć, trybów motywu, walidacji i archiwizacji.

## Uruchomienie migracji

W katalogu backend, przy DATABASE_URL wskazującym właściwą bazę:

```sh
python -m alembic upgrade head
```

## Weryfikacja

- `npm test --prefix frontend -- --maxWorkers=1`: 67 testów zaliczonych.
- Pełny backend na osobnej tymczasowej bazie PostgreSQL 16: 149 testów zaliczonych.
- Testy regresji migracji 0006 (`backend/tests/test_task_content_migration.py`) sprawdzają oba warianty zastosowanej 0005: starą kolumnę `additional_context` i przejściową `instructions`. Na izolowanym schemacie PostgreSQL weryfikują zachowanie danych, null, downgrade i ponowny upgrade.
- Testy formularza dodatkowo sprawdzają niezależność opisu i polecenia, zmianę motywu bez ponownego odczytu i utraty treści oraz blokadę na czas zapisu i ponowienie tego samego PATCH po błędzie. Test API potwierdza niezależną edycję opisu i polecenia w READY oraz odrzucenie wyczyszczenia polecenia przez null.
- Migracja downgrade 0004 / upgrade head: zachowane istniejące identyfikatory, tytuły, autorzy, statusy i flagi archiwizacji; nowe pola null.
- `alembic check`: brak rozbieżności modelu i schematu.
- `npm run build --prefix frontend`: sukces. Vite zgłasza ostrzeżenie o rozmiarze osobnego pakietu Monaco; edytor nie jest częścią początkowego pakietu aplikacji.
- Przeglądarka w narzędziu Browser niedostępna: wizualna kontrola i interakcja z rzeczywistym Monaco pozostają do ręcznej weryfikacji. Testy formularza zastępują Monaco atrapą, nie weryfikują rzeczywistego renderowania kolorowania składni.

## Scenariusze ręczne

1. Utwórz DRAFT: uzupełnij osobno krótki opis, krótką teorię, treść zadania i wielowierszowy Python. Zapisz i otwórz edycję ponownie; sprawdź wszystkie pola, puste wiersze i wcięcia.
2. Zmień wyłącznie kod, zapisz i odśwież stronę. Następnie wyczyść opcjonalne pola i ponownie zapisz.
3. Wpisz Python z `def`, komentarzem i napisem. Sprawdź kolorowanie i numery linii. Zmień motyw aplikacji light/dark bez zapisu: Monaco ma zmienić motyw i zachować treść.
4. Ustaw READY z pustym poleceniem: zapis jest odrzucony. DRAFT z pustym poleceniem jest dozwolony. Czas 0, ujemny lub ułamkowy jest odrzucony.
5. Zasymuluj błąd zapisu i wolne API: dane pozostają w formularzu, podczas zapisu pola i Monaco są zablokowane, zapis można ponowić.
6. Zarchiwizuj zadanie i otwórz je ponownie. Pola i Monaco są tylko do odczytu; bezpośredni PATCH nowych pól zwraca 409. Przywrócenie odblokowuje edycję.

KAN-27 i KAN-28 nie są implementowane. Przypadki testowe i progresywne podpowiedzi zachowują dotychczasowe placeholdery.
