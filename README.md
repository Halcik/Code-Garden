# Code Garden

Projekt ma zintegrowane logowanie i rejestrację użytkowników. JWT jest przechowywany w HttpOnly cookie.

## Stack

- React — interfejs użytkownika.
- TypeScript — statyczne typowanie kodu.
- Vite — serwer deweloperski i budowanie aplikacji.
- CSS — podstawowe style
- npm — instalacja zależności i uruchamianie skryptów.

## Struktura repozytorium

- `frontend/` — aplikacja React + TypeScript + Vite.
- `backend/` — FastAPI, PostgreSQL, SQLAlchemy, Alembic i autoryzacja JWT.


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
