# KAN-22: role i kontrola dostępu

Frontend używa React Router (`BrowserRouter`). `/` i `/login` pokazują istniejący
formularz logowania/rejestracji. `PublicRoute` przekierowuje zalogowanego użytkownika
do panelu wyznaczonego przez rolę z `/auth/me`.

`ProtectedRoute` dopuszcza wyłącznie wskazaną rolę. Brak sesji kieruje do `/login`,
a inna rola do własnego panelu. Przekierowania używają `replace`. Nieznana ścieżka
kieruje do logowania lub własnego panelu. Panele zawierają nagłówek i przycisk logout.

`AuthProvider` sprawdza `/auth/me` przy każdym uruchomieniu aplikacji, w tym po
odświeżeniu, i po udanym logowaniu. Podczas sprawdzania guard pokazuje
„Sprawdzanie sesji…”. Przy błędzie serwera/sieci pokazuje błąd i przycisk ponowienia,
bez udostępniania panelu ani przekierowania na podstawie niepotwierdzonej sesji.
Użytkownik i rola pozostają w pamięci React; token jest w HttpOnly cookie.
Auth nie korzysta z localStorage ani sessionStorage.

Backend udostępnia `require_role` w `app/api/dependencies.py`, stosowany przez
`Depends(require_role(UserRole.STUDENT))`. Pobiera użytkownika przez istniejące
`get_current_user`, sprawdza rolę z bazy i zwraca 401 dla braku prawidłowej sesji
lub 403 dla niedozwolonej roli. Administrator nie omija kontroli ról.
Nie dodano endpointów biznesowych.

Hosting frontendu musi obsługiwać fallback do `index.html` dla tras SPA, aby
bezpośrednie wejście i odświeżenie `/student`, `/teacher`, `/admin` działały.
Serwer developerski i preview Vite obsługują ten fallback.

## Ręczne testy

Uruchom frontend i backend. Przygotuj konta STUDENT, TEACHER i istniejące konto
ADMIN w lokalnej bazie. Publiczna rejestracja nadal nie pozwala tworzyć ADMIN.

| Sesja | Po logowaniu / dozwolona trasa | Próby niedozwolone → oczekiwany wynik |
| --- | --- | --- |
| STUDENT | `/student`, „Panel ucznia” | `/teacher`, `/admin` → `/student` |
| TEACHER | `/teacher`, „Panel nauczyciela” | `/student`, `/admin` → `/teacher` |
| ADMIN | `/admin`, „Panel administratora” | `/student`, `/teacher` → `/admin` |
| Brak | `/login`, formularz logowania | wszystkie trzy panele → `/login` |

Dla każdej roli:

1. Zaloguj się i potwierdź docelowy URL oraz nagłówek z tabeli.
2. Wpisz ręcznie adresy obu cudzych paneli; sprawdź powrót do własnego panelu.
3. Odśwież własną i niedozwoloną trasę. W Network sprawdź nowe `/auth/me`.
   Z throttlingiem powinien pojawić się stan sprawdzania sesji przed decyzją.
4. Wejdź na `/`, `/login` i nieznaną trasę; powinien pojawić się własny panel.
5. Wyloguj się. Spróbuj wejść ponownie do panelu, także przez przycisk Wstecz.
   Powinien pojawić się formularz logowania.
6. Sprawdź, że storage nie zawiera roli ani tokenu (preferencja motywu jest osobna).

Bez sesji wejdź bezpośrednio na każdą trasę panelu i odśwież stronę.
Powinien pojawić się stan sprawdzania, następnie `/login`.
Zatrzymaj backend i odśwież chronioną trasę: powinien pojawić się błąd i ponowienie,
bez panelu. Uruchom backend ponownie i kliknij ponowienie.

Guardy backendowe weryfikuje `python -m pytest -q tests/test_roles.py`.
Endpointy testowe istnieją tylko w testowej aplikacji, więc produkcyjne API
nie ma jeszcze tras `/student`, `/teacher`, `/admin`.
