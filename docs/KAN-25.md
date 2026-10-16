# KAN-25 — tworzenie i edycja zadania

## Zmiany

- `backend/app/api/teacher.py`: tworzenie, odczyt i częściowa aktualizacja; wspólne wyszukanie zadania właściciela; kontrola Origin przy zapisie.
- `backend/app/schemas/task.py`: TaskCreate i TaskUpdate; ponowne wykorzystanie TaskResponse i istniejących enumów.
- `frontend/src/api/tasks.ts`: klient GET/POST/PATCH i komunikaty błędów.
- `frontend/src/pages/TaskFormPage.tsx`: wspólny formularz tworzenia i edycji, walidacja, loading/error/saving/success i ponawianie odczytu.
- `frontend/src/App.tsx`, `TeacherTasksPage.tsx`: routing i linki do formularza, usunięcie placeholderów formularza, potwierdzenie utworzenia na liście.
- `frontend/src/styles/teacher-tasks.css`: responsywny formularz wykorzystujący istniejące tokeny jasnego i ciemnego motywu; sekcja podstawowych informacji z Figma 2:71322.
- `TaskFormPage.test.tsx`, `TeacherTasksPage.test.tsx`, `backend/tests/test_teacher_tasks_integration.py`: testy formularza, nawigacji i API.

## API

| Metoda | Ścieżka | Wynik |
| --- | --- | --- |
| POST | /teacher/tasks | 201, utworzone zadanie |
| GET | /teacher/tasks/{task_id} | 200, własne zadanie |
| PATCH | /teacher/tasks/{task_id} | 200, zaktualizowane zadanie |

Wszystkie endpointy wymagają aktywnego, zatwierdzonego TEACHER. STUDENT i ADMIN otrzymują 403, brak sesji 401. Odczyt i aktualizacja filtrują jednocześnie po `id` i `author_id` zalogowanego użytkownika. Obce i nieistniejące zadania zwracają 404. POST przypisuje autora z sesji. Nieznane pola, w tym `author_id`, są odrzucane (422). Odpowiedzi sukcesu mają Cache-Control: no-store.

Tworzenie wymaga title, topic, difficulty i task_type. Status domyślny to DRAFT; description domyślnie jest pusty, czas jest opcjonalny. Tytuł i temat są przycinane i nie mogą być puste (limity 200 i 100 znaków). Czas to dodatnia liczba całkowita mieszcząca się w PostgreSQL INTEGER. Enumy zachowują istniejące wartości. PATCH aktualizuje tylko przesłane pola; null jest dozwolony wyłącznie dla czasu, a puste body jest odrzucane.

## Frontend

`/teacher/tasks/new` otwiera pusty formularz ze statusem DRAFT. Po POST wraca do listy i pokazuje potwierdzenie. `/teacher/tasks/:taskId/edit` pobiera dane i wysyła PATCH wyłącznie ze zmienionymi polami. Wyczyszczenie czasu wysyła null. Brak zmian nie wywołuje PATCH. Zapis blokuje pola oraz ponowne wysłanie. Błąd zapisu zachowuje wpisane dane.

## Weryfikacja

- `npm test --prefix frontend`: 50 testów zakończonych sukcesem, w tym 9 nowych testów formularza TSX.
- `npm run build --prefix frontend`: sukces.
- `pytest -q` z TEST_DATABASE_URL na osobnej bazie PostgreSQL 17: 136 testów zakończonych sukcesem.
- Brak dostępnej przeglądarki w narzędziu Browser: wizualne porównanie uruchomionego widoku z Figmą pozostaje do wykonania.

## Scenariusze ręczne

1. Zaloguj zatwierdzonego nauczyciela, kliknij Utwórz zadanie, uzupełnij dane i zapisz. Sprawdź potwierdzenie i obecność zadania na liście.
2. Otwórz zadanie z listy, zmień tytuł/status/opis, wyczyść czas i zapisz. Odśwież widok, sprawdź trwałość zmian.
3. Spróbuj zapisać pusty tytuł, same spacje w temacie oraz czas 0, ujemny lub ułamkowy. Sprawdź komunikat bez utraty danych.
4. Spowolnij sieć: sprawdź ładowanie i blokadę wielokrotnego zapisu. Zasymuluj błąd API, następnie ponów zapis/odczyt.
5. Otwórz identyfikator zadania nauczyciela B jako nauczyciel A; GET i PATCH powinny zwrócić 404. STUDENT i ADMIN nie mogą korzystać z formularza ani endpointów.
6. Wyślij author_id w POST/PATCH: oczekuj 422 i braku zmiany autora.
7. Sprawdź formularz oraz komunikaty w obu motywach i na wąskim ekranie; sprawdź Anuluj oraz Wróć do listy zadań.

