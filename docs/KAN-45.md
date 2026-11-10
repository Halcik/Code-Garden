# KAN-45 — Przypisywanie zadań uczniom i grupom

## Użycie

W szczegółach istniejącego zadania nauczyciela kliknij górny przycisk
**Przypisz zadanie**, który otwiera okno przypisywania na środku ekranu.
Gotowe, zapisane i niezarchiwizowane zadanie
można przypisać wybranemu uczniowi lub całej własnej grupie. Lista uczniów obejmuje
wyłącznie członków grup zalogowanego nauczyciela, bez powtórzeń; wyszukiwanie działa
po loginie. Panel pokazuje liczbę członków wybranej grupy oraz wynik operacji:
liczbę nowych przypisań i pominiętych, istniejących przypisań.

Przycisk **Przypisz zadanie** na liście grup oraz w szczegółach konkretnej grupy
otwiera okno wyboru własnego gotowego zadania. Okno obsługuje wyszukiwanie,
stronicowanie i przypisanie do wskazanej grupy przez ten sam endpoint.

W szczegółach grupy zakładka **Zadania** wyświetla zadania z przypisaniami
utworzonymi dla tej grupy: tytuł, temat, trudność, liczbę przypisań oraz datę.
Po dodaniu zadania otwiera się i odświeża automatycznie. Lista uwzględnia również
zadania później zarchiwizowane i przypisania uczniów, którzy opuścili grupę.

Kafelek **Aktywne zadania** pokazuje liczbę różnych gotowych, niezarchiwizowanych
zadań przypisanych przez grupę (`active_task_count` w odpowiedzi API grupy).
Jedno zadanie przypisane wielu uczniom liczy się raz. Licznik aktualizuje się
po dodaniu i usunięciu przypisania. Nie wymaga dodatkowej migracji.

**Usuń przypisanie** po potwierdzeniu cofa indywidualne przypisania oznaczone
źródłem tej grupy i utworzone przez zalogowanego nauczyciela. Nie usuwa zadania,
szkiców ani wysłanych rozwiązań. Zachowuje przypisania bezpośrednie i pochodzące
z innych grup. Uczeń bez pozostałego przypisania nie widzi zadania w
sekcji przypisanych zadań, ale nadal może ćwiczyć je z katalogu, o ile jest gotowe
i niezarchiwizowane. Jego praca pozostaje w bazie.
Zadania przypisane uczniom wyłącznie bezpośrednio lub przez inną grupę nie są
wykazywane jako przypisania tej grupy. Usunięcie nieistniejącego przypisania
jest bezpieczne i zwraca 204.

Ekran ucznia pokazuje jednocześnie dwie sekcje z kafelkami: **Zadania przypisane
przez nauczyciela** i **Odkrywaj dalej** z katalogiem. Nie ma osobnego przełącznika
źródła zadań. Katalog pokazuje wszystkie zadania gotowe i niezarchiwizowane,
a sekcja przypisań tylko zadania przydzielone zalogowanemu uczniowi. Obie sekcje
korzystają ze wspólnych filtrów i kart oraz niezależnej paginacji i obsługi błędów.
Zadania z katalogu można otwierać i rozwiązywać bez przypisania.
Szkice, podpowiedzi i rozwiązania nadal należą do zalogowanego ucznia.
Zadania robocze i zarchiwizowane są niedostępne w obu widokach.

## Model i migracja

`TaskAssignment` / `task_assignments` przechowuje `id`, `task_id`, `student_id`,
`assigned_by_teacher_id`, opcjonalne `group_id`, `source_group_id` i `created_at`.
Każdy rekord jest niezależnym źródłem przypisania. `source_group_id = NULL`
oznacza przypisanie bezpośrednie danego nauczyciela; liczba oznacza źródłową grupę.
`group_id` pozostaje kluczem obcym do istniejącej grupy, a `source_group_id` zachowuje
tożsamość źródła po jej usunięciu.

