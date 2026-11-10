# KAN-44 — Zapraszanie uczniów do grup

Moduł rozszerza KAN-43 i korzysta z istniejącej tabeli `group_students`.
Nie dodaje przypisywania zadań, terminów ani obliczania postępów grupowych.

## Nauczyciel

- „Zaproś” na karcie grupy oraz „Zaproś” / „Zarządzaj zaproszeniami”
  w jej szczegółach otwierają modal na środku ekranu.
- Wyszukiwanie ucznia odbywa się dopiero po wpisaniu loginu i wysłaniu
  formularza. Wyniki zawierają tylko identyfikator i login aktywnego ucznia.
  Wyszukiwanie jest nieczułe na wielkość liter, traktuje `%` i `_` dosłownie,
  wymaga niepustej frazy i zwraca maksymalnie 20 wyników.
- Nauczyciel wybiera znalezionego ucznia i wysyła zaproszenie. Samo wysłanie
  nie tworzy członkostwa. Modal pokazuje oczekujące zaproszenia i umożliwia
  ich anulowanie. Liczniki oczekujących zaproszeń pochodzą z bazy.
- Lista członków pokazuje ich loginy. Usuwanie ucznia znajduje się w jego
  wierszu i wymaga potwierdzenia w modalu; konto ucznia pozostaje bez zmian.
- Panel kodu występuje wyłącznie w szczegółach konkretnej grupy. Odczyt
  panelu nie generuje kodu. Przycisk otwiera modal wyboru ważności:
  całkowita wartość liczbowa oraz godziny/dni. Domyślna propozycja to 7 dni.
- Po wygenerowaniu panel pokazuje kod, datę i godzinę wygaśnięcia,
  „Kopiuj kod” oraz możliwość regeneracji. Błąd schowka pozwala skopiować
  zaznaczony kod ręcznie. Dla wygasłego kodu widoczny jest komunikat.

## Uczeń

Sekcja `/student/groups` korzysta z obecnego layoutu i jasnego/ciemnego motywu.
Układ zaproszeń, podsumowania i kart odpowiada projektom Figma `217:5549`
i `2:70110`. Dodatkowo formularz kodu znajduje się w sekcji „Jak dołączyć
do grupy”. Nie dodano pozostałych niezaimplementowanych pozycji nawigacji
z projektu graficznego.

Uczeń może zaakceptować albo odrzucić własne zaproszenie oraz dołączyć kodem.
Poprawny kod jest zaproszeniem: nie wymaga dodatkowej akceptacji nauczyciela.
Dołączenie kodem oznacza również zaakceptowanie ewentualnego oczekującego
zaproszenia do tej samej grupy, żeby nie pozostawiać zbędnego powiadomienia.
Zaproszenia bezpośrednie nie mają terminu ważności; wygasanie dotyczy kodów.

Karty pokazują rzeczywistego nauczyciela i liczbę członków. Statystyki zadań,
terminy i postęp pozostają neutralnymi miejscami na KAN-45, bez przykładowych
wartości. Katalog zadań publicznych pozostaje niezależny od członkostwa;
liczba dostępnych zadań pochodzi z istniejącego API katalogu.

Kliknięcie nazwy lub „Otwórz grupę” pokazuje jej podstawowe dane pod
`/student/groups/:groupId`. „Opuść grupę” wymaga potwierdzenia. Odczyt
szczegółów grupy po opuszczeniu nie jest dostępny.

## Modele i migracja

Migracja `0014`, po `0013`, tworzy:

- `group_invitations`: grupa, uczeń, zapraszający nauczyciel, status
  `PENDING` / `ACCEPTED` / `REJECTED`, czas utworzenia. Częściowy unikalny
  indeks `(group_id, student_id) WHERE status = 'PENDING'` zapobiega kilku
  aktywnym zaproszeniom. Historia odrzuconych/zaakceptowanych zaproszeń
  pozwala ponownie zaprosić ucznia po odrzuceniu lub opuszczeniu grupy.
- `group_invitation_codes`: `group_id` jako klucz główny, unikalny kod,
  `created_at`, `expires_at`. Jest najwyżej jeden aktualny kod grupy.
  Obie nowe tabele mają kaskadowe usuwanie wraz z grupą.

Kod jest generowany przez `secrets.token_urlsafe(18)` — 144 losowe bity;
nie wynika z identyfikatora grupy. Baza przechowuje jego wartość, żeby
właściciel mógł ją odczytać i skopiować również po ponownym otwarciu strony.
Kod nie jest częścią odpowiedzi listy grup ani danych udostępnianych uczniom.

Backend waliduje zakres 1–720 godzin (1 godzina–30 dni), odrzuca ułamki,
wartości tekstowe, nieznane jednostki i przesłane przez klienta daty końcowe.
Oblicza `expires_at` według UTC. Dołączenie sprawdza czas po stronie serwera;
granica `now == expires_at` oznacza wygaśnięcie. Nie potrzeba okresowego zadania
czyszczącego. UI tylko prezentuje ważność i nie decyduje o dostępie.

Regeneracja zastępuje kod w jednej transakcji. Dołączenie ponownie sprawdza
wartość po uzyskaniu blokady grupy, więc stary kod nie przechodzi po regeneracji.