## Pełny wygląd edytora z Figmy

Na prośbę o pełny wygląd ekran rozszerzono o nagłówek z akcjami, układ głównej kolumny oraz panelu 300 px, a także wszystkie karty projektu: treści edukacyjne, kod startowy, przypadki testowe, podpowiedzi, ustawienia wykonania, gotowość i publikację. Obsługiwane są jasny i ciemny motyw oraz układ mobilny. Ikony SVG pochodzą bezpośrednio z obu wariantów Figmy i są zapisane lokalnie.

Funkcje kolejnych etapów mają widoczne oznaczenia Placeholder i nieaktywne przyciski/pola. Przypadki testowe, podpowiedzi, kod oraz limity są wyłącznie przykładami wyglądu. Nie trafiają do POST/PATCH. Gotowość nie pokazuje fałszywego potwierdzenia zaliczenia testów. Niezaimplementowane pozycje menu i akcje nagłówka również są nieaktywne.

Nowe komponenty: `components/teacher/EditorIcon.tsx`, `TaskEditorPlaceholders.tsx`; style: `styles/task-editor.css`; zasoby: `assets/teacher/editor/`.

Po rozszerzeniu wyglądu: 52 testy frontendu zaliczone, build zakończony sukcesem. Testy TSX obejmują obecność placeholderów w obu motywach, blokady przyszłych akcji i brak pól placeholderów w zapisywanym żądaniu. Wizualne porównanie w przeglądarce nadal pozostaje niewykonane z powodu braku dostępnej przeglądarki w narzędziu.

Korekta zakresu: panel tworzenia i edycji korzysta ze wsp?lnego menu bocznego i g?rnego paska listy zada?. Pe?ny wygl?d Figmy i placeholdery dotycz? wy??cznie zawarto?ci ekranu.

## Archiwizacja i przywracanie (rozszerzenie KAN-25)

### Zmienione pliki

- `backend/app/models/task.py`: `is_archived`, niezależne od statusu DRAFT/READY.
- `backend/alembic/versions/0004_task_archive.py`: nowa kolumna BOOLEAN NOT NULL DEFAULT false; dotychczasowe rekordy pozostają aktywne. Downgrade usuwa wyłącznie tę kolumnę.
- `backend/app/schemas/task.py`: flaga w odpowiedzi oraz schemat odrzucający dodatkowe pola w akcjach archive/restore.
- `backend/app/api/teacher.py`: filtr archived, akcje archive/restore i backendowa blokada edycji archiwalnych zadań.
- `frontend/src/api/tasks.ts`: kontrakt flagi, filtr i klient nowych endpointów, obsługa 409.
- `frontend/src/pages/TeacherTasksPage.tsx`: zakładka archiwalnych, menu …, przywracanie, kolumna użycia i odświeżanie listy/metryk.
- `frontend/src/pages/TaskFormPage.tsx`: bezpośredni odczyt archiwalnego zadania bez możliwości edycji, przywrócenie i ponowny odczyt.
- `frontend/src/styles/teacher-tasks.css`, `task-editor.css`: menu akcji i komunikat tylko do odczytu.
- `backend/tests/test_teacher_tasks_integration.py`, `TeacherTasksPage.test.tsx`, `TaskFormPage.test.tsx`: integracyjne testy API i testy zachowania interfejsu.

### Migracja

Przed uruchomieniem aplikacji zastosuj migracje w katalogu backend:

```sh
python -m alembic upgrade head
```

Rewizja 0004 rozszerza 0003. Nie dodaje nowego statusu ani nie usuwa rekordów. Nie dodano seedera ani plików z danymi testowymi.

### Endpointy i bezpieczeństwo

