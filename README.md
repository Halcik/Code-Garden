# Code Garden

Projekt jest na etapie implementacji logowania i rejestracji użytkowników.

## Stack

- React — interfejs użytkownika.
- TypeScript — statyczne typowanie kodu.
- Vite — serwer deweloperski i budowanie aplikacji.
- CSS — podstawowe style
- npm — instalacja zależności i uruchamianie skryptów.

## Struktura repozytorium

- `frontend/` — aplikacja React + TypeScript + Vite.
- `backend/` — TBD


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

## Uruchomienie frontendu

W terminalu, z głównego katalogu repozytorium:

```sh
npm run setup
npm run dev
```

`npm install` instaluje wszystkie zależności zapisane w `package.json`, w tym React, TypeScript i Vite. Nie trzeba instalować ich globalnie. Wykonaj tę komendę przy pierwszym uruchomieniu oraz po zmianach zależności.

Otwórz w przeglądarce adres wyświetlony przez Vite, zwykle `http://localhost:5173`. Zatrzymaj serwer skrótem `Ctrl+C` w terminalu.
