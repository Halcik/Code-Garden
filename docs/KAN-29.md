# KAN-29 — katalog zadań ucznia

## Backend

- `backend/app/api/student.py`: `GET /student/tasks`, dostęp wyłącznie dla aktywnego użytkownika STUDENT. TEACHER i ADMIN otrzymują 403, brak sesji — 401. Odpowiedź ma `Cache-Control: no-store`.
- Widoczność jest zawsze ograniczona przez `status = READY AND is_archived = false`, niezależnie od parametrów zapytania. Zadania pochodzą od wszystkich autorów.
- Parametry: `search` (tytuł, maks. 200 znaków), `topic` (dokładne dopasowanie bez uwzględniania wielkości liter, maks. 100 znaków), `difficulty`, `task_type`, `sort_by` (`created_at`, `updated_at`, `title`), `sort_order` (`asc`, `desc`), `limit` (1–100, domyślnie 24), `offset` (od 0). Domyślne sortowanie: najnowsze; ID rozstrzyga remisy. Wyszukiwanie traktuje `%` i `_` dosłownie.
- `backend/app/services/task_catalog.py`: wspólne filtrowanie, wyszukiwanie, sortowanie i paginacja dla list nauczyciela oraz ucznia. Lista nauczyciela zachowuje własne ograniczenie autora i dotychczasowe parametry.
- `backend/app/schemas/task.py`: osobny, ograniczony schemat odpowiedzi ucznia: `id`, `title`, `description`, `topic`, `difficulty`, `task_type`, `estimated_time_minutes`. Opis istnieje już w modelu i jest używany w kartach Figmy. Brak kodu startowego, instrukcji, testów, podpowiedzi, autora i statusów technicznych.
- `backend/app/main.py`: rejestracja routera ucznia. Brak migracji i nowych cech domenowych.

Przykład: `/student/tasks?search=lista&difficulty=EASY&topic=Podstawy&task_type=STANDARD&sort_by=title&sort_order=asc`.

## Frontend i routing

- `frontend/src/api/studentTasks.ts`: klient wyłącznie endpointu ucznia, typy katalogu i obsługa błędów HTTP.
- `frontend/src/pages/StudentTasksPage.tsx`: layout ucznia, katalog kart, wyszukiwanie i temat z opóźnieniem 300 ms, filtry trudności i typu, sortowanie, paginacja oraz loading/empty/error i ponawianie pobierania. Zmiana filtrów zeruje offset, poprzednie żądania są anulowane. Błędy sesji uruchamiają istniejące odświeżenie autoryzacji.
- `frontend/src/App.tsx`: istniejący guard STUDENT chroni `/student/tasks` i `/student/tasks/:taskId`; `/student` przekierowuje do katalogu. Tytuł i przycisk karty prowadzą do placeholdera szczegółów KAN-30, z powrotem do katalogu.
- Pod górnym paskiem filtrów znajduje się sekcja „Zadania przypisane przez nauczyciela” z informacją „Tutaj pojawią się zadania przypisane przez nauczyciela”. Niżej „Odkrywaj dalej” prezentuje zadania z katalogu. Filtry dotyczą katalogu; informacja o przypisaniach pozostaje widoczna niezależnie od wyników. Sekcja przypisań jest na tym etapie wyłącznie informacyjna, bez integracji KAN-45 i bez pobierania liczby przypisań.
- Nad filtrami znajduje się pasek widoków: „Wszystkie” z liczbą wyników bieżącego zapytania katalogu, „Przypisane”, „Z katalogu”, „Nierozpoczęte”, „W toku”, „Ukończone”, „Po terminie”. Pierwsze trzy przełączają widoczność sekcji (obie, informacja o przypisaniach, katalog). Zakładki postępu i terminu są nieaktywne, z widoczną informacją o przyszłej dostępności; nie przypisują zadaniom fikcyjnych statusów. Dane przypisań nie są jeszcze dostępne, więc ich licznik nie jest prezentowany. Filtry katalogu są ukryte w widoku przypisań i zachowują wartości przy zmianie widoku.
- `frontend/src/assets/student/code.svg`: lokalna ikona z Figmy; istniejące logo, avatar i ikona nawigacji są używane ponownie.

