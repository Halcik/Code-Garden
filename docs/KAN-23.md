# KAN-23: Podstawowe zarządzanie użytkownikami przez administratora

## Zakres i model danych

Moduł `/admin` udostępnia listę, filtry, szczegóły, edycję loginu i emaila oraz
aktywację/dezaktywację konta i akceptację/odrzucenie nauczyciela.
Nie zmienia ról, nie usuwa użytkowników i nie wprowadza grup, zadań ani audytu.

Zamiast booleanów użytkownik ma dwa niezależne pola enum:

| Pole | Wartości | Znaczenie |
| --- | --- | --- |
| `status` | `ACTIVE`, `INACTIVE` | Czy konto jest włączone przez administratora |
| `teacher_approval` | `PENDING`, `APPROVED`, `REJECTED` | Decyzja o dostępie nauczyciela |

`teacher_approval` jest wymagane dla TEACHER i musi być `null` dla STUDENT/ADMIN.
Zapewnia to również ograniczenie CHECK w bazie. Każdy nauczyciel nadal wymaga emaila.

Uczeń po rejestracji otrzymuje `ACTIVE` i `null`. Nauczyciel otrzymuje `ACTIVE`
i `PENDING`. Publiczna rejestracja odrzuca ADMIN oraz samodzielne przesłanie statusów.

Pełny dostęp wymaga `ACTIVE`, a dla TEACHER dodatkowo `APPROVED`.
Aktywacja konta nie zmienia akceptacji. Akceptacja nauczyciela nie aktywuje
dezaktywowanego konta. Odrzucenie można ponownie rozpatrzyć przez akceptację;
zaakceptowanemu nauczycielowi można odebrać akceptację. Powtórzenie tej samej
decyzji jest idempotentne. Administrator nie może dezaktywować własnego konta.

## Migracja i istniejące konta

`0002_user_status.py` dodaje dwa typy enum, kolumny i CHECK. Wszystkie istniejące
konta otrzymują `ACTIVE`. Istniejący nauczyciele otrzymują `PENDING` i wymagają
decyzji administratora przed dalszym dostępem do obszaru nauczyciela.
Migracja zachowuje dane logowania i istniejące konta administratorów.

Z katalogu głównego `npm run dev` uruchamia kontener PostgreSQL, stosuje migracje,
a następnie uruchamia backend i frontend. Docker Desktop musi być dostępny.
Migrację można też wykonać ręcznie w `backend/`:

```powershell
.\.venv\Scripts\python.exe -m alembic upgrade head
.\.venv\Scripts\python.exe -m alembic current
.\.venv\Scripts\python.exe -m alembic check
```

## Backend

Wszystkie poniższe endpointy wymagają aktywnego ADMIN:

| Metoda i ścieżka | Funkcja |
| --- | --- |
| `GET /admin/users` | Lista z filtrami i paginacją |
| `GET /admin/users/{id}` | Publiczne dane jednego użytkownika |
| `PATCH /admin/users/{id}` | Częściowa edycja wyłącznie `login` i `email` |
| `POST /admin/users/{id}/activate` | Ustawienie `ACTIVE` |
| `POST /admin/users/{id}/deactivate` | Ustawienie `INACTIVE` |
| `POST /admin/users/{id}/approve-teacher` | Ustawienie `APPROVED` dla TEACHER |
| `POST /admin/users/{id}/reject-teacher` | Ustawienie `REJECTED` dla TEACHER |
| `POST /admin/users/{id}/revoke-teacher` | Cofnięcie zatwierdzenia do `PENDING` dla TEACHER |

Dla zatwierdzonego nauczyciela panel pokazuje „Cofnij zatwierdzenie”, bez przycisków
zatwierdzenia/odrzucenia i bez komunikatu o wymaganej akceptacji. Cofnięcie
zatwierdzenia odbiera pełny dostęp, zachowuje aktywność konta i przywraca
oczekiwanie na decyzję administratora.

Lista przyjmuje `q` (fragment loginu lub emaila, bez rozróżniania wielkości liter,
maksymalnie 254 znaki), `role`, `status`, `teacher_approval`, `limit` (1–100, domyślnie 25)
i `offset` (od 0). Filtry łączą się przez AND. Odpowiedź ma `items`, `total`,
`limit`, `offset`. Kolejność: data utworzenia malejąco, następnie ID malejąco.

