# KAN-37 — Formalne wysłanie rozwiązania

## Rozszerzenie: postęp na liście zadań

Na późniejsze życzenie dodano statusy na kartach oraz działające filtry `progress_status` w GET `/student/tasks`. `NOT_STARTED` oznacza brak draftu i submission, `IN_PROGRESS` — istniejący draft bez formalnego wysłania, `COMPLETED` — co najmniej jedno skuteczne formalne wysłanie, również z niezaliczonymi testami. Kolejna edycja draftu nie odbiera statusu ukończenia. Status jest wyliczany z własnych rekordów ucznia; filtrowanie poprzedza paginację i zliczanie wyników. Nie wymaga nowej migracji. Filtr „Po terminie” pozostaje nieaktywny.

Rozszerzenie zmienia dodatkowo `backend/app/services/task_catalog.py`, `backend/app/schemas/task.py`, `backend/tests/test_student_tasks.py`, `frontend/src/pages/StudentTasksPage.tsx`, `frontend/src/pages/StudentTasksPage.test.tsx` i `frontend/src/styles/student-tasks.css`. Weryfikacja backendu katalogów studenta i nauczyciela: 43 testy zaliczone; testy widoku katalogu: 24 zaliczone.

## Modele i migracja

Migracja `0010_solution_submissions.py` (po `0009`) tworzy:

| Model | Przeznaczenie i relacje |
| --- | --- |
| `SolutionDraft` | Jeden rekord na student + task; kod, rewizja, licznik sprawdzeń, następna wersja submission, hash i data checka oraz podsumowanie. FK użytkownika i zadania: RESTRICT. |
| `DraftUsedHint` | FK draftu i istniejącej podpowiedzi, `revealed_at`; UNIQUE draft + hint. Usunięcie żywej podpowiedzi usuwa jej bieżące użycie. |
| `Submission` | Snapshot kodu, właściciela, zadania, wersji, podsumowania i daty wysłania. UNIQUE student + task + version. |
| `SubmissionUsedHint` | FK submission, historyczny identyfikator hintu, czas i kolejność odkrycia. Bez kopii treści i bez zależności od usuwalnego rekordu hintu. |
| `SolutionTestResult` | Jeden wiersz na test; właścicielem jest dokładnie jeden draft lub submission. Kopia definicji testu i osobno bezpieczny wynik dla ucznia. |

Wszystkie FK mają indeksy. Constrainty zapewniają pojedynczy draft, unikalne wersje, dodatnią wersję oraz jednoznacznego właściciela wyniku. Snapshoty testów zachowują historyczne ID bez FK do edytowalnych/usuwalnych testów. Triggery PostgreSQL blokują UPDATE/DELETE submissionów, ich podpowiedzi i ich wyników. Wyniki draftu można zastępować.

`alembic upgrade head` stosuje migrację. `downgrade` usuwa triggery, funkcję i nowe tabele. Migracja nie zmienia istniejących zadań, testów ani podpowiedzi.

## Endpointy

Wszystkie ścieżki poniżej zaczynają się od `/student/tasks/{task_id}`. Dostęp: aktywny STUDENT, własne dane wynikające z sesji, wyłącznie READY i niearchiwalne zadanie. ADMIN i TEACHER otrzymują 403; niewidoczne zadanie 404. Odpowiedzi mają `Cache-Control: no-store`; operacje zapisujące sprawdzają origin.

| Metoda i końcówka | Zachowanie |
| --- | --- |
| GET `/draft` | Pobranie lub inicjalizacja draftu. Zwraca także ostatni check, aktualność, użyte hinty i podsumowanie ostatniego submission. |
| PUT `/draft` | `{source_code, revision?}`. Aktualizacja istniejącego rekordu; konflikt podanej rewizji daje 409. |
| GET `/hints` | Liczba podpowiedzi i wcześniej odkryte podpowiedzi (`revealed`). Sam odczyt nie zapisuje użycia. |
| GET `/hints/{number}` | Dotychczasowy odczyt jednej podpowiedzi; sam nie zmienia stanu użycia. |
| POST `/hints/{number}/reveal` | Jawne, idempotentne zapisanie użycia i zwrócenie podpowiedzi. Numer jest aktualnym numerem w kolejności nauczyciela; zapis używa ID hintu. |
| GET `/revealed-hints` | Wyłącznie wcześniej odkryte podpowiedzi zalogowanego ucznia. |
| POST `/check` | Istniejący checker KAN-34/35; `{source_code, revision?}`. Wynik trafia do draftu, bez submission. |
| POST `/submissions` | `{revision}`. Testuje kod odczytany z draftu, zwraca 201 i `{submission, draft}`. |
| POST `/run` | Dotychczasowe wykonanie kodu edytora ze stdin; bez submission. |

