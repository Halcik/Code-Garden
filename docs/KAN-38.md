# KAN-38 — rozwiązania uczniów po stronie nauczyciela

Implementacja na branchu `feature/student-submission-view`. Widok jest wyłącznie do odczytu i korzysta z formalnych snapshotów KAN-37. Nie pobiera draftu ucznia ani nie uruchamia ponownie jego kodu.

## Zmienione i dodane pliki

- `backend/app/api/teacher_submissions.py` — trzy endpointy odczytu i kontrola dostępu.
- `backend/app/schemas/teacher_submission.py` — osobne schematy nauczyciela.
- `backend/app/main.py` — rejestracja routera.
- `backend/app/api/student.py` — zebranie szczegółów hidden tests podczas formalnego submission.
- `backend/app/services/solution_check.py` — opcjonalne zebranie szczegółów hidden tests; domyślny check pozostaje zanonimizowany.
- `backend/app/services/solutions.py` — zapis pełnego wyniku w prywatnej części istniejącego snapshotu i osobnego, zredagowanego wyniku ucznia.
- `backend/tests/test_teacher_submissions.py` — testy integracyjne KAN-38.
- `frontend/src/api/teacherSubmissions.ts` — typy i odczyty API.
- `frontend/src/pages/TeacherSubmissionsPage.tsx` — lista uczniów, historia i szczegóły wersji.
- `frontend/src/pages/TeacherSubmissionQueuePage.tsx` — centralna kolejka w osobnej zakładce „Prace uczniów”.
- `frontend/src/pages/TeacherSubmissionQueuePage.test.tsx` — nawigacja boczna, kolejka, filtry, paginacja i błędy.
- `frontend/src/pages/TeacherSubmissionsPage.test.tsx` — testy komponentu i nawigacji.
- `frontend/src/styles/teacher-submissions.css` — układ i motywy na istniejących tokenach.
- `frontend/src/assets/submissions/{dark-Avatar,dark-Check,dark-FileCode2,light-Check,light-FileCode2,list-Avatar}.svg` — lokalne zasoby z Figmy.
- `frontend/src/App.tsx` — routing.
- `frontend/src/pages/TeacherTasksPage.tsx` — wejście z listy zadań i kontekst nagłówka.
- `frontend/src/pages/TaskFormPage.tsx` — wejście ze szczegółów zadania.
- `docs/KAN-38.md` — opis implementacji i weryfikacji.

## API i schematy

Wszystkie endpointy wymagają aktywnego, zatwierdzonego `TEACHER` i ustawiają `Cache-Control: no-store`. Istniejąca polityka nie daje `ADMIN` dostępu do endpointów nauczyciela; nie została rozszerzona.

| GET | Odpowiedź |
| --- | --- |
| `/teacher/submissions?q=&task_id=&sort=newest&limit=25&offset=0` | Centralna kolejka: `{items: [{student, task, submission_count, used_hint_count, latest_submission}], tasks, total, limit, offset}` |
| `/teacher/tasks/{task_id}/submissions?limit=25&offset=0` | `{items: [{student, submission_count, latest_submission}], total, limit, offset}` |
| `/teacher/tasks/{task_id}/students/{student_id}/submissions` | `{student: student lub null, items: [summary]}` |
| `/teacher/submissions/{submission_id}` | Szczegóły opisane poniżej |

`student` zawiera `id`, `login`, `status`. Dane konta są bieżącymi metadanymi, a nie snapshotem nazwy użytkownika. Nieaktywne konta pozostają widoczne; istniejące klucze obce `RESTRICT` chronią konta powiązane z submissions przed usunięciem.

`summary` zawiera `id`, `version`, `submitted_at`, `passed_tests`, `failed_tests`, `total_tests`, `all_passed`.

Szczegóły zawierają pola `summary` oraz:

```text
task_id
student
source_code
used_hints: [{hint_id, reveal_order, revealed_at}]
test_results: [{number, definition, result, execution_details_available}]
```

`definition` pochodzi z historycznej definicji testu: nazwa, typ, konfiguracja, ukrycie, pozycja i historyczny identyfikator. `result` pochodzi z historycznego wykonania. Lista i historia nie zwracają kodu ani wyników poszczególnych testów; zapytania SQL również pomijają kolumnę kodu.

## Ownership i IDOR

Lista i historia używają istniejącego `owned_task`, sprawdzającego jednocześnie `Task.id` i `Task.author_id`. Szczegóły łączą `Submission` z `Task` i filtrują właściciela w tym samym zapytaniu. Nie ma dostępu po samym `submission_id` bez ownership. Cudze i nieistniejące zadania/wersje zwracają 404, nieuprawnione role 403, brak sesji 401.

`student_id` w historii ogranicza submissions do wskazanego zadania. Jeśli takich rekordów nie ma, endpoint zwraca pustą historię i `student: null`, bez ujawniania danych obcego konta.

## UI i historia

Główna ścieżka: **Prace uczniów → kolejka oceniania → rozwiązanie ucznia → wersja**. Osobna pozycja bocznego menu otwiera `/teacher/submissions`; szczegóły mają adres `/teacher/submissions/tasks/{task_id}/students/{student_id}`, więc zakładka pozostaje aktywna. Kolejka obejmuje wszystkie zadania zalogowanego nauczyciela, pokazuje najnowszą wersję dla każdej pary uczeń–zadanie, liczbę wersji, liczbę użytych podpowiedzi i wynik testów. Wyszukiwanie ucznia/zadania, filtr zadania, sortowanie i paginacja działają w backendzie. Dodatkowe wejście ze strony zadania pozostaje dostępne.

