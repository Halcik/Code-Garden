# KAN-32: lokalne uruchamianie Pythona

React wysyła aktualny kod i lokalne stdin do `POST /student/tasks/{id}/run`.
FastAPI sprawdza rolę STUDENT, READY i brak archiwizacji istniejącym helperem,
pobiera wersję i limity z Task, sprawdza interpreter w `/languages`, tworzy submission
i odpytuje Judge0 co 250 ms. Znormalizowany wynik nie zawiera tokenu. Nic z run
nie jest zapisywane w bazie. Pod przyciskiem uruchomienia jest prosty panel
„Wynik / stdout”, pokazujący tekst wypisany przez program. Pełna prezentacja
stderr, błędów i timeoutów pozostaje w KAN-33.
`memory` w odpowiedzi jest w KB, `time` w sekundach.

## Własny obraz Judge0 i CPython

`backend/judge0/Dockerfile` bazuje na Judge0 CE **1.13.1**, z przypiętym digestem
obrazu amd64. Cztery etapy kompilują źródła CPython z python.org do osobnych
katalogów `/usr/local/code-garden/python-3.x`. `versions.json` przypina dokładne
wersje i SHA-256 archiwów `.tar.xz`; sumy pochodzą z `messageSignature.messageDigest`
oficjalnych plików `.tar.xz.sigstore` dostępnych pod tym samym adresem.
Build sprawdza SHA-256 przed rozpakowaniem. Nie jest to pełna weryfikacja podpisu
Sigstore w czasie builda; aktualizacje manifestu wymagają sprawdzenia źródła sum.

Nie podmieniamy systemowego `python3`, Ruby, bibliotek systemowych ani kodu
wykonawczego aplikacji FastAPI. `make altinstall` tworzy jawne binaria `python3.11`
do `python3.14`. Wersje są kompilowane na tej samej bazie co runtime, więc nie
wymagają nowszego glibc. Nie wykonujemy `apt upgrade` na starym Debianie Buster.
Standardowa biblioteka jest dostępna, bez pip i dodatkowych pakietów PyPI;
opcjonalne moduły zależne od nowszych bibliotek systemowych (np. `compression.zstd`)
nie są gwarantowane. Build sprawdza m.in. ssl, hashlib, ctypes, sqlite3, bz2, lzma i zlib.

Server i worker używają tego samego `code-garden/judge0:1.13.1-python`.
Seed rejestruje cztery aktywne języki, np. `Python 3.13 (CPython <patch>)`, z osobnymi
poleceniami uruchomienia. Skrypt zastępuje destrukcyjne `delete_all` oryginalnego
seeda aktualizacją rekordów, zachowując dotychczasowe języki i referencje submissions.
Przydziela ID w transakcji z blokadą PostgreSQL, na podstawie bieżącej bazy.
Ponowny start nie duplikuje wpisów; aktualizacja patcha zachowuje ID dzięki stałej
ścieżce polecenia. Nie trzeba usuwać istniejącego wolumenu bazy Judge0.

### Docker Desktop / WSL2 i cgroups

Oryginalny isolate z Judge0 1.13.1 obsługuje cgroups v1. Na Docker Desktop
z cgroups v2 zgłasza `Failed to create control group .../memory/box-...`.
Obraz zachowuje Judge0 1.13.1 i jego isolate dla hostów v1, a dla v2 buduje
przypięty **isolate 2.6**, ze statycznym libseccomp 2.6.0 i gperf 3.1.
Te źródła również są przypięte SHA-256 w `build-isolate.sh`.
Isolate 2.6 nie wymaga nowych nagłówków `clone3` używanych przez 2.7, dlatego
można go skompilować na zachowanej bazie Buster.

Compose wymaga prywatnej przestrzeni cgroups (`cgroup: private`) i istniejącego
trybu `privileged`. Entrypoint tworzy podgrupy **wewnątrz cgroup danego kontenera**,
przenosi procesy runtime i włącza kontrolery CPU, cpuset i pamięci. Nie montujemy
hierarchii cgroups hosta. Brak wymaganych kontrolerów blokuje start, zamiast
uruchamiać kod bez ograniczeń. Adapter usuwa tylko przestarzałą flagę
`--cg-timing`: isolate 2 zawsze mierzy CPU całej grupy. Limity CPU, pamięci,
wall time, deadline backendu i zakaz sieci pozostają aktywne.

