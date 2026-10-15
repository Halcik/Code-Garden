# KAN-21: Logowanie, rejestracja i sesja użytkownika

Dokument opisuje istniejącą implementację auth w Code Garden. Routing paneli
i ścisła kontrola dostępu według ról należą do [KAN-22](KAN-22.md).

## Zakres

- Rejestracja ucznia i nauczyciela.
- Logowanie loginem i hasłem.
- Sesja oparta na JWT w HttpOnly cookie.
- Pobranie aktualnego użytkownika przez `/auth/me`.
- Przywrócenie stanu sesji po odświeżeniu strony i wylogowanie.
- Walidacja formularzy, obsługa błędów i stany oczekiwania.

Nie zaimplementowano odzyskiwania hasła, refresh tokenów, weryfikacji emaila,
approval nauczyciela ani publicznego tworzenia administratorów.

## Rejestracja

Frontend wysyła `POST /auth/register` z loginem, hasłem, rolą i opcjonalnym emailem.
Uczeń (`STUDENT`) może pominąć email; nauczyciel (`TEACHER`) musi go podać.
Domyślna rola API to `STUDENT`. Rola `ADMIN` nie jest dozwolona przy rejestracji.
Powtórzenie hasła jest sprawdzane w formularzu i nie jest wysyłane do API.

Login ma 3–50 znaków: litery ASCII, cyfry, `_`, `.` lub `-`. Login i email są
przycinane i zamieniane na małe litery. Hasło ma 8–128 znaków i nie jest przycinane.
Email musi mieć poprawny format i maksymalnie 254 znaki.

Backend zapisuje użytkownika w PostgreSQL, haszując hasło przez Argon2id.
Unikalność loginu i emaila zapewniają ograniczenia bazy danych.
Udana rejestracja zwraca 201 i publiczne dane użytkownika, bez tworzenia sesji.
Frontend pokazuje potwierdzenie i przełącza formularz na logowanie.

## Logowanie i sesja

1. Frontend wysyła `POST /auth/login` z loginem i hasłem.
2. Backend weryfikuje hasło i ustawia cookie z JWT. Dla nieistniejącego loginu
   również wykonuje weryfikację hasła z zastępczym hashem.
3. Frontend wywołuje `GET /auth/me` i dopiero po potwierdzeniu sesji zapisuje
   publiczne dane użytkownika w stanie React.
4. Po uruchomieniu aplikacji lub odświeżeniu strony `AuthProvider` ponownie
   sprawdza `/auth/me`. Udostępnia stan ładowania, błąd i możliwość ponowienia.
5. Dla zalogowanego użytkownika sesja jest dodatkowo sprawdzana przy odzyskaniu
   fokusu okna, zmianie widoczności dokumentu oraz co 60 sekund, gdy dokument
   jest widoczny. Te sprawdzenia nie przedłużają ważności JWT.

Cookie ma `HttpOnly`, `SameSite=lax`, `Path=/` i czas życia odpowiadający JWT.
Flaga `Secure` zależy od konfiguracji; produkcja wymaga HTTPS i `COOKIE_SECURE=true`.
JWT jest podpisany HS256 i zawiera identyfikator użytkownika, czas wydania,
wygaśnięcia, issuer i audience. Backend sprawdza token i pobiera aktualnego
użytkownika z bazy. Rola pochodzi z rekordu użytkownika.

Żądania frontendu używają `credentials: "include"`. Token nie jest zwracany w JSON
ani odczytywany przez JavaScript. Token i rola nie są zapisywane w localStorage
lub sessionStorage. Preferencja motywu jest niezależna od auth.

Odpowiedzi logowania i `/auth/me` mają `Cache-Control: no-store`.

## Wylogowanie

`POST /auth/logout` usuwa cookie i zwraca 204. Dopiero po sukcesie frontend czyści
użytkownika w pamięci. Przy błędzie zachowuje stan i umożliwia ponowienie operacji.
Usunięcie cookie nie unieważnia skopiowanego JWT przed jego wygaśnięciem;
implementacja nie prowadzi serwerowego rejestru sesji ani listy unieważnionych tokenów.

## Kontrakt API

| Endpoint | Sukces | Najważniejsze błędy |
| --- | --- | --- |
| `POST /auth/register` | 201, publiczny użytkownik | 409 konflikt loginu/emaila; 422 walidacja; 403 Origin; 429 limit |
| `POST /auth/login` | 200, publiczny użytkownik i cookie | 401 błędne dane; 422 walidacja; 403 Origin; 429 limit |
| `GET /auth/me` | 200, publiczny użytkownik | 401 brak/niepoprawna/wygasła sesja lub brak użytkownika w bazie |
| `POST /auth/logout` | 204, usunięcie cookie | 403 niedozwolony Origin |

Publiczny użytkownik zawiera `id`, `login`, `email`, `role`, `created_at`.
Hasło, hash i JWT nie trafiają do tego obiektu. Błędny login i błędne hasło
dają ten sam komunikat. Konflikt loginu i emaila również ma wspólny komunikat.

Operacje POST auth sprawdzają Origin; żądania bez Origin z `Sec-Fetch-Site: cross-site`
są odrzucane. Backend dopuszcza skonfigurowane originy CORS z credentials.
Login i rejestracja współdzielą limit 30 żądań/minutę na IP; logowanie ma dodatkowo
10 prób/minutę na znormalizowany login. Limit zwraca 429 i `Retry-After`.
Liczniki są w pamięci jednego procesu.