Migracja **0016** zastępuje ograniczenie z 0015 przez
`UNIQUE NULLS NOT DISTINCT(task_id, student_id, assigned_by_teacher_id, source_group_id)`.
Ta sama grupa lub ten sam nauczyciel przypisujący bezpośrednio nie tworzy duplikatów.
Inna grupa lub inny nauczyciel tworzy osobne źródło, również gdy uczeń już ma zadanie.
PostgreSQL 17 obsługuje to ograniczenie także dla bezpośrednich źródeł z `NULL`.
Lista ucznia używa `EXISTS`, więc zadanie i jego wskaźniki postępu liczą się raz,
niezależnie od liczby źródeł. Usunięcie jednego źródła nie usuwa pozostałych.

Migracja kopiuje istniejące `group_id` do `source_group_id` bez zmiany id i dat.
Źródeł pominiętych dawniej przez `ON CONFLICT DO NOTHING`, ani tożsamości grup
usuniętych przed migracją nie da się odtworzyć z obecnych danych. Takie pominięte
przydzielenia należy wykonać ponownie; stare rekordy z `group_id = NULL` pozostają
odwoływalne przez właściciela po id. Downgrade do 0015 odmawia działania, jeśli
wymagałby utraty dodatkowych źródeł.

Usunięcie zadania lub ucznia usuwa powiązane przypisania. Nauczyciel przypisujący
jest chroniony przez `RESTRICT`. Usunięcie grupy ustawia `group_id` na `NULL`,
zachowując indywidualne przypisania. Członkostwo nie jest warunkiem ich późniejszego
istnienia; opuszczenie grupy nie cofa już przypisanego zadania. W oknie przypisań
przycisk **Cofnij** przy źródle pozwala właścicielowi cofnąć je również po usunięciu
grupy lub archiwizacji zadania. Zapisane rozwiązania pozostają zachowane.

Każde źródło ma własny identyfikator i datę utworzenia. Postęp per uczeń/zadanie
pozostaje niezależny od źródeł; KAN-42 może rozbudować tę warstwę. KAN-45 nie dodaje pól,
logiki deadline'ów ani nowego mechanizmu statusów.

## Dostępność i uprawnienia

W obecnym modelu nie istnieje flaga publikacji/publiczności. Edycja nauczyciela
jest ograniczona do własnych zadań, ale dotychczasowy katalog ucznia obejmował
wszystkie zadania `READY`, które nie były zarchiwizowane.

`assignable_task_filters(teacher_id)` w `app/services/task_assignments.py`
pozwala przypisywać wyłącznie własne, gotowe i niezarchiwizowane zadania nauczyciela.
Reguła obowiązuje przy przypisywaniu pojedynczemu uczniowi i całej grupie.
Samo `READY` nie nadaje nauczycielom prawa przypisywania cudzego zadania.
Do czasu wdrożenia systemu publikacji/katalogu ograniczamy przypisywanie do
własnych zadań nauczyciela. W przyszłości regułę własne/publiczne należy rozszerzyć
w tej funkcji razem z ustaleniem, kto ocenia rozwiązania zadań publicznych.
Katalog ucznia nadal obejmuje wszystkie gotowe, niezarchiwizowane zadania.
Nie dodano mechanizmu publikacji ani nowego katalogu nauczyciela; obecny panel
przypisań znajduje się w istniejącym ekranie szczegółów własnego zadania.

Wszystkie nowe endpointy wymagają aktywnego, zatwierdzonego `TEACHER` przez
istniejący RBAC. `ADMIN` nie ma domyślnego obejścia. POST korzysta z `check_origin`.
Id nauczyciela pochodzi z sesji; dodatkowe pola w payloadzie są odrzucane.

Indywidualne przypisanie sprawdza rolę `STUDENT` i istnienie członkostwa
w przynajmniej jednej grupie tego nauczyciela. Zapytanie `EXISTS` nie powiela
uczniów należących do kilku grup. Wyszukiwanie zwraca do 100 pasujących członków.
Historia w panelu obejmuje tylko przypisania utworzone przez zalogowanego nauczyciela,
również po opuszczeniu grupy przez ucznia. Autor może odczytać tę historię także
po archiwizacji lub cofnięciu zadania do wersji roboczej.
Istniejące źródła utworzone przed ograniczeniem do autora nie są usuwane:
przypisujący nauczyciel nadal może odczytać i cofnąć własne źródło, także dla
cudzego zadania po usunięciu grupy. Nie daje mu to prawa do nowych przypisań
ani do recenzowania cudzych zadań.