Przykład: `/admin/users?role=TEACHER&status=ACTIVE&teacher_approval=PENDING`.

Pole „Szukaj użytkownika” wyszukuje po stronie serwera, z opóźnieniem 300 ms
po wpisaniu tekstu. Współpracuje z filtrami i resetuje paginację do pierwszej strony.
Znaki `%` i `_` są traktowane dosłownie, a spacje na brzegach zapytania pomijane.

PATCH odrzuca dodatkowe pola, w tym `role`, `status`, `teacher_approval`, `password`.
Nie pozwala więc ani nadać ADMIN, ani zmienić pozostałych ról czy ominąć decyzji
przez edycję. Pusty PATCH i `login: null` są odrzucane. `email: null` jest dozwolone
wyłącznie dla kont innych niż nauczyciel. Login/email są normalizowane jak w auth.

Brak/niepoprawna sesja daje 401, brak uprawnień 403, brak użytkownika 404,
konflikt loginu/emaila, samodezaktywacja lub decyzja nauczycielska wobec innej roli 409,
a niepoprawne dane 422. Nie ma endpointu DELETE.

`require_role(...)` korzysta z `require_active_user`, który odczytuje status
i akceptację aktualnego użytkownika z bazy. Wcześniej wydany JWT nie omija
dezaktywacji ani odrzucenia nauczyciela. Przyszłe endpointy obszarów powinny
korzystać z tego samego guarda.

Konta ograniczone mogą poprawnie się uwierzytelnić, pobrać własne metadane przez
`/auth/me` i wylogować się. Nie mają normalnego dostępu do obszarów ról.
`get_current_user` służy do identyfikacji sesji; do ochrony funkcji aplikacji
należy używać `require_active_user` lub `require_role`.

Operacje zmieniające dane sprawdzają Origin. CORS obsługuje PATCH z credentials.
Odpowiedzi administratora mają `Cache-Control: no-store`. Hash, hasło i token nie
są zwracane. Aktualizowany rekord jest blokowany na czas transakcji.

## Frontend i Figma

Widok odwzorowuje układ ekranu „Administrator users” z pliku Code Garden:
jasny `2:72127`, ciemny `217:3226`. Wykorzystuje istniejące tokeny motywu,
font Inter i logo oraz lokalne ikony pobrane z Figmy w obu wariantach.

Zakres obejmuje sidebar z sekcją Użytkownicy, zasady kont, filtry, tabelę
i panel szczegółów. Pominięto elementy Figmy spoza KAN-23: inne sekcje dashboardu,
tworzenie ADMIN, eksport, globalną wyszukiwarkę, powiadomienia i informacje o grupach.
Dane osobowe, instytucje i weryfikacja emaila z makiety nie są fikcyjnie prezentowane;
wyświetlane są rzeczywiste pola dostępnego modelu.

Lista ma loading, empty state, błąd z ponowieniem i paginację po 25 rekordów.
Szczegóły pobierane są osobno przez API. Akcje pokazują feedback, blokują powtórne
wysłanie i odświeżają listę. Nieudana akcja zachowuje dane oraz pokazuje błąd.
Warstwa requestów jest w `src/api`, komponenty nie wywołują bezpośrednio `fetch`.

Guardy frontendowe nadal czekają na `/auth/me`. Konto nieaktywne, nauczyciel
oczekujący lub odrzucony widzi komunikat o ograniczeniu, ponowne sprawdzenie statusu
i logout zamiast panelu. Nie zapisuje się tokenu ani statusów w storage.
Istniejący AuthProvider sprawdza sesję również po powrocie do karty i co minutę;
backend egzekwuje zmiany przy każdym żądaniu chronionego endpointu.

## Mapa zmienionych plików

