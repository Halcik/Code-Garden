# KAN-27 — definiowanie testów

## Zmiany

- `backend/app/models/task.py`: encja `TaskTest`, relacja `Task.tests` 1:N z usuwaniem osieroconych rekordów i sortowaniem po pozycji.
- `backend/app/models/__init__.py`, `backend/alembic/env.py`: rejestracja modelu.
- `backend/alembic/versions/0007_task_tests.py`: tabela, indeks FK, ograniczenia i downgrade.
- `backend/app/schemas/task_test.py`: walidacja konfiguracji trzech typów, tworzenia, częściowej edycji, odpowiedzi i reorder.
- `backend/app/api/teacher.py`: endpointy CRUD i kolejności z kontrolą autora, roli oraz archiwizacji.
- `backend/app/main.py`: DELETE w CORS.
- `frontend/src/api/taskTests.ts`: typy oraz komunikacja API.
- `frontend/src/components/teacher/TaskTests.tsx`: lista, formularz dynamiczny, potwierdzenie usuwania, publiczny/ukryty i DnD.
- `frontend/src/pages/TaskFormPage.tsx`: osadzenie sekcji w edycji zadania; nowe zadanie wymaga najpierw zapisania.
- `frontend/src/components/teacher/TaskEditorPlaceholders.tsx`: usunięcie przykładowych testów; pozostałe placeholdery zachowane.
- `frontend/src/styles/task-editor.css`: formularz i uchwyt.
- `frontend/package.json`, `frontend/package-lock.json`: zależności dnd-kit.
- `backend/tests/test_task_tests.py`, `frontend/src/components/teacher/TaskTests.test.tsx`: walidacja, CRUD, kolejność, zabezpieczenia i formularz.
- `backend/tests/conftest.py`: czyszczenie również nowej tabeli w testowej bazie.
- `frontend/src/pages/TaskFormPage.test.tsx`: dostosowanie testów ekranu do zastąpienia placeholdera.

## Model i konfiguracja

`TaskTest`: `id`, `task_id` (FK CASCADE, wymagany), `name`, `test_type`, `config`, `is_hidden`, `position`, `created_at`, `updated_at`. Pozycje zaczynają się od 1; serwer nadaje pozycję przy dodaniu i normalizuje po usunięciu. Typ jest ograniczony do INPUT_OUTPUT, FUNCTION, STRUCTURAL. Indeks na `task_id` służy do odczytu testów zadania.

`config` jest JSONB z określonym schematem, a nie tekstem:

```json
{"input_data": "2\n3\n", "expected_output": "5\n"}
{"function_name": "pole_prostokata", "arguments": [2, 3], "expected_result": 6}
{"rule_type": "FUNCTION_EXISTS", "expected_value": "pole_prostokata"}
{"rule_type": "USES_FOR", "expected_value": null}
```

Argumenty funkcji to tablica wartości JSON. Wynik może być dowolną wartością JSON, w tym `null`. To zachowuje typy do przyszłego wykonania w KAN-34. Nazwy i pola konfiguracji sprawdza Pydantic; obce pola są odrzucane. Zmiana typu wymaga konfiguracji poprawnej dla nowego typu.

## API

Wspólna ścieżka: `/teacher/tasks/{task_id}/tests`.

| Metoda | Sufiks | Działanie |
| --- | --- | --- |
| GET | — | Lista uporządkowana po position i id |
| POST | — | Nowy test; 201 |
| PATCH | `/{test_id}` | Częściowa edycja wspólnych pól; config zastępuje się w całości |
| DELETE | `/{test_id}` | Usunięcie i normalizacja pozycji; 204 |
| PATCH | `/reorder` | Jedna transakcja zmiany kolejności; zwraca posortowaną listę |

POST przyjmuje `name`, `test_type`, `config`, `is_hidden` (domyślnie false). PATCH waliduje scalony istniejący rekord z przekazanymi polami. Pozycja jest zarządzana wyłącznie serwerowo.

Reorder przyjmuje `{"test_ids": [4, 2, 7, 1]}` i wymaga dokładnie wszystkich identyfikatorów danego zadania, bez powtórzeń. Niepoprawny zestaw daje 422. Każdy zapis blokuje rekord zadania przez SELECT FOR UPDATE, tak samo jak archiwizacja, co serializuje równoległe operacje.