Przy `/check` klient przekazujący rewizję wcześniej zapisuje edytor; sam check nie nadpisuje wtedy draftu. To pozwala zachować nowszą edycję podczas testowania starszego kodu. Dotychczasowi klienci bez rewizji zapisują przekazany kod przed checkiem. Wynik zawsze odnosi się do `source_code` requestu checka.

Frontend nie przekazuje identyfikatora ucznia, wersji submission, listy użytych hintów ani wyników testów jako danych zaufanych. Dodatkowe pola requestów są odrzucane. Limit wynosi 100 KB UTF-8 jak dla execution; pusty draft jest dozwolony, pusty check/submission nie. Nieprawidłowy lub zbyt długi starter nie jest obcinany.

## Lifecycle draftu

1. GET tworzy draft ze startera tylko, jeśli para student + task jeszcze go nie ma. Równoległa inicjalizacja używa `ON CONFLICT DO NOTHING` i UNIQUE. Późniejsza zmiana startera nie nadpisuje pracy ucznia.
2. Monaco wczytuje kod z backendu. Zapis następuje po 750 ms przerwy w edycji lub przez przycisk zapisu. Status pokazuje niezapisane zmiany, zapisywanie, sukces albo błąd.
3. Frontend szereguje zapisy. Odpowiedź zapisu nigdy nie ustawia kodu edytora; nowsze zmiany są dopisywane kolejnym requestem. Rewizja kontroluje konflikt z inną kartą.
4. Odkrycie hintu zapisuje jego ID i pierwszy `revealed_at`. Powtórzenie nie tworzy duplikatu ani nie zmienia czasu. Po odświeżeniu UI odtwarza odkryte hinty.
5. Check wykorzystuje dotychczasowy `check_solution`. Zapisuje podsumowanie, oddzielne wyniki testów, `checked_at` i SHA-256 dokładnie sprawdzonego kodu. Licznik obejmuje próby checków oraz skuteczne sprawdzenia przy submission.
6. Zapis nowego kodu zachowuje ostatnie wyniki. Backend wylicza aktualność przez porównanie hashy, bez timestampów. UI od razu pokazuje „Kod został zmieniony od ostatniego sprawdzenia.”, również przed autosave.
7. Skuteczne submission zachowuje ten sam rekord draftu, kod i hinty; ostatni wynik pochodzi ze świeżego testowania. Jeśli podczas testów zapisano nowszy kod, nie jest on nadpisywany, a wynik jest oznaczony jako nieaktualny. Nowszy rozpoczęty check ma pierwszeństwo przed starszym kończącym się sprawdzaniem.

Backend jest magazynem draftu; brak localStorage. Nie powstaje historia wszystkich zapisów draftu.

## Lifecycle submissionu i spójność

1. Natywny dialog wymaga potwierdzenia ponownego testowania. Przycisk jest zablokowany podczas wysyłania, a dodatkowa blokada w pamięci chroni przed podwójnym handlerem.
2. Frontend czeka na zapis aktualnych zmian i przesyła rewizję. Backend sprawdza rewizję, przejmuje kod, hinty oraz kopię uporządkowanych definicji testów i ustawień wykonania.
3. Backend zawsze uruchamia pełny zestaw przez istniejący checker, niezależnie od wcześniejszego wyniku. Definicje są kopiowane przed wykonaniem, więc zmiana nauczyciela w czasie testów nie zmienia bieżącego sprawdzania.
4. Niezgodny output, runtime error, TLE kodu ucznia i niezaliczony test strukturalny są wiarygodnymi wynikami failed i pozwalają wysłać rozwiązanie. Awaria infrastruktury przerywa operację bez submission; UI pozwala ponowić próbę.
5. Po testach krótka blokada `SELECT FOR UPDATE` draftu szereguje przydział `next_version`. UNIQUE jest dodatkowym zabezpieczeniem. Dwa równoległe skuteczne requesty mogą utworzyć dwie kolejne, poprawnie ponumerowane wersje.
6. W jednej transakcji zapisują się submission, wszystkie wyniki i hinty, zwiększenie numeru oraz aktualizacja ostatniego checka draftu. Błąd zapisu wycofuje całość, łącznie z numerem wersji i zmianami checka. Wcześniej zapisany kod pozostaje bezpieczny.
7. UI pokazuje wersję, datę i wynik ostatniego submission oraz pozwala od razu kontynuować edycję. Kolejne wysłanie tworzy nowy snapshot.

Nie ma blokady rekordu ani otwartej transakcji podczas oczekiwania na Judge0. Testy integracyjne obejmują równoległe requesty na PostgreSQL, optymistyczny konflikt zapisu oraz zmianę kodu i testów w czasie wykonania.

## Snapshoty i hidden tests

