# KAN-33 — prezentacja wyniku uruchomienia

Panel „Wynik uruchomienia” pokazuje stdout z zachowaniem whitespace, pusty wynik,
pełne stderr (także przy jednoczesnym stdout), wyjątek, polskie wyjaśnienie,
numer linii oraz czas w sekundach i pamięć w KB. Wyjście jest renderowane jako
tekst React w `pre`, bez interpretowania HTML.

Sam kanał `stderr` nie klasyfikuje wykonania jako błędnego. Przy `completed`
oraz `time_limit_exceeded` jego pełna zawartość jest pokazywana jako diagnostyka,
bez sekcji wyjątku i przyjaznego wyjaśnienia błędu. Parsowanie wyjątku i sekcja
„Błąd programu” dotyczą wyłącznie statusu `execution_error`.

Styl panelu nawiązuje do Figma `217:6112`: zwarty nagłówek ze statusem,
czasem i pamięcią, kolorowy traceback oraz zaokrąglony blok wyjaśnienia
z ikoną i numerem linii. Komunikaty opisują typ wyjątku bez analizowania
logiki rozwiązania. Kolory korzystają z istniejących tokenów jasnego i ciemnego motywu.

`frontend/src/utils/pythonError.ts` parsuje osobno ramki stosu i końcowe
podsumowania wyjątków. Słownik `friendlyMessages` zawiera 11 wymaganych typów.
Nieznany typ otrzymuje neutralne wyjaśnienie, a oryginał pozostaje dostępny.
Wybierana jest ostatnia ramka kodu ucznia (`script.py`, `/box/script.py`,
`./script.py`, `main.py`, `solution.py`, `<stdin>`,
`<string>`); ścieżki bibliotek i wrapperów są pomijane. Dla nierozpoznanego
pliku numer linii nie jest zgadywany. Nowy traceback w łańcuchu zeruje numer
linii poprzedniego wyjątku.

Kontrakt backendu pozostaje bez zmian: KAN-32 normalizuje `compile_output`
do `stderr`, a statusy rozróżniają wykonanie, błąd i limit czasu programu.
HTTP 503 oznacza niedostępną usługę lub środowisko, HTTP 504 techniczny limit
oczekiwania. UI nie wyświetla treści odpowiedzi błędu backendu.

Ponowne uruchomienie usuwa poprzedni wynik i komunikat błędu. Przycisk jest
nieaktywny podczas requestu, a synchroniczna blokada w ref chroni przed
podwójnym wysłaniem. Po sukcesie i błędzie można uruchomić kod ponownie.
Mechanizm Judge0, ograniczenia bezpieczeństwa i brak zapisu runów są zachowane.

Weryfikacja: testy parsera i strony obejmują mapowania, składnię, ramki bibliotek,
łańcuch wyjątków, brak linii, nieznany wyjątek, whitespace, bezpieczne renderowanie,
stdout razem ze stderr, timeout programu, błędy HTTP i ponawianie uruchomień.
Testy integracyjne backendu wymagają `TEST_DATABASE_URL` wskazującego bazę testową.

Poza zakresem: historia, zapis prób, ocenianie, testy nauczyciela, interaktywny
terminal i streaming. Rozpoznawanie dowolnych nazw plików oraz rozbudowana
prezentacja Python ExceptionGroup mogą zostać dodane osobno.
