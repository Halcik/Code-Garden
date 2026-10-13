# Code Garden — backend autoryzacji

GitHub Actions uruchamia check `Backend tests` dla pull requestów i pushów do
`main`: instaluje zależności z lockfile, uruchamia PostgreSQL 17, stosuje migracje,
wykonuje testy (w tym integracyjne) i `alembic check`. Baza jest jednorazowa.
Aby check blokował merge, dodaj `Backend tests` do wymaganych statusów w regułach
ochrony gałęzi GitHub; sam plik workflow nie ustawia ochrony gałęzi.

Endpointy `/auth/login` i `/auth/register` mają wspólny limit 30 requestów na minutę
na IP. Logowanie ma dodatkowo limit 10 prób na minutę na znormalizowany login.
Przekroczenie zwraca HTTP 429 i nagłówek `Retry-After`, przed operacją Argon2.
Liczniki są w pamięci jednego procesu i resetują się po restarcie. Przy wielu
workerach lub instancjach należy zastąpić je wspólnym magazynem liczników.
Adres klienta pochodzi z połączenia ASGI; za proxy skonfiguruj zaufane adresy
proxy w Uvicorn, aby limit obejmował rzeczywiste IP klientów.

FastAPI + PostgreSQL. Frontend pozostaje bez zmian. Python 3.9+ (implementację sprawdzono na 3.9.6).

## Instalacja i uruchomienie

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env
python -c 'import secrets; print(secrets.token_urlsafe(48))'
```

W `.env` ustaw wygenerowany `JWT_SECRET` i własne hasło PostgreSQL w obu miejscach:
`POSTGRES_PASSWORD` oraz `DATABASE_URL`. Znaki specjalne w haśle URL muszą być zakodowane.
Przykładowy sekret jest celowo odrzucany przy starcie. `.env` jest ignorowany przez Git.
Jeżeli lokalna `.env` została już utworzona, zachowaj ją zamiast nadpisywać.

```bash
docker compose up -d --wait
alembic upgrade head
uvicorn app.main:app --host 127.0.0.1 --port 8000 --reload
```

Alternatywnie ustaw `DATABASE_URL` dla własnego PostgreSQL i pomiń Docker.
Proces musi startować z katalogu `backend/`. Dokumentacja API: http://localhost:8000/docs.

```bash
curl -i http://localhost:8000/health
# HTTP 200, {"status":"ok"}
```

`/health` sprawdza żywotność aplikacji, nie połączenie z bazą. Tabelę tworzy Alembic,
nie automatyczne `create_all`. Pierwsza rewizja `0001` tworzy `users`, enum
`user_role`, ograniczenia unikalności i wymaganie emaila nauczyciela.

## Struktura

```text
backend/
├── app/
│   ├── main.py                  # FastAPI, CORS, health
│   ├── api/auth.py              # register, login, logout, me
│   ├── api/dependencies.py      # bieżący użytkownik, kontrola Origin
│   ├── models/user.py           # ORM User, enum STUDENT/TEACHER/ADMIN
│   ├── schemas/auth.py          # walidacja wejścia i publiczna odpowiedź
│   ├── services/auth.py         # rejestracja i uwierzytelnianie
│   ├── core/config.py           # konfiguracja środowiskowa
│   ├── core/security.py         # Argon2id, JWT HS256
│   ├── db/base.py               # baza modeli SQLAlchemy
│   └── db/session.py            # silnik i sesje per request
├── alembic/env.py
├── alembic/script.py.mako
├── alembic/versions/0001_create_users.py
├── alembic.ini
├── compose.yaml                 # lokalny PostgreSQL 17
├── .env.example
├── requirements.txt
├── requirements-dev.txt
├── requirements.lock.txt        # wersje środowiska, na którym wykonano testy
├── pytest.ini
└── tests/                       # bezpieczeństwo i integracja PostgreSQL
```

## Zależności

- FastAPI — API i walidacja Pydantic.
- Uvicorn — serwer ASGI.
- SQLAlchemy 2 — ORM.
- Alembic — migracje.
- psycopg[binary] — sterownik PostgreSQL.
- pydantic-settings — konfiguracja `.env` i zmiennych środowiskowych.
- email-validator — walidacja emaila.
- pwdlib[argon2] — hashowanie Argon2id.
- PyJWT — podpisywanie i weryfikacja JWT.
- Testy: pytest i HTTPX.

Zakresy kompatybilnych wersji są w `requirements*.txt`. Dokładne wersje wszystkich
zainstalowanych zależności, także pośrednich i testowych, są w `requirements.lock.txt`.
Można odtworzyć środowisko przez `pip install -r requirements.lock.txt`.

## Reguły i sesja

Login: 3–50 znaków, litery ASCII, cyfry, `_`, `.`, `-`. Login i email są przycinane
i zamieniane na małe litery; unikalność w bazie obejmuje więc również wielkość liter
przy rejestracji przez API. Hasło: 8–128 znaków, bez przycinania. Uczeń może pominąć
email lub przekazać `null`; pusty string nie jest poprawnym emailem. Nauczyciel musi
podać email. Rejestracja domyślnie wybiera `STUDENT`, a `ADMIN` zwraca 422.
Nie ma publicznego endpointu tworzącego administratorów.

Rejestracja zwraca 201 i nie loguje automatycznie. Logowanie przyjmuje JSON z loginem
i hasłem, zwraca dane użytkownika i ustawia `access_token`. Cookie ma `HttpOnly`,
`SameSite=lax`, `Path=/` oraz czas życia odpowiadający JWT (domyślnie 30 minut).
`COOKIE_SECURE=false` lokalnie; na produkcji ustaw `true` i używaj HTTPS.
JWT zawiera identyfikator użytkownika, czas wydania/wygaśnięcia, issuer i audience.
Rola jest odczytywana z bazy, nie z danych przesłanych przez klienta.

`/me` akceptuje tylko cookie. JWT ani hash hasła nie są obecne w JSON.
Logout usuwa cookie i zwraca 204; jako mechanizm JWT bez stanu nie unieważnia kopii
wcześniej wydanego tokenu przed jego wygaśnięciem. Refresh tokenów nie ma.
Brak sesji lub niepoprawny/wygasły JWT: 401; konflikt loginu/emaila: 409;
niepoprawne dane: 422; niedozwolony Origin: 403.

## Przykładowe requesty

```bash
# Uczeń bez emaila
curl -i http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"login":"student1","password":"ExamplePassword123!","role":"STUDENT"}'

