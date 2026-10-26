export const friendlyMessages: Record<string, string> = {
  SyntaxError: "Kod zawiera niepoprawną składnię Pythona. Sprawdź, czy nawiasy i cudzysłowy są poprawnie zamknięte oraz czy w odpowiednich miejscach znajdują się dwukropki.",
  IndentationError: "W kodzie występuje problem z wcięciami. Sprawdź, czy bloki kodu mają poprawne wcięcia.",
  NameError: "Program używa nazwy, która nie została wcześniej zdefiniowana. Sprawdź, czy zmienna została utworzona i czy jej nazwa jest poprawna.",
  TypeError: "W tym miejscu program otrzymał inny typ danych, niż się spodziewał. Sprawdź używane wartości i sposób, w jaki próbujesz je połączyć lub przetworzyć.",
  ValueError: "Program dostał wartość, która w tym miejscu nie pasuje. Sprawdź, czy wpisane dane mają właściwą postać.",
  ZeroDivisionError: "Program próbuje wykonać dzielenie przez zero. Sprawdź wartość dzielnika.",
  IndexError: "Program próbuje odwołać się do elementu, którego nie ma pod podanym indeksem. Sprawdź indeks oraz liczbę elementów w kolekcji.",
  KeyError: "Program próbuje pobrać klucz, którego nie ma w słowniku. Sprawdź dostępne klucze.",
  AttributeError: "Program próbuje użyć atrybutu lub metody, której dany obiekt nie posiada. Sprawdź nazwę atrybutu lub metody oraz typ obiektu.",
  ImportError: "Wystąpił problem podczas importowania modułu lub elementu z modułu. Sprawdź import.",
  ModuleNotFoundError: "Python nie znalazł importowanego modułu. Sprawdź jego nazwę i dostępność.",
};

export const fallbackMessage = "Program zakończył się błędem. Sprawdź linię wskazaną przez program oraz szczegóły błędu.";

function isStudentFile(filename: string): boolean {
  // register-languages.rb uses script.py; Judge0 may include its sandbox path.
  return ["script.py", "/box/script.py", "./script.py", "main.py", "solution.py", "<stdin>", "<string>"].includes(filename);
}

export function parsePythonError(original_error: string) {
  let exception_type: string | null = null;
  let line_number: number | null = null;
  // A new traceback starts a new exception in a chained traceback.
  // Only known student filenames are eligible; never guess from library frames.
  for (const line of original_error.split(/\r?\n/)) {
    if (line.startsWith("Traceback (most recent call last):")) line_number = null;
    const frame = line.match(/^\s*File "([^"]+)", line ([1-9]\d*)(?:,|\s*$)/);
    if (frame && isStudentFile(frame[1])) {
      const number = Number(frame[2]);
      if (Number.isSafeInteger(number)) line_number = number;
    }
    // Exception summaries are unindented, unlike source lines and stack frames.
    const summary = line.match(/^([A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*)(?::|$)/);
    if (summary && summary[1] !== "Traceback") exception_type = summary[1];
  }
  return {
    exception_type, line_number, original_error,
    friendly_message_pl: friendlyMessages[exception_type ?? ""] ?? fallbackMessage
  };
}