## Pliki implementacji

| Plik | Odpowiedzialność |
| --- | --- |
| `frontend/src/api/auth.ts` | Requesty auth, typy, walidacja odpowiedzi i komunikaty błędów |
| `frontend/src/auth/AuthProvider.tsx` | Stan sesji, `/auth/me`, logowanie, logout i ponowienie |
| `frontend/src/components/auth/LoginForm.tsx` | Formularz logowania i blokowanie ponownego wysłania |
| `frontend/src/components/auth/RegisterForm.tsx` | Rejestracja, wybór roli, email i powtórzenie hasła |
| `frontend/src/components/auth/FormField.tsx` | Wspólne pola formularzy |
| `frontend/src/pages/AuthPage.tsx` | Przełączanie formularzy i potwierdzenie rejestracji |
| `frontend/src/styles/auth.css` | Wygląd formularzy i komunikatów |
| `backend/app/api/auth.py` | Endpointy auth i cookie |
| `backend/app/api/dependencies.py` | Weryfikacja sesji i Origin; guard ról dodany w KAN-22 |
| `backend/app/services/auth.py` | Zapis użytkownika i weryfikacja danych logowania |
| `backend/app/schemas/auth.py` | Walidacja, normalizacja i publiczny model odpowiedzi |
| `backend/app/models/user.py` | Model użytkownika, role i ograniczenia bazy |
| `backend/app/core/security.py` | Hashowanie haseł i JWT |
| `backend/app/core/rate_limit.py` | Limity żądań |
| `backend/app/core/config.py` | Konfiguracja bazy, JWT, cookie i CORS |

To mapa istniejącej implementacji, nie lista zmian wprowadzonych przy tworzeniu
tego dokumentu. Aktualny przycisk logout znajduje się w placeholderze panelu
`frontend/src/pages/RolePanel.tsx`, dodanym w KAN-22.

## Scenariusze ręcznego testu

Uruchom frontend i backend według ich README, z działającą bazą i migracjami.
Używaj konsekwentnie `localhost` dla obu serwerów i nowych danych testowych.

| Scenariusz | Oczekiwany wynik |
| --- | --- |
| Start bez cookie | `/auth/me` zwraca 401; formularz logowania jest dostępny |
| Rejestracja STUDENT bez emaila | 201, potwierdzenie, brak automatycznego logowania |
| Rejestracja TEACHER bez emaila | Formularz blokuje wysłanie; API niezależnie odrzuca dane |
| Rejestracja TEACHER z emailem | 201, możliwość późniejszego logowania |
| Ponowny login lub email przy rejestracji | 409 i czytelny komunikat konfliktu |
| Niepoprawny email, krótki login/hasło, różne hasła | Komunikaty walidacji; brak utworzenia konta |
| Próba rejestracji ADMIN przez API | 422, brak konta administratora |
| Błędne hasło lub nieistniejący login | 401 i jednakowy komunikat błędu |
| Poprawne logowanie | `/auth/login`, potem `/auth/me`; potwierdzona sesja |
| Logowanie loginem ze spacjami i inną wielkością liter | Normalizacja i poprawne logowanie |
| Odświeżenie strony po logowaniu | Ponowne `/auth/me`, przywrócenie sesji |
| Logout, następnie odświeżenie | Cookie usunięte, `/auth/me` zwraca 401 |
| Usunięte lub wygasłe cookie | Sesja uznana za niezalogowaną |
| Backend niedostępny | Komunikat błędu; możliwość ponowienia, brak pozornego sukcesu |
| Błąd requestu logout | Użytkownik pozostaje w stanie aplikacji, można ponowić logout |
| Powolna sieć i wielokrotny submit | Widoczny stan oczekiwania, formularz blokuje kolejne wysłanie |
| Ponad 10 prób logowania/minutę tym samym loginem | 429, `Retry-After`; odczekanie pozwala ponowić |

W DevTools sprawdź właściwości cookie, brak JWT/roli w storage oraz brak hasła,
hasha i tokenu w odpowiedziach JSON. Po KAN-22 poprawne logowanie kończy się
przejściem do panelu właściwego dla roli; szczegółowe testy tras są w osobnym dokumencie.

## Testy automatyczne i weryfikacja

- `backend/tests/test_security.py`: hashowanie, JWT, odrzucenie zmodyfikowanego
  i wygasłego tokenu, walidacja rejestracji i normalizacja.
- `backend/tests/test_rate_limit.py`: limity, wygaśnięcie liczników i odrzucenie
  nadmiarowych żądań przed weryfikacją hasła.
- `backend/tests/test_auth_integration.py`: flow auth z PostgreSQL, konflikty,
  cookie, Origin, CORS i Secure. Wymaga `TEST_DATABASE_URL` wskazującego
  jednorazową bazę z nazwą kończącą się na `_test`; testy modyfikują tę bazę.

Polecenia z odpowiednich katalogów:

```powershell
# frontend/
npm run build

# backend/ (lokalny Windows venv)
.\.venv\Scripts\python.exe -m pytest -q
```

Podczas weryfikacji KAN-22 build przeszedł, a pełny zestaw backendu dał
35 zaliczonych testów i 3 pominięte testy integracyjne z powodu braku
`TEST_DATABASE_URL`. Wynik obejmuje także testy ról z KAN-22; nie stanowi
potwierdzenia wykonania powyższych scenariuszy ręcznych ani integracji z bazą.