- Backend: `app/models/user.py`, `app/schemas/auth.py`, `app/services/auth.py` — statusy i rejestracja.
- `alembic/versions/0002_user_status.py` — migracja i backfill.
- `app/api/dependencies.py` — aktywność konta i akceptacja w guardach.
- `app/api/admin.py`, `app/schemas/admin.py`, `app/services/admin.py` — kontrakt API i operacje administracyjne.
- `app/main.py` — podłączenie routera i PATCH w CORS.
- `tests/conftest.py`, `tests/test_auth_integration.py` — wspólne fixture PostgreSQL.
- `tests/test_roles.py`, `tests/test_admin_integration.py` — macierz statusów i testy administracji.
- Frontend: `src/api/client.ts`, `auth.ts`, `admin.ts` — wspólny transport, typy i API administratora.
- `src/auth/accountAccess.ts`, `RouteGuards.tsx`, `src/pages/AccountAccessPage.tsx` — blokada pełnego dostępu.
- `src/pages/AdminUsersPage.tsx`, `src/components/admin/*`, `src/styles/admin-users.css` — widok użytkowników.
- `src/assets/admin/*` — lokalne warianty ikon Figmy.
- `src/components/LogoutButton.tsx`, `src/pages/RolePanel.tsx` — wspólny logout.
- `src/App.tsx` — nowy widok `/admin`.
- `src/components/auth/RegisterForm.tsx`, `src/pages/AuthPage.tsx` — informacja o wymaganej akceptacji.
- `src/auth/RouteGuards.test.tsx`, `src/pages/AdminUsersPage.test.tsx` — testy zachowania UI.
- `package.json`, lockfile i `.github/workflows/frontend-build.yml` — Vitest, Testing Library, jsdom i check w CI.

## Scenariusze ręcznego testu

Przygotuj konta testowe STUDENT, TEACHER i istniejącego ADMIN. Użyj oddzielnych
sesji przeglądarki dla administratora i konta, którego dostęp zmieniasz.

| Konto | Czynności | Oczekiwany wynik |
| --- | --- | --- |
| Aktywny uczeń | Zarejestruj i zaloguj; odśwież `/student` | Dostęp do panelu ucznia; brak dostępu do `/admin` i API administratora |
| Nieaktywny uczeń | ADMIN dezaktywuje ucznia; uczeń odświeża stronę | Komunikat o nieaktywności; guard API zwraca 403 także ze starym cookie; aktywacja przywraca dostęp |
| Nauczyciel oczekujący | Zarejestruj nauczyciela i zaloguj | Informacja o oczekiwaniu, brak panelu nauczyciela; samo activate nie daje dostępu |
| Nauczyciel zaakceptowany | ADMIN zatwierdza aktywnego nauczyciela; nauczyciel sprawdza status | Panel nauczyciela dostępny; dezaktywacja blokuje mimo zachowanej akceptacji |
| Nauczyciel odrzucony | ADMIN odrzuca nauczyciela | Brak pełnego dostępu; aktywacja nie zmienia decyzji; świadome zatwierdzenie może przywrócić dostęp |
| Administrator | Lista, filtry, szczegóły, edycja loginu/emaila i wszystkie akcje | Dane odświeżają się, widoczny feedback; własna dezaktywacja zablokowana |

Dodatkowo sprawdź łączenie filtrów, pusty wynik, paginację, błędy sieci i ponowienie,
konflikt loginu/emaila oraz zachowanie w jasnym i ciemnym motywie i na wąskim ekranie.
Przy kontach nauczycielskich potwierdź, że akceptacja nie aktywuje nieaktywnego konta.
Spróbuj PATCH z `role: "ADMIN"` i DELETE: nie powinny być dozwolone.

## Weryfikacja wykonana podczas implementacji

- Zastosowano migrację na lokalnej bazie; aktualna rewizja `0002 (head)`.
- `alembic check`: brak różnic między modelami i migracjami.
- Na osobnej bazie testowej sprawdzono backfill istniejących ról, zachowanie
  hasha oraz downgrade do `0001` i ponowny upgrade do `0002`.
- Uruchomiono oba serwery przez `npm run dev`; `/health` i frontend `/admin`
  odpowiadają 200, API `/admin/users` bez sesji odpowiada 401.
- `npm run build`: sukces; `npm test`: 23 zaliczone testy; pełny `pytest`
  z PostgreSQL: 110 zaliczonych, bez pominięć (jedno ostrzeżenie deprecacji
  z zależności Starlette/AnyIO). Testowa baza jest osobna od lokalnej bazy aplikacji.
- Przeglądarka testowa nie była dostępna w tej sesji. Automatyczne testy UI
  działają w jsdom; wizualne porównanie renderu z Figmą i powyższe scenariusze
  ręczne pozostają do sprawdzenia w przeglądarce.