Wyłącznie nauczyciel będący autorem ma dostęp. Cudze zadanie lub test poza wskazanym zadaniem daje 404; inna rola 403. Archiwalne zadania można odczytać, ale każdy zapis daje 409. Zachowane są sprawdzanie Origin i brak cache odpowiedzi.

## Formularz i kolejność

Dynamiczny formularz wewnątrz sekcji edytora obsługuje wszystkie trzy typy i niezależną widoczność. INPUT_OUTPUT wymaga niepustego outputu, dopuszcza pusty input i zachowuje whitespace. FUNCTION wymaga nazwy, tablicy JSON i wyniku JSON. STRUCTURAL udostępnia FUNCTION_EXISTS, CLASS_EXISTS, CALLS_FUNCTION, USES_FOR, USES_WHILE, USES_IF. FUNCTION_EXISTS, CLASS_EXISTS i CALLS_FUNCTION wymagają oczekiwanej nazwy. CALLS_FUNCTION definiuje wymaganie wywołania wskazanej funkcji, np. `print`, `input`, `len`, `range`, `sum`; na tym etapie nie analizuje kodu. Konfiguracja to np. `{"rule_type": "CALLS_FUNCTION", "expected_value": "print"}`. Rozszerzenie nie wymaga migracji, ponieważ konfiguracja jest przechowywana w JSONB.

DnD używa `@dnd-kit/core` i `@dnd-kit/sortable`. Listeners są przypięte do przycisku z GripVertical; treść wiersza nie rozpoczyna przeciągania. Klawiatura: fokus uchwytu, Spacja, strzałki, Spacja; Escape anuluje. Po dropie lista zmienia się optymistycznie, wysyła jeden PATCH reorder i pobiera stan serwera. Po błędzie próbuje odzyskać stan; jeśli odczyt też zawiedzie, blokuje zmiany i pokazuje przycisk odświeżenia.

## Scenariusze ręczne

1. Otwórz własne zapisane zadanie. Dodaj INPUT_OUTPUT z pustym inputem i outputem zawierającym nowe linie. Odśwież i sprawdź dane.
2. Dodaj FUNCTION z argumentami `[2, 3]`, wynikiem `6`; następnie wynikami `false` i `null`. Sprawdź błędy dla `{}` jako argumentów i błędnego JSON.
3. Dodaj każdą z sześciu reguł strukturalnych. Sprawdź wymaganie nazwy dla FUNCTION_EXISTS, CLASS_EXISTS i CALLS_FUNCTION. Dla CALLS_FUNCTION zapisz `print`, odśwież stronę i sprawdź zachowanie nazwy; pusta nazwa powinna zostać odrzucona.
4. Edytuj nazwę, konfigurację, typ oraz publiczny/ukryty. Sprawdź zachowanie po odświeżeniu.
5. Przeciągnij ostatni test na początek uchwytem. W Network sprawdź jeden PATCH reorder. Odśwież i sprawdź identyczną kolejność. Powtórz klawiaturą.
6. Usuń środkowy test po potwierdzeniu. Sprawdź ciągłe numery 1, 2, 3. Anuluj inne usunięcie.
7. Zaloguj drugiego nauczyciela. Spróbuj GET/POST/PATCH/DELETE/reorder na pierwszym zadaniu bezpośrednio przez API; oczekuj 404. Uczeń otrzymuje 403.
8. Zarchiwizuj zadanie. Sprawdź odczyt listy oraz blokadę formularza, uchwytów i usuwania; bezpośrednie zapisy muszą dawać 409. Przywróć i ponów edycję.
9. Wyślij reorder z powtórzeniami, brakującym lub obcym ID; oczekuj 422 i niezmienionej kolejności.
10. Odłącz backend podczas zapisu/reorder. Sprawdź komunikat i ponowne pobranie listy przed dalszą pracą.

Migrację uruchamia się przez `python -m alembic upgrade head` z katalogu backend. Integracyjne testy wymagają `TEST_DATABASE_URL` wskazującego jednorazową bazę PostgreSQL z nazwą kończącą się `_test`.

Zakres nie obejmuje wykonywania kodu, AST, wyników ucznia, publikacji ani KAN-28.
