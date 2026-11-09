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
z innych grup. Uczeń bez pozostałego przypisania nie widzi zadania w zakładce
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
`assigned_by_teacher_id`, opcjonalne `group_id` i `created_at`.
Migracja **0015** dodaje klucze obce, indeksy ucznia, nauczyciela i grupy oraz
`UNIQUE(task_id, student_id)`. Indeks unikalny obsługuje również wyszukiwanie po zadaniu.

Usunięcie zadania lub ucznia usuwa powiązane przypisania. Nauczyciel przypisujący
jest chroniony przez `RESTRICT`. Usunięcie grupy ustawia `group_id` na `NULL`,
zachowując indywidualne przypisania. Członkostwo nie jest warunkiem ich późniejszego
istnienia; opuszczenie grupy nie cofa już przypisanego zadania.

Model ma własny identyfikator i datę utworzenia: w KAN-42 można dodać do niego
status i terminy bez zmiany mechanizmu przypisywania. KAN-45 nie dodaje tych pól,
logiki deadline'ów ani nowego mechanizmu statusów.

## Dostępność i uprawnienia

W obecnym modelu nie istnieje flaga publikacji/publiczności. Edycja nauczyciela
jest ograniczona do własnych zadań, ale dotychczasowy katalog ucznia obejmował
wszystkie zadania `READY`, które nie były zarchiwizowane.

`assignable_task_filters(teacher_id)` w `app/services/task_assignments.py`
wydziela dostępność do przypisywania zgodnie z tą regułą katalogu. Nie wymaga
autorstwa: również gotowe zadanie innego autora może zostać przypisane przez API.
W przyszłości regułę własne/publiczne należy rozszerzyć w tej funkcji.
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

## Przypisanie grupowe

Własność grupy jest sprawdzana i jej rekord blokowany tak samo jak przy zmianach
członkostwa w KAN-44. Operacja tworzy indywidualne przypisania dla aktualnych
członków z rolą `STUDENT` w jednej transakcji. PostgreSQL `ON CONFLICT DO NOTHING`
pomija duplikaty również przy równoczesnych żądaniach; nie zmienia autora,
daty ani źródła istniejącego przypisania. Pusta grupa zwraca sukces z zerowymi licznikami.

Nie jest zapisywana reguła przypisywania dla grupy: późniejsze zaakceptowanie
zaproszenia lub dołączenie kodem nie tworzy historycznych przypisań.
Można ponownie wykonać przypisanie grupowe, aby objąć nowych członków.

## API

| Metoda | Ścieżka | Działanie |
| --- | --- | --- |
| GET | `/teacher/assignment-students?q=login` | Członkowie własnych grup, bez duplikatów |
| GET | `/teacher/tasks/{task_id}/assignments` | Własna historia przypisań nauczyciela |
| POST | `/teacher/tasks/{task_id}/assignments` | Payload `{ "student_id": 1 }`, sukces 201, duplikat 409 |
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