# Nauczyciel z wymaganym emailem
curl -i http://localhost:8000/auth/register \
  -H 'Content-Type: application/json' \
  -d '{"login":"teacher1","email":"teacher1@example.com","password":"ExamplePassword123!","role":"TEACHER"}'

# Logowanie; curl zachowuje HttpOnly cookie w pliku
curl -i -c /tmp/code-garden-cookies.txt http://localhost:8000/auth/login \
  -H 'Content-Type: application/json' \
  -d '{"login":"student1","password":"ExamplePassword123!"}'

curl -i -b /tmp/code-garden-cookies.txt http://localhost:8000/auth/me

curl -i -b /tmp/code-garden-cookies.txt -c /tmp/code-garden-cookies.txt \
  -X POST http://localhost:8000/auth/logout

# Po wylogowaniu: 401
curl -i -b /tmp/code-garden-cookies.txt http://localhost:8000/auth/me
```

W przyszłej integracji React używaj `credentials: "include"` w `fetch` (również
przy logowaniu i wylogowaniu). Nie odczytuj ani nie zapisuj tokenu w JavaScript.
`CORS_ORIGINS` jest listą JSON jawnych originów, domyślnie localhost/127.0.0.1:5173;
CORS dopuszcza credentials. Używaj konsekwentnie `localhost` albo `127.0.0.1`
po obu stronach. Przy `SameSite=lax` frontend i backend na produkcji muszą działać
w obrębie tej samej witryny. Wpisz produkcyjny origin w `CORS_ORIGINS`.
POST sprawdza Origin przeglądarki; requesty CLI bez Origin są dopuszczone.

## Testy

```bash
pytest -q
```

Bez `TEST_DATABASE_URL` pomijane są testy integracyjne. Wymagają osobnej,
jednorazowej bazy z nazwą kończącą się `_test`; testy czyszczą jej tabelę `users`.

```bash
docker compose exec -T db createdb -U code_garden code_garden_test
# Wstaw lokalne hasło zgodne z .env, nie prawdziwy sekret produkcyjny:
TEST_DATABASE_URL='postgresql+psycopg://code_garden:YOUR_LOCAL_PASSWORD@127.0.0.1:5432/code_garden_test' pytest -q
alembic check
```

Testy sprawdzają rejestrację obu ról, odrzucenie ADMIN, unikalność, login,
HttpOnly/SameSite/Secure, me/logout, błędne i wygasłe JWT, hashowanie oraz CORS/Origin.
