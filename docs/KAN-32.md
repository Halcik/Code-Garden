# KAN-32: lokalne uruchamianie Pythona

React wysyła aktualny kod i lokalne stdin do `POST /student/tasks/{id}/run`.
FastAPI sprawdza rolę STUDENT, READY i brak archiwizacji istniejącym helperem,
pobiera wersję i limity z Task, sprawdza interpreter w `/languages`, tworzy submission
i odpytuje Judge0 co 250 ms. Znormalizowany wynik nie zawiera tokenu. Nic z run
nie jest zapisywane w bazie. Prezentacja stdout/stderr pozostaje w KAN-33.
`memory` w odpowiedzi jest w KB, `time` w sekundach.

## Docker / Windows

Judge0 wymaga kontenerów Linux oraz uprzywilejowanych server/worker. Oficjalny
release 1.13.1 jest testowany na Linux; zalecany Ubuntu 22.04 z cgroups v1.
Docker Desktop/WSL2 może wymagać dostosowania cgroups; jeśli isolate nie działa,
uruchom ten sam compose w VM Ubuntu zgodnie z dokumentacją release:
https://github.com/judge0/judge0/releases/tag/v1.13.1
Konfiguracja compose bazuje na oficjalnym wydaniu; nie aktualizuj obrazu bez sprawdzenia kompatybilności.

Z katalogu głównego (PowerShell):

```powershell
Copy-Item backend/judge0/.env.example backend/judge0/.env
# Ustaw w tym pliku dwa różne losowe hasła POSTGRES_PASSWORD i REDIS_PASSWORD.
# Generator (uruchom dwa razy):
backend/.venv/Scripts/python.exe -c "import secrets; print(secrets.token_hex(32))"
docker compose -f backend/judge0/compose.yaml up -d
Invoke-RestMethod http://localhost:2358/languages | Where-Object name -Match Python
```

Nie zakładaj, że standardowy obraz zawiera Python 3.11–3.14. Jeśli brakuje wersji,
pozostaw jej ID jako `null`: wykonanie zwróci kontrolowane 503. Aby zapewnić
wszystkie cztery środowiska, administrator musi przygotować zgodny obraz Judge0
z interpreterami i wpisami języków (server i worker muszą używać tego samego
obrazu). Nie podstawiaj starszego Pythona pod oczekiwaną wersję.

## Konfiguracja backendu

Do `backend/.env` dodaj:

```dotenv
JUDGE0_URL=http://localhost:2358
JUDGE0_PYTHON_LANGUAGES={"3.11":null,"3.12":null,"3.13":null,"3.14":null}
JUDGE0_POLL_INTERVAL_MS=250
JUDGE0_MAX_WAIT_SECONDS=5
```

Zastąp `null` wyłącznie ID z własnego `/languages`, którego nazwa zawiera właściwą
wersję Pythona. Żadnych ID 3.11/3.12/3.13/3.14 nie wykryto ani nie zgadywano
przy wdrożeniu tego kodu. Backend dodatkowo weryfikuje nazwę z lokalnego katalogu.
JSON jest centralną, rozszerzalną konfiguracją wersji. Nauczyciel pobiera same
wersje przez `GET /teacher/execution-environments`, bez ID. Wersje z `null`
pozostają opcjami konfiguracji zadań, ale nie mogą zostać wykonane.

Task: domyślnie 3.13, 2 s CPU, 256 MB. Walidacja: 0 < CPU <= 15 s,
1 <= pamięć <= 512 MB. Wall time = max(5, CPU + 3) s; sieć wyłączona.
Globalny deadline (domyślnie 5 s) obejmuje HTTP i polling; przy dłuższych zadaniach
administrator może zwiększyć `JUDGE0_MAX_WAIT_SECONDS` (maks. 60 s).
Przekroczenie deadline nie oznacza błędu programu i nie anuluje już zakolejkowanego run.

## Uruchomienie aplikacji

Po zwykłej konfiguracji bazy i auth opisanej w README:

```powershell
docker compose -f backend/compose.yaml --env-file backend/.env up -d
backend/.venv/Scripts/python.exe -m pip install -r backend/requirements.lock.txt
Push-Location backend
.venv/Scripts/python.exe -m alembic upgrade head
Pop-Location
npm install --prefix frontend
npm run dev
```

## Test ręczny

1. Nauczyciel tworzy zadanie READY z poleceniem, wybiera dostępną wersję,
   zmienia limity i zapisuje. Otwórz ponownie: wszystkie trzy wartości mają być zachowane.
2. Zaloguj ucznia, otwórz zadanie, wpisz `print(input())` i stdin `hello`.
3. Kliknij „Uruchom kod”. W Network sprawdź, że body zawiera wyłącznie
   `source_code` i `stdin`; przycisk jest zablokowany i widać loading.
4. Odpowiedź 200 ma stdout `hello\n`, status, exit_code, time i memory, bez tokenu.
   Wynik pozostaje techniczny; UI stdout jest poza zakresem tego zadania.
5. Zatrzymaj Judge0: kolejny run zwraca 503, loading znika i można ponowić próbę.
6. Sprawdź wersję bez ID (503), zadanie DRAFT/zarchiwizowane (404), rolę
   TEACHER/ADMIN (403), >100 KB UTF-8 kodu/stdin (422), trwający polling (504).
7. Powtórz test dla każdej wersji rzeczywiście obecnej w `/languages`.

Alternatywnie, w konsoli przeglądarki zalogowanego ucznia (adres API zgodny z env):

```javascript
fetch('http://localhost:8000/student/tasks/1/run', {
  method: 'POST', credentials: 'include',
  headers: {'Content-Type': 'application/json'},
  body: JSON.stringify({source_code: 'print(input())', stdin: 'hello'})
}).then(async response => console.log(response.status, await response.json()));
```

Testy automatyczne nie wymagają Judge0: `cd backend; .venv/Scripts/python.exe -m pytest`.
Testy PostgreSQL wymagają oddzielnego `TEST_DATABASE_URL` kończącego się `_test`.
Frontend: `npm --prefix frontend test`, `npm --prefix frontend run build`.

## Zmienione i dodane pliki

- `README.md`
- `backend/.env.example`
- `backend/alembic/versions/0009_task_execution.py`
- `backend/app/api/student.py`
- `backend/app/api/teacher.py`
- `backend/app/core/config.py`
- `backend/app/models/task.py`
- `backend/app/schemas/execution.py`
- `backend/app/schemas/task.py`
- `backend/app/services/judge0.py`
- `backend/judge0/.env.example`
- `backend/judge0/compose.yaml`
- `backend/requirements.txt`
- `backend/tests/test_execution.py`
- `backend/tests/test_execution_integration.py`
- `docs/KAN-32.md`
- `frontend/src/api/studentTasks.ts`
- `frontend/src/api/tasks.ts`
- `frontend/src/components/teacher/TaskEditorPlaceholders.tsx`
- `frontend/src/pages/StudentTaskPage.test.tsx`
- `frontend/src/pages/StudentTaskPage.tsx`
- `frontend/src/pages/TaskCreateDrafts.test.tsx`
- `frontend/src/pages/TaskFormPage.test.tsx`
- `frontend/src/pages/TaskFormPage.tsx`
- `frontend/src/pages/TeacherTasksPage.test.tsx`
