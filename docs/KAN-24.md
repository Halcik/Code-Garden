# KAN-24 — Lista zadań nauczyciela

Widok `/teacher/tasks` (także przekierowanie z `/teacher`) wymaga aktywnego,
zatwierdzonego nauczyciela. `/teacher/tasks/new` i `/teacher/tasks/:taskId`
są placeholderami. Nie pobierają szczegółów zadania ani niczego nie zapisują.
Układ bazuje na ekranie Teacher tasks w Figmie, z istniejącymi tokenami obu motywów.
Kafelek „Wszystkie zadania” pobiera prawdziwy licznik total z osobnego żądania
GET /teacher/tasks bez filtrów (limit=1). Licznik jest niezależny od filtrów i strony
listy, obsługuje ładowanie oraz błąd z ponowieniem. „Wersje robocze” analogicznie
pobierają total dla status=DRAFT. Kafelki „Przypisane” i „Proces publikacji” pozostają jawnie oznaczonymi placeholderami,
bez fikcyjnych liczników. Funkcje publikacji, grup i recenzji pozostają poza zakresem.

## Model i migracja

`Task`: integer `id`, wymagane `title` (200), `description` (text, domyślnie pusty),
`topic` (100), `difficulty` (EASY/MEDIUM/HARD), `task_type`
(STANDARD/FUNCTION/STRUCTURAL), `status` (DRAFT/READY, domyślnie DRAFT),
nullable dodatnie `estimated_time_minutes`, wymagane `author_id` (FK users.id),
`created_at` i `updated_at` z informacją o strefie czasowej.
Relacje: User.tasks ↔ Task.author. Indeks author_id wspiera izolację listy.

Migracja 0003 tworzy tabelę, enumy, ograniczenia oraz triggery PostgreSQL:
autor musi mieć rolę TEACHER, autor posiadający zadania nie może zmienić roli,
UPDATE ustawia updated_at także przy ręcznym SQL. Usunięcie autora posiadającego
zadania jest blokowane przez FK (RESTRICT). Dezaktywacja i cofnięcie akceptacji
nie usuwają zadań; dostęp blokuje istniejący guard.

Uruchom z katalogu backend: `.venv/Scripts/python.exe -m alembic upgrade head`.
Downgrade do 0002 usuwa tabelę z jej danymi, triggery, funkcje i enumy.

## API

`GET /teacher/tasks` — wyłącznie TEACHER, bez dziedziczenia uprawnień przez ADMIN.
Autor jest zawsze pobierany z sesji. Nie można wskazać innego autora parametrem.

Parametry opcjonalne:

- `difficulty`: EASY, MEDIUM, HARD.
- `status`: DRAFT, READY.
- `topic`: dokładne dopasowanie bez rozróżniania wielkości liter, po trim.
- `q`: fragment tytułu bez rozróżniania wielkości liter, po trim; znaki `%` i `_` są literalne.
- `sort_by`: created_at, updated_at (domyślne), title.
- `sort_order`: asc albo desc (domyślne). Id rozstrzyga remisy.
- `limit`: 1–100 (domyślnie 25), `offset`: >= 0.

Odpowiedź: `{items: TaskResponse[], total, limit, offset}`; total uwzględnia filtry.
Każdy TaskResponse zawiera wszystkie pola modelu. Cache-Control: no-store.
Brak sesji: 401; niewłaściwa rola/ograniczone konto: 403; błędny parametr: 422.

## Ręczna weryfikacja

1. Zatwierdzony, aktywny nauczyciel z kilkoma zadaniami: wejście na /teacher
   przekierowuje do listy. Sprawdź wszystkie kolumny, polskie etykiety, daty,
   oba motywy i wąski ekran. Utwórz zadanie i link tytułu prowadzą do placeholderów.
2. Nauczyciel bez zadań: items=[], total=0 i komunikat o pustej liście.
3. Dwóch nauczycieli: po zmianie sesji każdy widzi wyłącznie własne zadania.
   Sprawdź również bezpośrednie żądania API z każdą sesją i parametrem author_id
   drugiego nauczyciela — nadal widoczne są tylko własne rekordy.
4. Filtry: osobno i łącznie status, trudność oraz dokładny temat; wyczyść filtry.
   Niepasujące filtry dają komunikat o braku wyników, a nie o braku zadań.
5. Wyszukiwanie: fragment tytułu, różna wielkość liter, spacje, `%`, `_`, brak wyniku.
   Szybkie wpisywanie nie powinno wyświetlać spóźnionych odpowiedzi.
6. Sortowanie: oba kierunki dla trzech pól. Przy ponad 25 rekordach sprawdź
   paginację i powrót do pierwszej strony po zmianie filtrów.
7. STUDENT i ADMIN: brak widoku nauczyciela oraz 403 z API. Bez sesji: 401 z API.
   Nauczyciel PENDING/REJECTED lub INACTIVE również otrzymuje 403.
8. Zatrzymaj API: widok pokazuje błąd i przycisk ponowienia; przywróć API i ponów.
   Ogranicz szybkość sieci, aby sprawdzić komunikat ładowania.
9. Zmień tytuł/opis ręcznym UPDATE: updated_at zmienia się automatycznie.
   INSERT z autorem STUDENT/ADMIN powinien zostać odrzucony.

## Automatyczna weryfikacja

Backend: `.venv/Scripts/python.exe -m pytest -q`. Integracja wymaga
`TEST_DATABASE_URL` wskazującego jednorazową bazę PostgreSQL z nazwą kończącą się
`_test`. Fixture czyści tasks oraz users; nigdy nie wskazuj bazy z danymi użytkowymi.
Testy obejmują role, izolację autorów, pustą listę, filtry, literalne wyszukiwanie,
sortowanie, paginację, walidację parametrów, autora oraz automatyczny timestamp.
Frontend: `npm run build` i `npm test` z katalogu frontend.