- `PATCH /teacher/tasks/{task_id}/archive`: 200 z aktualnym zadaniem, ustawia is_archived=true.
- `PATCH /teacher/tasks/{task_id}/restore`: 200 z aktualnym zadaniem, ustawia is_archived=false.
- Obie akcje dopuszczają brak body lub pusty obiekt; nie przyjmują author_id ani innych pól (422). Są idempotentne — powtórzenie nie aktualizuje ponownie rekordu ani jego czasu modyfikacji.
- Dostęp wyłącznie dla aktywnego, zatwierdzonego TEACHER. Brak sesji: 401. STUDENT/ADMIN: 403. Obcy lub nieistniejący zasób: 404. Obowiązuje istniejąca kontrola Origin.
- Wyszukanie po id i author_id pozostaje wspólne. Zapis, archiwizacja i przywracanie blokują wiersz przez SELECT FOR UPDATE, żeby równoległa edycja nie omijała kontroli archiwizacji.
- `PATCH /teacher/tasks/{task_id}` odrzuca edycję archiwalnego zadania kodem 409. GET nadal udostępnia właścicielowi dane do odczytu. Przywrócenie zachowuje właściwy status i ponownie pozwala edytować.
- Flagi is_archived nie można ustawić przez zwykły POST/PATCH zadania.

### Lista, zakładki i metryki

`GET /teacher/tasks` bez parametru archived obejmuje aktywne i archiwalne zadania. `archived=true` wybiera wyłącznie archiwalne; `archived=false` wyłącznie aktywne. Filtr współpracuje z wyszukiwaniem, pozostałymi filtrami i paginacją.

Zakładka Wszystkie nie wysyła filtra archiwizacji, a Zarchiwizowane wysyła archived=true i zeruje offset. Wersje robocze wybierają aktywne zadania DRAFT. Przypisane/Publiczne/W recenzji pozostają nieaktywnymi placeholderami; nie implementowano tych workflow. Nie dodano dropdownu archiwizacji ani nowego ekranu.

Aktywne zadanie ma Otwórz oraz menu … z pozycją Archiwizuj. Archiwalne ma stan Zarchiwizowane, użycie Tylko do odczytu i główną akcję Przywróć. Tytuł prowadzi do tego samego widoku, który dla archiwalnego zadania ma zablokowane pola i akcję przywrócenia. Po mutacji lista i dynamiczne metryki są pobierane ponownie. Wszystkie zadania obejmują archiwalne; tekst X aktywnych · Y zarchiwizowanych wynika z odczytów API. Błędy są widoczne, a akcje blokowane na czas żądania. Pozostałe metryki zachowują uproszczoną implementację.

### Weryfikacja rozszerzenia

- Frontend: 56 testów zaliczonych, w tym archiwizacja z menu, odświeżenie metryk, zakładka archiwum, przywrócenie, błędy/blokada powtórnego żądania i bezpośredni widok tylko do odczytu.
- Backend na osobnej, jednorazowej bazie PostgreSQL 17: 144 testy zaliczone, w tym role, ownership, idempotencja, zachowanie statusu, blokada edycji i ponowna edycja po restore.
- Migracja downgrade 0003 / upgrade head: zachowane dotychczasowe zadania, autorzy i statusy; nowa flaga false dla istniejących rekordów.
- `alembic check`: brak rozbieżności modelu i schematu.
- Uruchomienie aplikacji FastAPI i GET /health: sukces.
- `npm run build --prefix frontend`: sukces.

### Ręczne scenariusze

1. W Wszystkie otwórz menu … własnego aktywnego zadania i wybierz Archiwizuj. Sprawdź komunikat, stan Zarchiwizowane, użycie Tylko do odczytu i akcję Przywróć. Zadanie nadal jest w Wszystkie.
2. Otwórz Zarchiwizowane. Sprawdź, że lista zawiera wyłącznie archiwalne zadania, również po wyszukiwaniu i zmianie strony.
3. Kliknij Przywróć. Zadanie znika z archiwum, pozostaje w Wszystkie, zachowuje DRAFT/READY i można je ponownie edytować. Sprawdź zmianę liczników.
4. Wejdź bezpośrednio w /teacher/tasks/{id}/edit archiwalnego zadania. Pola są tylko do odczytu; ręczny PATCH podstawowych danych zwraca 409. Przywrócenie odblokowuje formularz.
5. Jako nauczyciel A wywołaj archive/restore zadania B: 404, brak zmiany. Jako STUDENT/ADMIN: 403; bez sesji: 401.
6. Ponów archive i restore po dwa razy: końcowy stan i właściwy status pozostają zgodne. Prześlij author_id/is_archived w body akcji: 422.
7. Zasymuluj wolne połączenie i błąd API: wielokrotne kliknięcie nie wysyła równoległych operacji; błąd pozostaje widoczny i akcję można ponowić.
