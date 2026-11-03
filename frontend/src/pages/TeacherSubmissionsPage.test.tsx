import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TeacherSubmissionsPage from "./TeacherSubmissionsPage";
import { apiFetch } from "../api/client";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../components/PythonCodeEditor", () => ({ default: (p: { value: string; readOnly: boolean }) =>
  <textarea aria-label="Kod rozwiązania" value={p.value} readOnly={p.readOnly} /> }));
const student = { id: 3, login: "anna", status: "ACTIVE" };
const v1 = { id: 10, version: 1, submitted_at: "2026-11-03T10:00:00Z", passed_tests: 0, failed_tests: 1, total_tests: 1, all_passed: false };
const v2 = { ...v1, id: 11, version: 2, passed_tests: 1, failed_tests: 0, all_passed: true };
let empty = false;
let failure = 0;
let runtime = "time_limit_exceeded";
let structuralConfig: Record<string, unknown> = {};
beforeEach(() => {
  empty = false; failure = 0; runtime = "time_limit_exceeded";
  structuralConfig = {};
  vi.mocked(apiFetch).mockReset().mockImplementation(async path => {
    if (failure) return Response.json({}, { status: failure });
    if (path.includes("/students/")) return Response.json({ student, items: empty ? [] : [v2, v1] });
    if (path.includes("submissions?")) return Response.json({ items: empty ? [] : [{ student, submission_count: 2, latest_submission: v2 }], total: empty ? 0 : 1, limit: 25, offset: 0 });
    if (path.startsWith("/teacher/submissions/")) {
      const version = path.endsWith("11") ? v2 : v1;
      return Response.json({ ...version, task_id: 7, total_hints: 3, student, source_code: `print(${version.version})`,
        used_hints: [{ hint_id: 9, reveal_order: 1, revealed_at: v1.submitted_at }],
        test_results: [{ number: 1, definition: { name: "Tajny test", test_type: "INPUT_OUTPUT", is_hidden: true,
          config: { input_data: "sekret", expected_output: "ok" } }, execution_details_available: true,
          result: { status: version.all_passed ? "passed" : "failed", details: { actual_output: "ok", execution: { status: runtime, stderr: "NameError: name missing" } } } },
          { number: 2, definition: { name: "Publiczny test", test_type: "STRUCTURAL", is_hidden: false, config: structuralConfig }, result: { status: "passed" }, execution_details_available: false }] });
    }
    return Response.json({ id: 7, title: "Pętle", instructions: "Wypisz liczby od 1 do 10, używając pętli for." });
  });
});
afterEach(cleanup);
function mount(detail = false) {
  render(<MemoryRouter initialEntries={[detail ? "/teacher/tasks/7/students/3/submissions" : "/teacher/tasks/7/submissions"]}>
    <Routes><Route path="/teacher/tasks/:taskId/submissions" element={<TeacherSubmissionsPage />} />
      <Route path="/teacher/tasks/:taskId/students/:studentId/submissions" element={<TeacherSubmissionsPage />} /></Routes></MemoryRouter>);
}

it.each([
  ["FUNCTION_EXISTS", "oblicz", "Kod powinien zawierać funkcję: oblicz"],
  ["CLASS_EXISTS", "Uczen", "Kod powinien zawierać klasę: Uczen"],
  ["CALLS_FUNCTION", "print", "Kod powinien wywoływać funkcję: print"],
  ["USES_FOR", null, "Kod powinien zawierać pętlę for"],
  ["USES_WHILE", null, "Kod powinien zawierać pętlę while"],
  ["USES_IF", null, "Kod powinien zawierać instrukcję if"],
])("shows the stored structural requirement for %s alongside the status", async (rule, name, description) => {
  structuralConfig = { rule_type: rule, expected_value: name };
  mount(true);
  expect(await screen.findByText(description, { selector: ".submission-rule-description" })).toBeTruthy();
  expect(screen.queryByText("Sprawdzana reguła")).toBeNull();
  expect(screen.queryByText("Szczegóły wykonania nie zostały zapisane w tej historycznej wersji.")).toBeNull();
});

it("lists submitted students, counts, latest scores and opens their versions", async () => {
  mount();
  expect(await screen.findByText("anna")).toBeTruthy();
  expect(screen.getByText("2")).toBeTruthy();
  expect(screen.getByText("1 / 1 testów")).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Zobacz rozwiązania" }));
  expect(await screen.findByRole("button", { name: /Wersja 2/ })).toBeTruthy();
});
it("shows empty task and empty student states", async () => {
  empty = true; mount();
  expect(await screen.findByText("Żaden uczeń nie wysłał jeszcze rozwiązania tego zadania.")).toBeTruthy();
  cleanup(); mount(true);
  expect(await screen.findByText("Ten uczeń nie ma wysłanych rozwiązań tego zadania.")).toBeTruthy();
});
it("switches immutable code snapshots and exposes hidden and public results and hint identities", async () => {
  mount(true);
  const editor = await screen.findByLabelText("Kod rozwiązania") as HTMLTextAreaElement;
  expect(editor.value).toBe("print(2)"); expect(editor.readOnly).toBe(true);
  expect(screen.getByRole("heading", { name: "Polecenie" })).toBeTruthy();
  expect(screen.getByText("Wypisz liczby od 1 do 10, używając pętli for.")).toBeTruthy();
  expect(screen.queryByText("Historia formalnie wysłanych wersji · Tylko do odczytu")).toBeNull();
  expect(screen.getByText("Tajny test")).toBeTruthy(); expect(screen.getByText("Ukryty")).toBeTruthy();
  expect(screen.getByText("Publiczny")).toBeTruthy();
  expect(screen.queryByRole("heading", { name: "Wykorzystane podpowiedzi" })).toBeNull();
  expect(screen.getByText("Podpowiedzi").nextElementSibling?.textContent).toBe("1 z 3");
  expect(screen.getByText("Oczekiwane wyjście: ok")).toBeTruthy();
  expect(screen.getByText("Przekroczono limit czasu.")).toBeTruthy();
  expect(screen.queryByText("NameError: name missing")).toBeNull();
  expect(screen.getByText("Zaliczone").nextElementSibling?.textContent).toBe("1 z 1");
  fireEvent.click(screen.getByRole("button", { name: /Wersja 1/ }));
  expect((await screen.findByLabelText("Kod rozwiązania") as HTMLTextAreaElement).value).toBe("print(1)");
  expect(screen.queryByText("Wszystkie zaliczone")).toBeNull();
  expect(screen.getByText("Zaliczone").nextElementSibling?.textContent).toBe("0 z 1");
  expect(screen.queryByText("Niezaliczone")).toBeNull();
  expect(vi.mocked(apiFetch).mock.calls.every(([, options]) => !options?.method)).toBe(true);
});
it.each([403, 404])("handles %s without showing a submission", async status => {
  failure = status; mount(true);
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByLabelText("Kod rozwiązania")).toBeNull();
});
it("handles detail errors while keeping version navigation available", async () => {
  mount(true); await screen.findByLabelText("Kod rozwiązania");
  const original = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation((path, options) => path === "/teacher/submissions/10" ? Promise.resolve(Response.json({}, { status: 404 })) : original(path, options));
  fireEvent.click(screen.getByRole("button", { name: /Wersja 1/ }));
  expect(await screen.findByText("Nie znaleziono rozwiązania lub nie masz do niego dostępu.")).toBeTruthy();
  expect(screen.queryByLabelText("Kod rozwiązania")).toBeNull();
  expect(screen.getByRole("button", { name: /Wersja 2/ })).toBeTruthy();
});