## Przypisanie grupowe

Własność grupy jest sprawdzana i jej rekord blokowany tak samo jak przy zmianach
członkostwa w KAN-44. Operacja tworzy indywidualne przypisania dla aktualnych
członków z rolą `STUDENT` w jednej transakcji. PostgreSQL `ON CONFLICT DO NOTHING`
pomija tylko duplikaty tego samego źródła również przy równoczesnych żądaniach; nie zmienia autora,
daty ani źródła istniejącego przypisania. Pusta grupa zwraca sukces z zerowymi licznikami.
`assigned_count` liczy nowe źródła tej grupy, a `already_assigned_count` źródła
już istniejące dla tej samej grupy. Przypisania bezpośrednie ani z innych grup
nie są pomijane i nie blokują powstania nowego źródła.

Nie jest zapisywana reguła przypisywania dla grupy: późniejsze zaakceptowanie
zaproszenia lub dołączenie kodem nie tworzy historycznych przypisań.
Można ponownie wykonać przypisanie grupowe, aby objąć nowych członków.

## API

| Metoda | Ścieżka | Działanie |
| --- | --- | --- |
| GET | `/teacher/assignment-students?q=login` | Członkowie własnych grup, bez duplikatów |
| GET | `/teacher/tasks/{task_id}/assignments` | Własna historia przypisań nauczyciela |
| POST | `/teacher/tasks/{task_id}/assignments` | Payload `{ "student_id": 1 }`, sukces 201, duplikat 409 |
| DELETE | `/teacher/tasks/{task_id}/assignments/{assignment_id}` | Cofnięcie własnego źródła, 204; cudze lub nieistniejące źródło 404; kontrola Origin |
| POST | `/teacher/tasks/{task_id}/group-assignments` | Payload `{ "group_id": 1 }`, liczniki nowych i istniejących przypisań |
| GET | `/teacher/groups/{group_id}/task-assignments` | Zadania przypisane przez tę grupę, z liczbą odbiorców i datą |
| DELETE | `/teacher/groups/{group_id}/task-assignments/{task_id}` | Cofnięcie przypisań utworzonych przez tę grupę, 204 |
| GET | `/student/tasks?view=assigned` | Własne przypisania; domyślne zachowanie API bez parametru |
| GET | `/student/tasks?view=catalog` | Wszystkie gotowe, niezarchiwizowane zadania; domyślny widok interfejsu |

Nie ma automatycznego przypisania istniejących zadań podczas migracji.
Nauczyciel musi przypisać zadania, aby pojawiły się w widoku **Przypisane**;
katalog jest dostępny niezależnie od przypisań.
Istniejące szkice i rozwiązania nie są usuwane.

## Weryfikacja

`tests/test_task_assignments.py` obejmuje relacje nauczyciel–grupa–uczeń,
duplikaty i constraint bazy, równoczesne przypisania, operacje grupowe i późniejsze
dołączenie, prywatność list i szczegółów, wszystkie operacje ucznia, RBAC i Origin.
Istniejące testy ucznia otrzymały jawne przypisania w danych testowych.
`TaskAssignments.test.tsx` sprawdza wyszukiwanie członków, oba sposoby przypisania,
komunikaty błędów, historię i anulowanie żądania po opuszczeniu ekranu.
Testy obejmują A→B→remove A, niezależne źródła dwóch nauczycieli,
grupa→usunięcie grupy→cofnięcie źródła, zachowanie bezpośredniego źródła,
RBAC i Origin dla DELETE. `test_assignment_sources_migration.py` sprawdza migrację
rekordów 0015, trwałość źródeł po usunięciu grup i ochronę przed stratnym downgrade.
