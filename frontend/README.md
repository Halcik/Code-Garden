# Frontend — integracja autoryzacji

## Uruchomienie

Backend: wykonaj instrukcje z `../backend/README.md`, zastosuj migracje i uruchom
`uvicorn app.main:app --reload` w katalogu `backend/`.

Frontend:

```bash
cd frontend
npm install
cp .env.example .env
npm run dev -- --host localhost --port 5173
```

Nie nadpisuj istniejącego `.env`. Konfiguracja:

```ini
VITE_API_URL=http://localhost:8000
```

Po zmianie konfiguracji zrestartuj Vite. `.env` jest ignorowany przez główny
`.gitignore`; `.env.example` jest wersjonowany. Adres ma być bazowym URL bez `/auth`.
Otwórz `http://localhost:5173` i konsekwentnie używaj `localhost` dla obu serwerów.
CORS backendu musi dopuszczać origin frontendu z credentials.

## Pliki

- `src/api/auth.ts`: typy requestów/użytkownika, register/login/me/logout,
  `credentials: "include"`, czytelne komunikaty błędów HTTP i połączenia.
- `src/auth/AuthProvider.tsx`: użytkownik w pamięci React, sprawdzenie sesji przy
  starcie, ponowienie sprawdzenia, logowanie i wylogowanie.
- `src/App.tsx`: podłączenie providera.
- `src/components/auth/LoginForm.tsx`: request logowania, błędy i blokada wysyłania.
- `src/components/auth/RegisterForm.tsx`: request rejestracji, walidacja roli/emaila,
  powtórzenie hasła tylko po stronie formularza, brak automatycznego logowania.
- `src/components/auth/FormField.tsx`: blokowanie pola podczas requestu.
- `src/pages/AuthPage.tsx`: komunikat po rejestracji, przełączenie do logowania,
  potwierdzenie sesji i przycisk logout; bez dashboardu i przekierowań.
- `src/styles/auth.css`: kolor błędów, stan disabled, odstęp przy przycisku logout.
- `.env.example`: konfiguracja URL API.

## Flow

1. Start/odświeżenie: `GET /auth/me` z cookie. HTTP 401 oznacza brak sesji i pokazuje
   formularze. HTTP 200 zapisuje publiczne dane użytkownika w stanie React i pokazuje
   login oraz wylogowanie. Błąd połączenia pokazuje komunikat i przycisk ponowienia.
2. Rejestracja: `POST /auth/register` wysyła `login`, `password`, rolę `STUDENT` lub
   `TEACHER` oraz email (dla ucznia pusty email jest `null`). Nauczyciel wymaga emaila.
   Sukces przełącza formularz na logowanie i pokazuje potwierdzenie. Nie tworzy sesji.
3. Logowanie: `POST /auth/login`, następnie `GET /auth/me`. Backend ustawia cookie,
   przeglądarka automatycznie je wysyła. Dopiero po potwierdzeniu sesji dane użytkownika
   trafiają do stanu aplikacji.
4. Logout: `POST /auth/logout`. Po sukcesie stan użytkownika jest czyszczony i pokazuje
   się formularz logowania. Przy błędzie dane pozostają w stanie i można ponowić logout.

Frontend nie odczytuje JWT i nie zapisuje auth w localStorage/sessionStorage.
Istniejący zapis preferencji motywu w localStorage pozostaje niezależny od auth.
Zmiana trybu formularza i ponowne wysłanie są blokowane na czas requestu.
Backend zwraca jeden błąd 409 dla konfliktu loginu lub emaila, więc UI pokazuje:
„Ten login lub adres e-mail jest już zajęty”. Błędy walidacji są pokazane po polsku;
UI nie wyświetla surowych wyjątków ani wartości haseł z odpowiedzi walidacyjnych.

## Ręczny test end-to-end

1. Uruchom oba serwery. W DevTools → Network sprawdź `/auth/me`: 401 przed logowaniem
   jest oczekiwany. Sprawdź formularze w light i dark mode.
2. Zarejestruj ucznia z nowym loginem bez emaila. Powinno pojawić się potwierdzenie
   w formularzu logowania. Sesja nie jest tworzona.
3. Spróbuj zarejestrować ten sam login, a następnie osobny login z już zajętym emailem.
   Oba przypadki mają pokazać czytelny błąd konfliktu.
4. Wybierz nauczyciela. Brak emaila powinien blokować wysłanie; poprawny email pozwala
   utworzyć konto. Nie ma zatwierdzania przez administratora.
5. Zaloguj się błędnym hasłem, a następnie poprawnym. Po sukcesie Network pokazuje
   `/auth/login` i `/auth/me`, a ekran pokazuje login oraz przycisk wylogowania.
6. W DevTools → Application → Cookies sprawdź `access_token`: HttpOnly i SameSite=Lax.
   Lokalnie Secure jest wyłączone. Token nie występuje w odpowiedziach JSON ani storage.
7. Odśwież stronę. `/auth/me` przywraca stan użytkownika na podstawie cookie.
8. Kliknij „Wyloguj się”. Cookie znika, formularz logowania wraca. Odśwież stronę:
   użytkownik pozostaje wylogowany.
9. Zatrzymaj backend. Spróbuj logowania/rejestracji: pojawia się komunikat o połączeniu,
   przycisk odblokowuje się po błędzie. Uruchom backend ponownie i ponów request.
10. Włącz throttling w Network: przyciski pokazują stan ładowania, ponowny submit
    i przełączanie formularza są zablokowane. Sprawdź również błąd logout przy
    zatrzymanym backendzie — stan zalogowania pozostaje do skutecznego wylogowania.

Walidacja kompilacji:

```bash
npm run build
```