## Motywy

Sprawdzone źródła Figmy: light `2:69479`, dark `217:6190` na stronie `217:2` („Motyw ciemny”).

Pasek zakładek porównano dodatkowo z `2:69323` (light) i `217:6469` (dark). Podświetlenie obejmuje nazwę i licznik razem; licznik dziedziczy kolor i krój tekstu, bez osobnego badge. Pasek ma padding i gap 6 px, zakładki padding 8 × 12 px, promień 8 px i tekst 13 px. Liczby są wyświetlane przy „Wszystkie” i „Z katalogu”; nie są generowane dla niedostępnych jeszcze danych przypisań i postępu.

Jeden komponent katalogu reaguje na istniejący `ThemeProvider`, `ThemeSwitch` i `data-theme` na elemencie głównym. Nie powstają osobne ekrany dla light/dark.

`frontend/src/styles/student-tasks.css` używa zmiennych z `theme.css` dla tła strony, powierzchni kart, pól, obramowań, tekstu, placeholderów, chipów, ikon, przycisków i stanów interakcji. Istniejące zmienne odpowiadają głównym kolorom obu makiet. Dodane tokeny katalogu odwzorowują akcent dark `#22c55e`, neutralny chip `#162033` oraz przycisk dark `#114834`; jasny wariant korzysta ze wspólnych tokenów oraz neutralnego chipu `#eef2f6`. Ikony korzystają z masek SVG i bieżących tokenów kolorów. Natywne selecty reagują również na istniejące `color-scheme`. Wspólne style zapewniają focus, disabled oraz komunikaty błędów; hover przycisków i linków jest zależny od tokenów. Układ przechodzi z trzech do dwóch i jednej kolumny na węższych ekranach.

Makieta zawiera elementy z późniejszych etapów (status rozwiązywania, lekcje, liczba testów, zatwierdzenie publikacji). Katalog ich nie symuluje ani nie wyświetla.

## Weryfikacja

- `npm run build`: OK (istniejące ostrzeżenie o rozmiarze bundla edytora Monaco).
- `npm test -- --reporter=dot`: 11 plików, 159 testów zaliczonych. Katalog ucznia ma 23 przypadki obejmujące endpoint i routing, loading/empty/error, debounce search/topic, przycinanie tekstu i zachowanie pozostałych filtrów, reset offsetu, obie granice paginacji, korektę offsetu po spadku total, 401/403 i odświeżanie sesji, abort przy zmianie filtrów i odmontowaniu, ignorowanie starych odpowiedzi i błędów, retry z zachowaniem zapytania, przełączanie widoków bez utraty filtrów i ponownego pobierania, reset filtrów z zachowaniem sekcji przypisań oraz nieaktywne zakładki postępu.
- `backend/.venv/Scripts/python.exe -m pytest -q`: po uruchomieniu Dockera 196 testów zaliczonych, bez pominięć, w tym 17 nowych przypadków katalogu. Testy wykonano na osobnej bazie PostgreSQL `code_garden_kan29_test`, z `DATABASE_URL` i `TEST_DATABASE_URL` wskazującymi tę bazę.
- `alembic check`: OK, brak rozbieżności między modelami a migracjami (`No new upgrade operations detected`).
- Nowe testy backendu: `backend/tests/test_student_tasks.py`; testy UI: `frontend/src/pages/StudentTasksPage.test.tsx`.
- Weryfikacja renderowanego widoku w przeglądarce pozostaje niewykonana: runtime zwrócił brak dostępnych przeglądarek. Kod i tokeny porównano z kontekstem i screenshotami obu wariantów Figmy.

Nie zaimplementowano szczegółów zadania, edytora ucznia, uruchamiania kodu/testów, podpowiedzi, wysyłania rozwiązań, przypisań, grup ani workflow publikacji.
