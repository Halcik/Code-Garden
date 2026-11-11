# KAN-42 — Statusy zadań i terminy

Istniejące statusy pozostają bez zmian: `NOT_STARTED`, `IN_PROGRESS` (draft),
`COMPLETED` (submission). Review nadal zwraca `PENDING`, `ACCEPTED` lub
`CHANGES_REQUESTED`. Nie dodano kolumny statusu ani zmian flow rozwiązywania.

Migracja 0017 po 0016 dodaje opcjonalny `task_assignments.deadline`
(`timestamp with time zone`). Każdy rekord jest niezależnym źródłem przypisania,
także po usunięciu grupy. Istniejące rekordy otrzymują NULL.

POST pojedynczego i grupowego przypisania przyjmuje opcjonalne `deadline`.
Daty wymagają strefy czasowej; frontend konwertuje lokalny wybór na UTC przez
`toISOString()`, a wyświetla czas lokalny. Powtórne przypisanie nadal pomija
istniejące źródła i nie nadpisuje ich terminów.

PATCH `/teacher/tasks/{task_id}/assignments/{assignment_id}` przyjmuje wymagane
pole `deadline`: data dodaje lub zmienia termin, NULL go usuwa. Aktualizowany jest
wyłącznie istniejący rekord należący do zalogowanego nauczyciela; ID zadania
również musi pasować. Brak uprawnień daje 404, rola ucznia 403. Zachowano Origin
i no-store. Edytor w dotychczasowej tabeli przypisań działa również dla zadań
archiwalnych i źródeł usuniętych grup. W tabeli uczniów edycja dotyczy wybranego
ucznia. W widoku grupy → Zadania przycisk „Edytuj termin” otwiera edytor zbiorowy.
PATCH `/teacher/groups/{group_id}/task-assignments/{task_id}` ustawia lub usuwa
termin wszystkich istniejących przypisań z tego źródła grupowego, także dla
byłych członków. Pozostałe źródła i identyfikatory rekordów pozostają zachowane.
Operacja wymaga właściciela grupy i aktualizuje tylko jego źródła. Lista pokazuje
wspólny termin lub informację o różnych terminach; edytor uprzedza o zastąpieniu
indywidualnych terminów wspólną wartością. Zapis i usuwanie grupowego przypisania
korzystają z tej samej blokady grupy.

Lista grupy pokazuje również „Bez terminu”, a przy różnych terminach najwcześniejszą
datę. Edycja wspólnego terminu zaczyna się od zapisanej daty i godziny lokalnej;
kalendarz otwiera odpowiedni miesiąc. Checkbox „Bez terminu (usuń termin)” wyłącza
wybór daty i wysyła NULL dopiero po zapisie. Odznaczenie przywraca wybraną datę;
anulowanie niczego nie zapisuje. Pusta data bez zaznaczonego checkboxa blokuje zapis.

Przy wielu źródłach efektywnym terminem ucznia jest najwcześniejszy niepusty
termin. To spełnia wszystkie aktywne zobowiązania, zachowując każdą datę źródłową.
Źródło bez terminu nie anuluje terminu innego źródła. Usunięcie źródła lub daty
automatycznie przelicza minimum. Usunięcie grupy zachowuje źródło i jego termin.

`is_overdue` jest wyliczane w backendzie: efektywny termin minął i nie istnieje
submission (`progress_status != COMPLETED`). Nie zastępuje statusu postępu.
Zgodnie z dotychczasowym mechanizmem także submission z prośbą o poprawki ma
status COMPLETED; KAN-42 nie zmienia tej semantyki. Spóźnienie nie blokuje pracy.

Dotychczasowa zakładka „Po terminie” filtruje przypisane zadania na serwerze,
przed paginacją. Termin i oznaczenie spóźnienia pojawiają się na istniejącym
kafelku; bez daty nie ma dodatkowego elementu. Katalog zachowuje widoczność,
layout, filtry postępu, sortowanie i uruchamianie. Filtr terminów nie ogranicza
katalogu. Nie powstał nowy widok „Moje zadania”.

Zmienione pliki:

- Backend: `app/api/student.py`, `app/api/task_assignments.py`,
  `app/models/task_assignment.py`, `app/schemas/task.py`,
  `app/schemas/task_assignment.py`, `app/services/task_assignments.py`,
  `app/services/task_catalog.py`, `alembic/versions/0017_assignment_deadlines.py`.
- Frontend: `src/api/studentTasks.ts`, `src/api/taskAssignments.ts`,
  `src/components/StudentAssignedTasks.tsx`, `src/components/StudentTaskCard.tsx`,
  `src/components/teacher/GroupAssignmentDialog.tsx`,
  `src/components/teacher/TaskAssignments.tsx`, `src/pages/StudentTasksPage.tsx`.
- Testy: `backend/tests/test_student_tasks.py`,
  `backend/tests/test_task_assignments.py`,
  `frontend/src/components/teacher/TaskAssignments.test.tsx`,
  `frontend/src/pages/StudentTasksPage.test.tsx`,
  `frontend/src/pages/StudentTasksSections.test.tsx`.
- Dokumentacja: `docs/KAN-42.md`.

Uzupełnienie edycji grupowej zmienia również
`frontend/src/components/teacher/GroupTaskAssignments.tsx` i jego testy.

Weryfikacja: pełny backend na osobnym PostgreSQL 17: 534 passed, 4 skipped
(testy wymagające dodatkowej usługi Judge0); frontend: 361 passed w 25 plikach.
Build frontendu przeszedł. Migracje sprawdzono przez upgrade head, downgrade
0016, ponowny upgrade head oraz alembic check (bez rozbieżności).