Wymagania: Docker Desktop w trybie **Linux containers**, backend WSL2, amd64,
Compose v2 z obsługą `cgroup: private`, kernel z kontrolerami CPU/cpuset/memory
i zapisywalne cgroupfs w uprzywilejowanym kontenerze. Nie trzeba zmieniać
globalnej konfiguracji WSL ani GRUB. Polityka firmowego Dockera, Enhanced
Container Isolation lub zbyt stary kernel mogą blokować ten tryb — wtedy użyj
oddzielnej VM Linux. Nie wyłączaj limitów ani nie ustawiaj per-process jako obejścia.
Obsługa ARM64/emulacji nie jest deklarowana; baza jest przypięta do amd64.

Pierwszy build wymaga internetu i kilku GB wolnego miejsca (sama baza Judge0 jest
duża). Cztery kompilacje mogą trwać kilka–kilkanaście minut. Domyślnie każdy etap
używa dwóch zadań make; przy małej ilości RAM ustaw `$env:JUDGE0_BUILD_JOBS = '1'`.
Pliki shell/Ruby są utrzymywane jako LF przez `.gitattributes`. Entrypoint
normalizuje CRLF z windowsowego `.env` do prywatnej kopii w kontenerze, ponieważ
oryginalny Judge0 wczytuje konfigurację przez Bash `source`; bez tego host Redis
mógłby zawierać niewidoczny znak `\r`. Plik użytkownika nie jest modyfikowany.

Przypięcie wersji zapewnia powtarzalne wejścia builda, nie identyczność binarną
(kompilator może osadzać czas builda). Aktualizuj patche i sumy świadomie.

## Build i start — PowerShell z katalogu głównego repo

Po przygotowaniu istniejącego `backend/.venv` zgodnie z README:

```powershell
# Docker Desktop musi być włączony.
docker info --format 'OS={{.OSType}} cgroups={{.CgroupVersion}}'
backend/.venv/Scripts/python.exe backend/judge0/init_env.py
# Istniejący .env jest zachowany; nowy otrzymuje dwa różne losowe hasła.
docker compose -f backend/judge0/compose.yaml build server
docker compose -f backend/judge0/compose.yaml up -d --wait --wait-timeout 180
docker compose -f backend/judge0/compose.yaml ps
$languages = Invoke-RestMethod http://localhost:2358/languages
$languages | Where-Object name -Match '^Python 3\.(11|12|13|14) ' | Format-Table id,name
```

Healthcheck servera czeka na cztery wpisy w `/languages`; worker startuje dopiero
potem. Healthcheck nie zastępuje sprawdzenia wykonania w sandboxie.

```powershell
# Wysyła cztery programy przez HTTP do Judge0, czeka na wynik i sprawdza wersję.
backend/.venv/Scripts/python.exe backend/judge0/smoke_test.py
# Dodatkowo: rzeczywiste przerwanie po limicie CPU/pamięci i brak interfejsów sieciowych.
backend/.venv/Scripts/python.exe backend/judge0/smoke_test.py --check-limits
# Dopiero po sukcesie czterech prób zapisuje faktyczne ID w istniejącym backend/.env.
backend/.venv/Scripts/python.exe backend/judge0/smoke_test.py --write-env backend/.env
```

Smoke test wykonuje `import sys; print(sys.version)`, sprawdza pełne `version_info`
i `sys.executable` oraz importy podstawowej biblioteki **wewnątrz isolate**.
Nie uruchamia kodu lokalnym Pythonem ani przez subprocess. ID pobiera z `/languages`,
odrzuca brakujące lub niejednoznaczne wpisy i drukuje gotową linię env dopiero
po czterech sukcesach. Opcja `--url` pozwala wskazać własny self-hosted serwer.
Test jest osobnym narzędziem administratorskim; zwykły pytest nie wymaga Judge0.

### Wynik lokalnej weryfikacji 2026-10-21

Build i uruchomienie sprawdzone na Windows + Docker Desktop/WSL2, Linux amd64,
cgroups v2. Wszystkie cztery próby `sys.version`/ścieżki interpretera, CPU,
pamięci i namespace sieci przeszły. Server i worker miały identyczny image ID.
Ponowny start zachował cztery ID oraz wcześniejsze submissions. Rzeczywiste
wywołanie produkcyjnego `Judge0Service` z kodem `print(input())` przeszło dla
każdej wersji, ze znormalizowaną odpowiedzią. W tym teście poprawiono także
dekodowanie Base64 zawierającego LF/CRLF dodawane przez Ruby w Judge0 CE;
nie zmienia to kontraktu API i nadal odrzuca nieprawidłowy alfabet Base64.
Końcowy pełny zestaw backendu: **288 testów przeszło**, z migracjami i osobną
bazą PostgreSQL `_test`. Testy unit narzędzi nie wymagają działającego Judge0.