Lista pokazuje tylko uczniów z formalnym submission: login, liczbę wersji, datę i wynik najnowszej wersji. Jest stronicowana. Wersje są uporządkowane malejąco według numeru; najnowsza otwiera się domyślnie. Wybór wersji pobiera tylko jej szczegóły. Poprzedni kod jest usuwany z widoku podczas ładowania; anulowanie i sprawdzenie sygnału chronią przed spóźnioną odpowiedzią.

Kod prezentuje istniejący lokalny Monaco z `readOnly` i `domReadOnly`, bez zapisu. Podsumowanie pokazuje datę, numer wersji, zaliczone i niezaliczone testy, `all_passed` oraz liczbę podpowiedzi.

Rozwijane wyniki pokazują public/hidden, PASS/FAIL, typ i wszystkie zapisane pola konfiguracji oraz wykonania: wejście, oczekiwany i rzeczywisty wynik, funkcję i argumenty, regułę strukturalną, stderr, status wykonania, czas i pamięć, jeśli zapisano. Obsługiwane są również błędy wykonania i przekroczenie czasu. Nie są dopisywane brakujące tracebacki ani nowe oceny.

Układ kolejki, czterech kart, zakładek, filtrów, tabeli, panelu kodu i prawego panelu historii opiera się na podanych projektach Figmy. Jasny i ciemny motyw używają istniejących tokenów i lokalnych zasobów, w tym `queue-*.svg` oraz `queue-light-*.svg`. Zachowano wspólny panel nauczyciela i przełącznik motywu. W modelach nie ma decyzji nauczyciela, grup ani terminów: karty zaakceptowanych/poprawek/terminów pokazują brak danych, odpowiednie zakładki i filtry są wyłączone. „Do przejrzenia” obejmuje wszystkie dostępne prace; przełączenie „Wszystkie” pokazuje ten sam zbiór do czasu wdrożenia oceniania. Wynik testów nie tworzy decyzji o akceptacji. Feedback i mutacje ocen pozostają poza zakresem.

## Snapshoty i ograniczenia historyczne

Nie powstał nowy model historii ani migracja. Pełny wynik nowych submissions jest zapisywany jako `teacher_result` wewnątrz istniejącego JSONB `SolutionTestResult.definition`; odpowiedź nauczyciela wydziela go jako `result`. `student_result` pozostaje zredagowany, również kiedy submission aktualizuje ostatni check draftu. Student API nie zwraca prywatnej definicji ani `teacher_result`.

KAN-37 nie zapisywał rzeczywistego wyniku wykonania hidden tests. Stare rekordy pokazują zachowane definicje i PASS/FAIL oraz komunikat o braku szczegółów. Nie są rekonstruowane z aktualnych testów.

KAN-37 zapisywał identyfikator hintu, kolejność i datę odkrycia, bez treści. Widok prezentuje te historyczne dane i jasno informuje o braku historycznej treści. Nie pobiera bieżącej treści hintu. Zmiana/usunięcie/reordering hintu nie zmienia prezentacji historii.

## Wydajność

Lista agreguje `count` i `max(version)` po uczniu w podzapytaniu, a następnie łączy najnowszy submission i konto ucznia. Nie wykonuje odrębnych zapytań dla każdego ucznia. Limit wynosi 1–100. Test kontroluje liczbę zapytań listy. Szczegóły osobno odczytują wersję z ownership, konto, wyniki i użyte podpowiedzi.

Centralna kolejka grupuje po zadaniu i uczniu, ogranicza zbiór do właściciela już w podzapytaniu oraz agreguje liczbę użytych hintów bez N+1. Lista opcji zadania zawiera wyłącznie zadania właściciela. Filtr po identyfikatorze cudzego zadania zwraca 404; filtr tekstowy escapuje znaki wildcard.

## Weryfikacja

- Pełny backend na izolowanej bazie PostgreSQL: **401 passed, 4 skipped**. Cztery testy integracyjne wymagające dodatkowej konfiguracji Judge0 zostały pominięte.
- Po dodaniu dodatkowych przypadków błędu wykonania, timeoutu i starego hidden snapshotu: `pytest tests/test_teacher_submissions.py -q` — **6 passed**.
- Wcześniejszy wspólny przebieg KAN-38 i KAN-37: **36 passed**.
- Pełny frontend: `npm --prefix frontend test -- --maxWorkers=2` — **264 passed**, 17 plików. Ograniczenie liczby workerów pozwala uniknąć timeoutów przy równoległym obciążeniu.
- Po ostatnich zmianach widoku i nagłówka: testy widoku i listy nauczyciela — **23 passed**; po doprecyzowaniu danych runtime testy nowego widoku — **6 passed**.
- `npm --prefix frontend run build` — poprawny; pozostaje ostrzeżenie o rozmiarze paczki Monaco.
- `git diff --check` — bez błędów whitespace.
- Po dodaniu centralnej kolejki: backend KAN-38 **7 passed**, frontend kolejki/listy/szczegółów **27 passed**, build poprawny.
- Pobrane SVG są niepuste, zachowują rozmiary źródłowe i nie korzystają z tymczasowych adresów Figmy. Brak szerokich reguł CSS nadpisujących rozmiary tych ikon.
- **Nie wykonano kontroli renderu w przeglądarce**: po sprawdzeniu dostępności narzędzie zwróciło brak przeglądarek. Zgodność wizualna obu motywów wymaga ręcznego sprawdzenia.

Poza zakresem pozostają: oceny, komentarze, feedback liniowy, diff, przywracanie/edycja/usuwanie submission, eksport, analityka, statystyki klasy i podgląd draftu.
