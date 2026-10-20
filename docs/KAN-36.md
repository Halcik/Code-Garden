# KAN-36 — stopniowe odsłanianie podpowiedzi ucznia

W szczegółach zadania sekcja podpowiedzi zastępuje placeholder. Początkowo ładowana jest tylko liczba podpowiedzi. Kliknięcie „Pokaż podpowiedź”, a potem „Pokaż kolejną podpowiedź”, pobiera jedną treść, w kolejności ustalonej przez nauczyciela (`position`, następnie `id`). Odsłonięte podpowiedzi pozostają widoczne, a licznik zwiększa się dopiero po udanym pobraniu. Po ostatniej podpowiedzi przycisk znika i pojawia się komunikat o wyświetleniu wszystkich.

## API i dostęp

- `GET /student/tasks/{task_id}/hints` zwraca tylko `{ total }`, bez treści i tytułów.
- `GET /student/tasks/{task_id}/hints/{number}` zwraca pojedynczą podpowiedź `{ number, title, content }`. `number` jest numerem porządkowym od 1; luki w zapisanych pozycjach nauczyciela nie blokują pobierania kolejnej podpowiedzi.
- Oba endpointy wymagają aktywnej sesji STUDENT oraz zadania READY i niearchiwalnego. Nauczyciel i administrator dostają 403, brak sesji — 401; draft, archiwalne i nieistniejące zadanie — identyczne 404. Widoczność jest sprawdzana przy każdym pobraniu. Nieistniejący numer podpowiedzi daje 404. Odpowiedzi są oznaczone `Cache-Control: no-store`.
- Zapytanie jest zawsze ograniczone do wybranego zadania. Nie są zwracane konfiguracje testów, daty edycji ani dane nauczyciela. Nie udostępniono uczniowi operacji zapisu/usuwania podpowiedzi.
- Endpoint pojedynczej podpowiedzi jest odczytem wskazanego numeru. Kolejność odsłaniania i licznik są kontrolowane przez UI; backend nie prowadzi rejestru wykorzystania i nie wymusza wcześniejszego odczytu poprzednich numerów.

## Stan i błędy

Odsłonięte treści i licznik są lokalne dla bieżącego otwarcia konkretnego zadania. Rerender i zmiana motywu je zachowują, zmiana zadania lub opuszczenie strony rozpoczynają nową sesję odsłaniania. Nie dodano trwałej historii użycia, migracji, naliczania kar ani zapisu do rozwiązania ucznia. Użytkownik widzi informację o lokalnym charakterze licznika.

Pobieranie jest blokowane na czas requestu także za pomocą ref, aby zapobiec podwójnemu kliknięciu. Błąd odsłaniania nie zwiększa licznika i zachowuje poprzednie treści; ponowienie dotyczy tego samego numeru. Błąd pobrania liczby ma osobne ponowienie. Obsługiwane są brak podpowiedzi, loading, błąd sieci/HTTP, odświeżenie sesji przy 401/403, anulowanie przy odmontowaniu lub zmianie zadania i ignorowanie starych odpowiedzi. Podpowiedzi renderowane są jako tekst, bez wykonywania HTML. Odsłanianie nie modyfikuje bufora kodu ani startera.

## Wygląd

Porównano kontekst i screenshoty kart podpowiedzi z Figmy: light `15:27`, dark `217:6057`. Zachowano kartę materiałów, licznik, wyróżnione treści, znacznik „Wyświetlona” oraz przycisk z lokalną ikoną lightbulb z Figmy. Kolory w obu motywach pochodzą z istniejącego systemu zmiennych; nowe tokeny podpowiedzi odwzorowują ciemny wariant. Nie wraca usunięty pasek „Zadanie / Teoria / Podpowiedzi”. Weryfikacja rzeczywistego renderu w przeglądarce nadal nie jest dostępna w narzędziu.

## Zmienione pliki

- `backend/app/api/student.py`: endpointy podpowiedzi i wspólne sprawdzanie dostępności zadania.
- `backend/app/schemas/task_hint.py`: ograniczone schematy ucznia.
- `frontend/src/api/studentHints.ts`: klient endpointów ucznia i komunikaty błędów.
- `frontend/src/components/StudentTaskHints.tsx`: sesja odsłaniania, licznik i obsługa błędów.
- `frontend/src/pages/StudentTaskPage.tsx`: integracja w miejscu placeholdera.
- `frontend/src/styles/student-task.css`, `frontend/src/styles/theme.css`, `frontend/src/assets/student/lightbulb.svg`: oba motywy i ikona.
- `backend/tests/test_student_task_details.py`: uprawnienia podpowiedzi, ograniczenie do zadania, kontrakt, kolejność i niedostępność.
- `frontend/src/components/StudentTaskHints.test.tsx`: stopniowe pobieranie, retry, podwójne kliknięcia, zmiana zadania, abort/stale, brak podpowiedzi i bezpieczne renderowanie.
- `frontend/src/pages/StudentTaskPage.test.tsx`: integracja z edytorem, zachowanie kodu i podpowiedzi po zmianie motywu.

## Weryfikacja

- Frontend: **199 testów zaliczonych** w 14 plikach.
- Backend PostgreSQL: **229 testów zaliczonych**, bez pominięć; `alembic check`: brak nowych operacji.
- `npm run build`: OK (dotychczasowe ostrzeżenie o rozmiarze Monaco).

Uruchamianie kodu, wyniki testów, zapis wersji roboczej, submit i komentarze nauczyciela nie zostały zaimplementowane w KAN-36.