| Środowisko | Wersja CPython | ID odczytane z `/languages` tej instancji |
| --- | --- | --- |
| Python 3.11 | 3.11.17 | 90 |
| Python 3.12 | 3.12.15 | 91 |
| Python 3.13 (domyślne zadania) | 3.13.17 | 92 |
| Python 3.14 | 3.14.9 | 93 |

Wynik narzędzia, zapisany również w lokalnym `backend/.env`:

```dotenv
JUDGE0_PYTHON_LANGUAGES={"3.11":90,"3.12":91,"3.13":92,"3.14":93}
```

To zapis faktycznej weryfikacji, nie przenośna stała. Na innej bazie uruchom
odkrywanie ponownie. Nie umieszczamy tych ID w kodzie aplikacji ani modelu Task.

Diagnoza (logi Judge0 mogą zawierać konfigurację, nie publikuj ich w całości):

```powershell
docker compose -f backend/judge0/compose.yaml logs --tail 60 worker
docker compose -f backend/judge0/compose.yaml exec worker isolate --version
docker compose -f backend/judge0/compose.yaml exec worker cat /proc/self/cgroup
```

## Konfiguracja backendu

Do `backend/.env` dodaj:

```dotenv
JUDGE0_URL=http://localhost:2358
JUDGE0_PYTHON_LANGUAGES={"3.11":null,"3.12":null,"3.13":null,"3.14":null}
JUDGE0_POLL_INTERVAL_MS=250
JUDGE0_MAX_WAIT_SECONDS=5
```

Zastąp `null` wyłącznie ID z własnego `/languages`, którego nazwa zawiera właściwą
wersję Pythona — najlepiej poleceniem `smoke_test.py --write-env backend/.env` powyżej.
Nie kopiuj ID z innej instancji ani z samego pliku seeda. Backend dodatkowo
weryfikuje nazwę z lokalnego katalogu. Po zmianie env zrestartuj backend.
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
   Ten sam stdout jest widoczny na ekranie w panelu „Wynik”. Zachowuje wcięcia
   i nowe linie; brak stdout daje komunikat o pustym wyjściu. Kolejny run czyści
   poprzedni wynik, a zmiana zadania resetuje panel.
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

Testy narzędzi obrazu i regresji dekodowania (bez Dockera i Judge0):

```powershell
backend/.venv/Scripts/python.exe -m pytest backend/tests/test_judge0_image.py backend/tests/test_execution.py -q
```

`test_judge0_image.py` sprawdza manifest, odkrywanie rzeczywistych ID, niejednoznaczne
środowiska, polling, weryfikację interpreterów, limity payloadu, ochronę env przed
zapisem po nieudanym smoke i inicjalizację konfiguracji z LF bez nadpisywania haseł.

## Źródła techniczne

- [Judge0 CE 1.13.1 — Dockerfile](https://github.com/judge0/judge0/blob/v1.13.1/Dockerfile)
- [Judge0 — start i seed przy uruchomieniu](https://github.com/judge0/judge0/blob/v1.13.1/scripts/server)
- [Judge0 — definicje języków](https://github.com/judge0/judge0/blob/v1.13.1/db/languages/active.rb)
- [Isolate — cgroups v2 i zmiany flag](https://github.com/ioi/isolate/blob/v2.6/NEWS)
- [Isolate — dokumentacja sandboxa](https://github.com/ioi/isolate/blob/v2.6/isolate.1.txt)
- [Linux — stałe syscalli amd64 dla starszych nagłówków Buster](https://github.com/torvalds/linux/blob/v6.6/arch/x86/entry/syscalls/syscall_64.tbl)
- [Oficjalne źródła CPython](https://www.python.org/ftp/python/)

## Zmienione i dodane pliki

Rozszerzenie obrazu CPython/WSL2:

- `.gitattributes`, `.gitignore`
- `backend/judge0/Dockerfile`, `backend/judge0/.dockerignore`
- `backend/judge0/versions.json`, `backend/judge0/build-python.sh`
- `backend/judge0/build-isolate.sh`, `backend/judge0/isolate-v2.conf`
- `backend/judge0/isolate-compat.sh`, `backend/judge0/setup-cgroups.sh`, `backend/judge0/entrypoint.sh`
- `backend/judge0/seeds.rb`, `backend/judge0/register-languages.rb`, `backend/judge0/healthcheck.rb`
- `backend/judge0/init_env.py`, `backend/judge0/smoke_test.py`
- `backend/tests/test_judge0_image.py`
- `backend/app/services/judge0.py`, `backend/tests/test_execution.py` — obsługa Base64 z końcami linii
- aktualizacje `backend/judge0/compose.yaml`, `backend/judge0/.env.example`, `README.md` i tego dokumentu

Początkowa integracja KAN-32:

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
