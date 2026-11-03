# KAN-39 — weryfikacja rozwiązania i prywatne notatki

Branch: `feature/submission-review`, oparty na implementacji KAN-38. Kod ucznia, wyniki testów i snapshoty podpowiedzi pozostają immutable. Decyzja nauczyciela nie zmienia automatycznych wyników, draftu ani możliwości kolejnej wysyłki.

## Modele i migracja

`SubmissionReview` przechowuje `id`, unikalny `submission_id`, `decision`, `feedback`, `reviewed_by`, `reviewed_at`, `created_at`, `updated_at`. W bazie dozwolone są `ACCEPTED` i `CHANGES_REQUESTED`. Brak rekordu oznacza `PENDING`; istniejące submissions nie wymagają backfillu. Zmiana decyzji aktualizuje ten sam rekord i daty.

`TeacherStudentNote` przechowuje `id`, `teacher_id`, `student_id`, `content`, `created_at`, `updated_at`; para nauczyciel–uczeń jest unikalna. Notatka nie ma klucza do zadania ani submission. Każdy nauczyciel ma własną treść. Pusty tekst pozwala wyczyścić notatkę.

Migracja `0011_submission_review.py` dodaje obie tabele, indeksy, FK i constraints. FK używają `RESTRICT`, zgodnie z ochroną historycznych submissions; nie dodano agresywnych kaskad. Zarządzanie kontami używa statusów kont, a nie nowego mechanizmu usuwania historii.

Uruchomienie: `cd backend`, następnie `.venv/Scripts/python.exe -m alembic upgrade head`. Standardowy skrypt uruchamiający backend również wykonuje migracje. Na izolowanej bazie testowej sprawdzono upgrade, downgrade do `0010`, ponowny upgrade do `0011` oraz `alembic check` — bez rozbieżności modeli i schematu. Baza aplikacji nie została zmieniona podczas testów.

## Endpointy

| Endpoint | Zachowanie |
| --- | --- |
| `PUT /teacher/submissions/{submission_id}/review` | `{decision, feedback?}` → `{status, feedback, reviewed_at}` |
| `GET /teacher/students/{student_id}/note` | `{student_id, content, updated_at}`, pusty tekst przy braku notatki |
| `PUT /teacher/students/{student_id}/note` | `{content}` → zapis własnej notatki |
| `GET /teacher/submissions?...&review_status=PENDING` | Filtrowanie kolejki po review najnowszej wersji; także `ACCEPTED` / `CHANGES_REQUESTED`; bez filtra wszystkie |

Feedback jest przycinany na brzegach i ma limit 10 000 znaków. `CHANGES_REQUESTED` wymaga niepustego feedbacku zarówno w API, jak i formularzu; baza dodatkowo chroni niepustą treść. `ACCEPTED` pozwala na pusty feedback. Notatka również ma limit 10 000 znaków. Schematy odrzucają dodatkowe pola, w tym `teacher_id` i `student_id` w body.

## Student API i dwa poziomy weryfikacji

Publiczne podsumowanie submission ma dodatkowe `review: {status, feedback, reviewed_at}`. Teacher list/history/detail korzystają z tego samego jawnego formatu review, bez prywatnej notatki i bez tożsamości reviewera.

Odpowiedzi odczytu/zapisu draftu oraz wysyłki zawierają `latest_submission.review` i `latest_feedback: {version, status, feedback, reviewed_at} | null`. Feedback wybierany jest z najnowszej wersji posiadającej niepustą zapisaną uwagę nauczyciela. Jeśli kolejna wersja oczekuje, poprzednia uwaga nadal jest widoczna i opisana właściwym numerem wersji. Pusta akceptacja nie ukrywa starszej dostępnej uwagi.

Na stronie rozwiązywania są osobno testy automatyczne i „Weryfikacja nauczyciela” z etykietami „Oczekuje na sprawdzenie”, „Zaakceptowane”, „Wymaga poprawy”. Feedback jest pod statusem, z numerem wersji. Przy nowej wysyłce status wraca do PENDING; stary feedback nie zostaje przypisany do nowej wersji. Dane review odświeżają się przy odczycie/zapisie draftu i wysyłce. Odpowiedź autosave aktualizuje review bez zastępowania kodu w edytorze; nie ma powiadomień push ani pollingu.

## Ownership, prywatność i współbieżność