## API

Wszystkie endpointy nauczyciela sprawdzają właściciela. Cudza grupa daje 404.

| Metoda | Ścieżka | Działanie |
| --- | --- | --- |
| GET | `/teacher/groups/{id}/students/search?q=...` | Wyszukiwanie aktywnych uczniów po loginie |
| GET | `/teacher/groups/{id}/members` | Członkowie: id i login |
| DELETE | `/teacher/groups/{id}/members/{student_id}` | Usunięcie członkostwa |
| GET, POST | `/teacher/groups/{id}/invitations` | Lista oczekujących / wysłanie `{ "login": "..." }` |
| DELETE | `/teacher/groups/{id}/invitations/{invitation_id}` | Anulowanie oczekującego zaproszenia |
| GET | `/teacher/groups/{id}/invitation-code` | Kod i ważność lub `null`, gdy nie został utworzony |
| POST | `/teacher/groups/{id}/invitation-code` | Generowanie/regeneracja `{ "value": 7, "unit": "days" }` |
| GET | `/student/groups` | Własne członkostwa |
| GET | `/student/groups/{id}` | Szczegóły grupy, do której uczeń należy |
| POST | `/student/groups/join` | Dołączenie `{ "code": "..." }` |
| DELETE | `/student/groups/{id}/membership` | Opuszczenie grupy |
| GET | `/student/group-invitations` | Własne oczekujące zaproszenia |
| POST | `/student/group-invitations/{id}/accept` | Akceptacja i utworzenie członkostwa |
| POST | `/student/group-invitations/{id}/reject` | Odrzucenie bez członkostwa |

Błędy: 401 bez sesji; 403 dla niewłaściwej roli, nieaktywnego konta lub
niezatwierdzonego nauczyciela; 404 dla niedostępnego zasobu albo błędnego kodu;
409 dla duplikatu członkostwa/zaproszenia lub ponownie obsługiwanego zaproszenia;
410 dla wygasłego kodu; 422 dla nieprawidłowych danych. UI tłumaczy komunikaty
na język polski. Odpowiedzi udanych operacji mają `Cache-Control: no-store`.

Użyto obecnego RBAC bez dziedziczenia praw administratora oraz obecnej kontroli
Origin dla zapisów. Wyszukiwanie ma limit 100 prób/minutę na nauczyciela,
a dołączanie kodem 30 prób/minutę na ucznia przez istniejący limiter.
Tak jak limiter logowania, jest to limit na proces; instalacja z wieloma
workerami wymaga współdzielonego magazynu limitów.

Modyfikacje członkostwa, zaproszeń i kodów blokują najpierw wiersz grupy.
Unikalność członkostwa nadal zapewnia klucz główny `group_students`.
Akceptacja i utworzenie członkostwa są atomowe. Testy sprawdzają także
równoczesne wysyłanie zaproszeń oraz akceptację równoległą z użyciem kodu.

## Zmienione pliki

- Backend: nowy model `models/group_invitation.py`, schematy
  `schemas/group_invitation.py`, router `api/group_invitations.py`, logika
  `services/groups.py`, migracja `0014_group_invitations.py` i testy
  `tests/test_group_invitations.py`. Rejestracja w `main.py` i `models/__init__.py`.
- KAN-43: współdzielone sprawdzanie właściciela w `api/teacher_groups.py`,
  licznik zaproszeń w modelu/schemacie grupy i nowe tabele w fixture czyszczenia.
- Frontend: `api/groupInvitations.ts`, wspólne tłumaczenia błędów w `api/groups.ts`,
  komponenty `GroupInvitationsDialog`, `GroupCodePanel`, `GroupMembers`, podpięte
  `GroupDetails` i `TeacherGroupsPage`, nowe `StudentGroupsPage`, jego style,
  trasy w `App.tsx` i nawigacja w `StudentTasksPage.tsx`.
- Ikony ucznia: lokalne jasne/ciemne SVG z Figmy. Testy: nowy
  `GroupInvitations.test.tsx`, `StudentGroupsPage.test.tsx` oraz dostosowany
  `TeacherGroupsPage.test.tsx`.

## Weryfikacja

Na osobnej bazie PostgreSQL z nazwą zakończoną `_test` ustaw
`TEST_DATABASE_URL`, a następnie w `backend`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

W `frontend`:

```powershell
npm test -- --maxWorkers=2
npm run build
```

Kontrola migracji na osobnej bazie testowej (ustaw `DATABASE_URL`):

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic downgrade 0013
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic check
```

Wyniki: 474 testy backendu zaliczone, 4 pominięte (opcjonalny rzeczywisty
Judge0); 322 testy frontendu zaliczone; build poprawny z dotychczasowym
ostrzeżeniem wielkości bundli. Upgrade/downgrade/upgrade i `alembic check`
przeszły na PostgreSQL. Przeglądarka była niedostępna w sesji, więc nie
przeprowadzono kontroli wizualnej uruchomionej aplikacji.

Pod KAN-45 pozostają stabilne identyfikatory grup i członkostw oraz miejsca
na statystyki/kolumny zadań. Nie dodano modeli ani endpointów przypisań.
