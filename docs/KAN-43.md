# KAN-43 — Grupy uczniów

Panel nauczyciela ma sekcję **Grupy** (`/teacher/groups`) z listą, formularzem
tworzenia oraz szczegółami (`/teacher/groups/:groupId`). Szczegóły pozwalają
edytować nazwę i opis oraz usunąć grupę po potwierdzeniu. Widoki korzystają
z obecnego layoutu, komponentów, klienta API i tokenów jasnego/ciemnego motywu.
Układ kart nawiązuje do wskazanych projektów Figma. Formularz jest wyświetlany
w modalnym oknie na środku ekranu, z obsługą Escape i blokadą przewijania tła.
Cztery kafelki pokazują liczbę grup oraz miejsca na aktywne zadania, zadania
po terminie i oczekujące zaproszenia. Przyszłe statystyki mają wartość „—”
i informację o dostępności w kolejnych etapach.
Pasek wyszukiwania filtruje własne grupy po nazwie i opisie bez zmiany liczników
ogólnych. Karty pokazują liczbę uczniów z API (`student_count`), miejsce na
oczekujące zaproszenia oraz nieaktywne przyciski „Zaproś” i „Przypisz zadanie”.
Edycja jest dostępna w szczegółach grupy; karty na liście zawierają akcje
zapraszania, przypisywania zadania i otwarcia grupy.
Szczegóły grupy korzystają z układu Figma `217:5018`: nagłówek z nazwą i danymi
grupy, cztery kafelki statystyk, pasek widoków, tabela uczniów oraz boczne
panele statusu zadania i zarządzania grupą. Przyszłe funkcje są nieaktywne,
a statystyki nie zawierają przykładowych danych. Zgodnie z ustalonym zakresem
pominięto postęp według tematów, najczęstsze błędy i boczny panel motywacyjny.
Ustawienia motywacyjne pozostają w edycji; pasek zakładek nie zawiera
osobnej zakładki ustawień. Nagłówek zawiera tylko przycisk „Przypisz zadanie”. W panelu
zarządzania są „Zarządzaj zaproszeniami” oraz przyciski edycji i usuwania grupy
obok siebie; zarządzanie uczniami pozostaje przy liście uczniów.

## Dane

- `student_groups`: `id`, `name` (1–200 znaków po przycięciu białych znaków),
  opcjonalny `description`, `teacher_id`, `created_at` ze strefą czasową.
- Migracja `0013` dodaje opcjonalny tekstowy `age_range` (1–50 znaków),
  `achievements_enabled` (domyślnie `true`) i `study_streak_enabled` (domyślnie
  `false`). Formularz tworzenia i edycji zapisuje te pola. Są to ustawienia
  grupy; mechanizmy przyznawania osiągnięć i naliczania serii nie są wdrożone.
- Nauczyciel posiada wiele grup (`User.owned_groups`). Właściciel jest wskazywany
  przez klucz obcy z `RESTRICT`, tak jak autor istniejących zadań.
- `group_students`: para `(group_id, student_id)` jest kluczem głównym,
  więc członkostwo nie może się powtarzać. Indeks ucznia pozwala wyszukiwać
  jego grupy. Relacje ORM: `StudentGroup.students` i `User.student_groups`.
- Usunięcie grupy usuwa jej członkostwa przez `CASCADE`, zachowując uczniów.
  Usunięcie ucznia również usuwa jego członkostwa.
- `student_count` jest obliczanym polem odpowiedzi: SQL liczy członkostwa
  bez pobierania danych uczniów i bez dodatkowych zapytań dla każdej grupy.
- Migracja `0012` następuje po `0011`; downgrade usuwa wyłącznie nowe tabele.

## API

| Metoda | Ścieżka | Działanie |
| --- | --- | --- |
| POST | `/teacher/groups` | Tworzenie, odpowiedź 201 |
| GET | `/teacher/groups` | Lista własnych grup, od najnowszych |
| GET | `/teacher/groups/{id}` | Szczegóły własnej grupy |
| PATCH | `/teacher/groups/{id}` | Częściowa edycja nazwy/opisu |
| DELETE | `/teacher/groups/{id}` | Usunięcie, odpowiedź 204 bez treści |

POST przyjmuje `{ "name": "Python", "description": "Podstawy" }`.
Opis i przedział wieku można pominąć lub wyczyścić przez `null`. PATCH wymaga
przynajmniej jednego pola; `name: null` i ustawienia motywacyjne o wartości
`null` są niedozwolone. Nieznane pola, w tym `teacher_id`
i członkowie, są odrzucane. Właściciel pochodzi z aktualnej sesji.

Endpointy używają istniejącego `require_role(UserRole.TEACHER)`:
uczeń i administrator nie mają dostępu, podobnie nieaktywny lub niezatwierdzony
nauczyciel. Brak sesji zwraca 401, brak uprawnień 403. Cudza i nieistniejąca
grupa zwracają takie samo 404. Odczyt i modyfikacje filtrują po właścicielu;
modyfikacje dodatkowo blokują wiersz na czas transakcji. Zapisy stosują obecne
sprawdzanie Origin, a odpowiedzi `Cache-Control: no-store`.

## Weryfikacja

Testy backendu: `backend/tests/test_teacher_groups.py`, zgodnie z istniejącymi
testami integracyjnymi i fixture PostgreSQL. Obejmują CRUD, własność, RBAC,
status konta, walidację, Origin oraz relację many-to-many i kaskadowe usuwanie.
Fixture czyszczenia bazy uwzględnia nowe tabele.

Testy frontendu: `frontend/src/pages/TeacherGroupsPage.test.tsx` — ładowanie,
pusta lista, przejście do szczegółów, tworzenie, edycja, usunięcie i anulowanie
potwierdzenia, błędy, ponowienie oraz blokowanie powtórnego wysłania formularza.

Uruchomienie z katalogu backendu, po ustawieniu `TEST_DATABASE_URL` na osobną
bazę PostgreSQL z nazwą zakończoną `_test`:

```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

Frontend, z katalogu `frontend`:

```powershell
npm test -- --maxWorkers=2
npm run build
```

Kontrola migracji na osobnej bazie testowej (`DATABASE_URL`):

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic downgrade 0011
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic check
```

## Kolejne zadania

KAN-44 może wykorzystać tabelę członkostw i relacje ORM; nie ma jeszcze API
ani interfejsu dodawania uczniów i zaproszeń. Walidację roli dołączanego ucznia
należy dodać wraz z mechanizmem członkostwa.

KAN-45 może odwoływać się do identyfikatora grupy i jej członkostw.
Nie utworzono modeli przypisań, terminów ani statusów wykonania.