Każdy wynik zawiera historyczną definicję testu, w tym expected output/config, oraz osobny wynik przefiltrowany przez checker KAN-34/35. Późniejsza edycja lub usunięcie testu nie zmienia snapshotu. Snapshot hintów przechowuje ID, czas i kolejność z chwili rozpoczęcia wysyłania; późniejsze odkrycia i usunięcia hintów nie zmieniają historii.

Definicje testów nigdy nie są serializowane w odpowiedzi studenta. Odpowiedź draftu używa wyłącznie `student_result`; hidden test ma wyłącznie numer, pozycję, typ, status i flagę widoczności. Brak hidden input, expected output, regexu, argumentów, wrappera i diagnostyki pozwalającej odtworzyć test. Submission zwraca wyłącznie podsumowanie i bezpieczny draft.

## Zmienione pliki

Backend:

- `backend/alembic/env.py`
- `backend/alembic/versions/0010_solution_submissions.py`
- `backend/app/api/student.py`
- `backend/app/models/__init__.py`
- `backend/app/models/solution.py`
- `backend/app/schemas/solution.py`
- `backend/app/schemas/solution_check.py`
- `backend/app/schemas/task_hint.py`
- `backend/app/services/solutions.py`
- `backend/tests/conftest.py`
- `backend/tests/test_solution_check.py`
- `backend/tests/test_solution_submissions.py`
- `backend/tests/test_student_task_details.py`

Frontend:

- `frontend/src/api/solutions.ts`
- `frontend/src/api/studentHints.ts`
- `frontend/src/api/studentTasks.ts`
- `frontend/src/components/StudentTaskHints.tsx`
- `frontend/src/components/StudentTaskHints.test.tsx`
- `frontend/src/components/SubmitConfirmation.tsx`
- `frontend/src/components/useSolutionDraft.ts`
- `frontend/src/pages/StudentTaskPage.tsx`
- `frontend/src/pages/StudentTaskPage.test.tsx`
- `frontend/src/pages/SolutionSubmissions.test.tsx`
- `frontend/src/styles/student-task.css`

Dokumentacja: `docs/KAN-37.md`.

## Weryfikacja

| Sprawdzenie | Wynik |
| --- | --- |
| Pełny backend `pytest backend/tests -q` z PostgreSQL 17 | 387 passed, 4 skipped; 51,62 s |
| Nowy zestaw `test_solution_submissions.py` | 30 passed |
| `npm --prefix frontend test` | 255 passed, 16 plików; 14,62 s |
| `npm --prefix frontend run build` | Poprawny TypeScript i build produkcyjny |
| Alembic downgrade do 0009, upgrade head, check | Poprawne; brak różnic modeli i migracji |
| `git diff --check` | Bez błędów whitespace |

Backend sprawdzono na osobnym, jednorazowym PostgreSQL, bez zmieniania lokalnej bazy aplikacji. Cztery pominięte testy to integracje z prawdziwym Judge0, wymagające `TEST_JUDGE0_URL`. Pozostaje istniejące ostrzeżenie deprecacji AnyIO. Build zgłasza duży chunk Monaco. Jeden przebieg frontendu podczas równoległej pracy miał timeout istniejącego testu `TaskCreateDrafts`; ponowienie całego zestawu przeszło bez zmiany tego testu.

Nowe testy obejmują inicjalizację, trwałość i izolację draftów, limit bajtów, jawne użycie hintów, aktualność checka, świeże testowanie przy wysyłaniu, failed vs infrastructure error, rollback, niezmienność snapshotów, usuwanie żywych definicji, uprawnienia, widoczność, równoległe wersjonowanie, konflikt zapisu i edycję podczas wykonania. Testy UI obejmują debounce, serializację zapisów, obsługę błędu, odtworzenie hintów, staleness, dialog, blokadę double submit, pełne i częściowe zaliczenie oraz kontynuację pracy.

## Ograniczenia i dalsze tickety

- Autosave nie gwarantuje zapisu ostatnich 750 ms przed nagłym zamknięciem karty lub utratą sieci. Błąd zapisu pozostawia kod w edytorze; można ponowić zapis.
- Konflikt między kartami daje 409; nie ma automatycznego scalania kodu. Uczeń zachowuje swój lokalny bufor i otrzymuje komunikat o skopiowaniu kodu przed odświeżeniem.
- Backend zapewnia unikalne wersje, ale nie deduplikuje dwóch niezależnych skutecznych POST-ów. Każdy jest osobnym formalnym wysłaniem.
- Przechowywane są ostatni check i licznik prób, bez pełnej historii checków ani pomiaru czasu pracy.
- Testy integracyjne KAN-37 używają prawdziwego PostgreSQL i kontrolowanego adaptera Judge0. Cztery istniejące testy wymagają `TEST_JUDGE0_URL` i działającego self-hosted Judge0.
- Poza zakresem pozostają historia/diff/przywracanie wersji w UI, oceny, komentarze, punktacja, rankingi, automatyczne ukończenie zadania, analityka i rekomendacje/ML.