- Wyłącznie aktywny, zatwierdzony `TEACHER`; dotychczasowy brak dostępu `ADMIN` do endpointów nauczyciela pozostaje zachowany.
- Review sprawdza relację submission → task → zalogowany właściciel w zapytaniu. Cudzy lub nieistniejący identyfikator daje 404.
- Notatka wymaga ucznia z co najmniej jednym submission do zadania zalogowanego nauczyciela. Następnie odczyt i zapis filtrują jednocześnie własny `teacher_id` i wskazany `student_id`. Nie można wskazać innego właściciela w body ani adresie notatki.
- Prywatna notatka ma osobny router/schema i komponent. Nie dodano jej do modeli odpowiedzi ucznia ani współdzielonego submission. Serializacja publicznego review jest jawną listą pól. Student nie wykonuje żądań endpointu notatki.
- Żądania zapisu podlegają istniejącemu sprawdzaniu Origin; odpowiedzi teacher mają `Cache-Control: no-store`.
- PostgreSQL `ON CONFLICT DO UPDATE` i constraints zapewniają pojedynczy rekord także przy równoległych zapisach. Obowiązuje ostatni zapis; nie dodano historii ani optymistycznego wersjonowania review/notatek.
- Listy pobierają review jednym zapytaniem dla całej strony. Nie dodano N+1.

## UI nauczyciela

Pod wynikami testów znajduje się „Weryfikacja rozwiązania”: aktualny status, wybór decyzji, feedback i osobny zapis. Wybranie innej wersji wczytuje jej review; zapis aktualizuje również status w liście wersji. Kod pozostaje tylko do odczytu.

W bocznym panelu jest „Prywatna notatka o uczniu” z informacją o widoczności, własnym polem i osobnym zapisem. Zmiana wersji nie zmienia notatki. Przy innym zadaniu tego ucznia odczytywana jest ta sama zapisana treść. Nieudany odczyt blokuje zapis pustego formularza do czasu ponowienia. Błędy zapisu pozostawiają wpisany tekst.

Zakładki „Do przejrzenia”, „Zaakceptowane”, „Do poprawy”, „Wszystkie” filtrują centralną kolejkę po review ostatniego submission. Nowa wersja wraca do kolejki oczekujących. Nie wdrożono statystyk ocen, grup ani terminów; istniejące karty statystyczne pozostają oznaczone jako niedostępne, a komunikaty sugerujące brak funkcji review zostały usunięte.

## Testy

- Nowe backendowe scenariusze: **13 passed** — lifecycle, aktualizacja decyzji, brak dziedziczenia statusu/feedbacku, zachowanie draftu i wyników, akceptacja failed tests, walidacja, role, IDOR, Origin, izolacja notatek, prywatność student API, współbieżne upserty i constraints.
- Pełny backend: **418 passed, 4 skipped** na izolowanym PostgreSQL. Pominięte testy wymagają dodatkowo skonfigurowanego Judge0.
- Pełny frontend: **284 passed**, 19 plików (`npm --prefix frontend test -- --maxWorkers=2`). Testy obejmują statusy ucznia, przypisanie feedbacku do właściwej wersji, nową wysyłkę i aktualizację danych podczas zapisu draftu; także formularze nauczyciela, błędy zapisu/odczytu i zachowanie notatki między wersjami oraz zadaniami.
- Build frontendu poprawny; pozostaje istniejące ostrzeżenie o rozmiarze paczki Monaco.
- `git diff --check` bez błędów. `alembic check`: `No new upgrade operations detected`.
- Kontrola renderu w przeglądarce niewykonana — narzędzie nie udostępniło żadnej przeglądarki.

## Zmienione pliki

Backend: `app/models/review.py`, `app/models/__init__.py`, `alembic/versions/0011_submission_review.py`, `app/schemas/review.py`, `app/schemas/teacher_submission.py`, `app/services/reviews.py`, `app/services/solutions.py`, `app/api/teacher_reviews.py`, `app/api/teacher_submissions.py`, `app/main.py`, `tests/test_submission_reviews.py`, `tests/conftest.py`, `tests/test_teacher_submissions.py`.

Frontend: `src/api/reviews.ts`, `src/api/solutions.ts`, `src/api/teacherSubmissions.ts`, `src/components/teacher/SubmissionReview.tsx`, `src/components/teacher/TeacherStudentNote.tsx`, `src/components/StudentSubmissionReview.tsx`, `src/pages/TeacherSubmissionsPage.tsx`, `src/pages/TeacherSubmissionQueuePage.tsx`, `src/pages/StudentTaskPage.tsx`, `src/styles/teacher-submissions.css`, `src/pages/TeacherReview.test.tsx`, `src/pages/SolutionSubmissions.test.tsx`, `src/pages/TeacherSubmissionQueuePage.test.tsx`. Dokumentacja: `docs/KAN-39.md`.

Poza zakresem: oceny liczbowe, punkty, rubryki, feedback do linii, chat, historia zmian review/notatek, notatki per zadanie, diff, automatyczna akceptacja, blokowanie kolejnych wysyłek i statystyki nauczyciela.
