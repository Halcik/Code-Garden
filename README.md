# Code Garden

Code Garden to platforma do nauki programowania w Pythonie, rozwijana z myślą
o uczniach i nauczycielach. Obecnie oferuje rejestrację i logowanie, dostęp
według ról ucznia, nauczyciela i administratora, zarządzanie użytkownikami
oraz tworzenie, edycję podstawowych danych, archiwizację i przywracanie
zadań nauczyciela. Interfejs obsługuje jasny i ciemny motyw.

Kolejne etapy obejmą treści edukacyjne, kod startowy, automatyczne sprawdzanie
rozwiązań i podpowiedzi.

## Stack

| Obszar | Technologie |
| --- | --- |
| Frontend | React 19, TypeScript, Vite, React Router 7 |
| Style | CSS, zmienne motywu, jasny i ciemny tryb |
| Backend | Python, FastAPI, Uvicorn, Pydantic / pydantic-settings |
| Baza danych | PostgreSQL 17, SQLAlchemy 2, psycopg 3 |
| Migracje | Alembic |
| Autoryzacja | JWT (PyJWT) w HttpOnly cookie, hasła Argon2 (pwdlib), role STUDENT / TEACHER / ADMIN |
| Testy frontendu | Vitest, React Testing Library, jsdom; testy komponentów w plikach `.test.tsx` |
| Testy backendu | pytest, HTTPX / FastAPI TestClient; testy integracyjne na osobnej bazie PostgreSQL |
| Narzędzia | Node.js, npm, Docker Compose, GitHub Actions |

## Struktura repozytorium

```text
Code-Garden/
├── frontend/
│   ├── src/
│   │   ├── api/               # Klient HTTP i API auth, użytkowników oraz zadań
│   │   ├── assets/            # Logo, fonty i ikony z Figmy
│   │   ├── auth/              # Sesja, kontrola dostępu i chronione trasy
│   │   ├── components/        # Komponenty wspólne oraz auth/, admin/, teacher/
│   │   ├── pages/             # Widoki i ich testy .test.tsx
│   │   ├── styles/            # Style widoków i tokeny motywów
│   │   ├── theme/             # Zarządzanie jasnym i ciemnym motywem
│   │   ├── App.tsx            # Routing aplikacji
│   │   └── main.tsx           # Punkt wejścia frontendu
│   ├── .env.example           # Przykładowa konfiguracja adresu API
│   ├── package.json          # Zależności i skrypty dev, test, build, preview
│   ├── tsconfig.json
│   └── vite.config.ts
├── backend/
│   ├── app/
│   │   ├── api/               # Endpointy auth, admin, teacher i zależności dostępu
│   │   ├── core/              # Konfiguracja, bezpieczeństwo i rate limiting
│   │   ├── db/                # Baza modeli i sesje SQLAlchemy
│   │   ├── models/            # Modele użytkowników i zadań
│   │   ├── schemas/           # Schematy żądań i odpowiedzi Pydantic
│   │   ├── services/          # Logika autoryzacji i administracji
│   │   └── main.py            # Aplikacja FastAPI
│   ├── alembic/versions/      # Migracje użytkowników, zadań i archiwizacji
│   ├── tests/                 # Testy jednostkowe i integracyjne pytest
│   ├── .env.example           # Przykładowa konfiguracja backendu i bazy
│   ├── compose.yaml           # Lokalny PostgreSQL
│   ├── alembic.ini
│   ├── requirements.txt       # Zakresy zależności aplikacji
│   ├── requirements.lock.txt  # Przypięte wersje zależności
│   └── requirements-dev.txt   # Zależności testowe
├── docs/                      # Opisy KAN-21–KAN-25 i scenariusze testowe
├── scripts/                   # Wspólne uruchamianie aplikacji i backendu
├── .github/workflows/         # Konfiguracja CI
├── package.json               # Główne skrypty setup i dev
└── README.md
```

Frontend zawiera formularze logowania i rejestracji, panel administracji
użytkownikami oraz listę, tworzenie, edycję i archiwizację zadań nauczyciela.
Backend obsługuje autoryzację, kontrolę ról i własności zadań oraz ich
archiwizację i przywracanie. Testy frontendu znajdują się obok testowanych
widoków i modułów, a testy backendu w `backend/tests/`.


## Instalacja narzędzi

1. Pobierz **Node.js 24 LTS** z [oficjalnej strony Node.js](https://nodejs.org/en/download). Na Windows wybierz instalator `.msi` dla swojej architektury (najczęściej x64).
2. Uruchom instalator z domyślnymi opcjami, pozostawiając instalację npm i dodanie Node.js do `PATH`. npm jest dostarczany razem z Node.js.
3. Po instalacji otwórz ponownie terminal. Jeśli korzystasz z terminala w VS Code, uruchom ponownie także VS Code.
4. Sprawdź instalację:

```sh
node --version
npm --version
```

Node.js powinien pokazać wersję `v24.x.x`, a npm swój numer wersji.

## Uruchomienie projektu

Po przygotowaniu `backend/.venv` i `backend/.env` włącz Docker Desktop.
W terminalu, z głównego katalogu repozytorium:

```sh
npm run setup
npm run dev
```

`npm install` instaluje wszystkie zależności zapisane w `package.json`, w tym React, TypeScript i Vite. Nie trzeba instalować ich globalnie. Wykonaj tę komendę przy pierwszym uruchomieniu oraz po zmianach zależności.

`npm run dev` uruchamia bazę, stosuje migracje i uruchamia frontend oraz backend
w jednym terminalu. Otwórz `http://localhost:5173`; API działa na `http://localhost:8000`.
`Ctrl+C` zatrzymuje oba serwery, a baza pozostaje uruchomiona w Dockerze.
Jeśli jeden serwer zakończy działanie, drugi również zostanie zatrzymany.

Możesz też uruchamiać serwery osobno: `npm run dev:frontend` i `npm run dev:backend`.

Po jednorazowym przygotowaniu `backend/.venv` i `backend/.env` włącz Docker Desktop
i aby uruchomić sam backend, z głównego katalogu projektu wykonaj:

```sh
npm run dev:backend
```

Skrypt uruchomi bazę PostgreSQL, zastosuje migracje i uruchomi backend z automatycznym
przeładowaniem. `Ctrl+C` zatrzymuje backend; baza pozostaje uruchomiona w Dockerze.
Instrukcje konfiguracji i migracji znajdują się w [backend/README.md](backend/README.md).
Konfiguracja API frontendu, opis flow i ręczny test end-to-end są w [frontend/README.md](frontend/README.md).
