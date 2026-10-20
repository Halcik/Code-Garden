import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes } from "react-router-dom";
import { apiFetch } from "../api/client";
import { getHintSummary, getStudentHint } from "../api/studentHints";
import StudentTaskPage from "./StudentTaskPage";
import StudentTasksPage from "./StudentTasksPage";
import { ProtectedRoute } from "../auth/RouteGuards";

const auth = vi.hoisted(() => ({ retrySession: vi.fn(), role: "STUDENT" }));
const theme = vi.hoisted(() => ({ value: "light" }));
const monacoRender = vi.hoisted(() => vi.fn());
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession: auth.retrySession, loading: false, sessionError: "", user: { role: auth.role, status: "ACTIVE", teacher_approval: "APPROVED" } }) }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: theme.value }) }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../api/studentHints", () => ({ getHintSummary: vi.fn(async () => ({ total: 0 })), getStudentHint: vi.fn() }));
vi.mock("@monaco-editor/react", () => ({
  loader: { config: vi.fn() },
  default: (props: { value: string; onChange: (value: string) => void; theme: string; options: { readOnly: boolean; ariaLabel: string } }) => {
    monacoRender(props);
    return <textarea aria-label={props.options.ariaLabel} data-theme={props.theme} readOnly={props.options.readOnly} value={props.value} onChange={event => props.onChange(event.target.value)} />;
  },
}));
vi.mock("monaco-editor/editor/editor.worker?worker", () => ({ default: class {} }));
vi.mock("monaco-editor/languages/definitions/python/register", () => ({}));
vi.mock("monaco-editor/editor/editor.api", () => ({}));

const task = { id: 7, title: "Walidacja hasła", topic: "Napisy", description: "Opis zadania\nDrugi akapit", instructions: "Napisz funkcję validate_password(password).", theory: "Użyj isdigit() i any().", difficulty: "MEDIUM", task_type: "FUNCTION", estimated_time_minutes: 20, starter_code: "def validate_password(password):\n    pass\n" };
function view(path = "/student/tasks/7") {
  return <MemoryRouter initialEntries={[path]}><Link to="/student/tasks/8">Inne zadanie</Link><Routes>
    <Route element={<ProtectedRoute role="STUDENT" />}><Route path="/student/tasks/:taskId" element={<StudentTaskPage />} /></Route>
    <Route path="/student/tasks" element={<p>Katalog ucznia</p>} />
    <Route path="/teacher" element={<p>Panel nauczyciela</p>} />
    <Route path="/admin" element={<p>Panel administratora</p>} />
  </Routes></MemoryRouter>;
}
function mount() { return render(view()); }
function code() { return screen.getByRole("textbox", { name: "Twój kod Python" }) as HTMLTextAreaElement; }
function deferred() {
  let resolve!: (response: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
beforeEach(() => {
  vi.clearAllMocks(); theme.value = "light"; auth.role = "STUDENT";
  vi.mocked(getHintSummary).mockResolvedValue({ total: 0 });
  vi.mocked(getStudentHint).mockReset();
  vi.mocked(apiFetch).mockReset().mockImplementation(async () => Response.json(task));
});
afterEach(cleanup);

it("opens the real detail screen from the catalog and returns to the catalog", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => path.startsWith("/student/tasks?")
    ? Response.json({ items: [task], total: 1, limit: 24, offset: 0 }) : Response.json(task));
  render(<MemoryRouter initialEntries={["/student/tasks"]}><Routes>
    <Route path="/student/tasks" element={<StudentTasksPage />} />
    <Route path="/student/tasks/:taskId" element={<StudentTaskPage />} />
  </Routes></MemoryRouter>);
  fireEvent.click(await screen.findByRole("link", { name: task.title }));
  await screen.findByRole("textbox", { name: "Twój kod Python" });
  expect(code().value).toBe(task.starter_code);
  expect(screen.getByRole("heading", { name: task.title })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: "Zadania" }));
  expect(await screen.findByRole("link", { name: task.title })).toBeTruthy();
  expect(screen.queryByRole("textbox", { name: "Twój kod Python" })).toBeNull();
  expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path).every(path => path.startsWith("/student/tasks"))).toBe(true);
});

it("loads detail through the student API, shows all material and initializes an editable Python editor", async () => {
  const pending = deferred();
  vi.mocked(apiFetch).mockReturnValueOnce(pending.promise);
  mount();
  expect(screen.getByRole("status").textContent).toBe("Ładowanie zadania…");
  expect(screen.queryByRole("textbox")).toBeNull();
  await act(async () => { pending.resolve(Response.json(task)); });
  expect(await screen.findByRole("heading", { name: task.title })).toBeTruthy();
  expect((await screen.findByRole("textbox", { name: "Twój kod Python" }) as HTMLTextAreaElement).value).toBe(task.starter_code);
  expect(code().readOnly).toBe(false);
  expect(screen.getByText("Opis zadania Drugi akapit").textContent).toBe(task.description);
  expect(screen.getByText(task.instructions)).toBeTruthy();
  expect(screen.getByText(task.theory)).toBeTruthy();
  for (const value of ["Napisy", "Średni", "Funkcyjne", "Szacowany czas: ~20 min"]) expect(screen.getAllByText(value).length).toBeGreaterThan(0);
  expect(apiFetch).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledWith("/student/tasks/7", expect.objectContaining({ signal: expect.any(AbortSignal) }));
  expect(screen.queryByText("READY")).toBeNull();
  expect(screen.getByRole("heading", { name: "Testy automatyczne" })).toBeTruthy();
  expect(screen.getByText("Po uruchomieniu kodu tutaj pojawią się wyniki testów automatycznych.")).toBeTruthy();
  expect(screen.getByLabelText("Kategoria zadania: Napisy").textContent).toBe("Napisy");
  expect(screen.getByLabelText("Kategoria zadania: Napisy").textContent).not.toBe(task.title);
  expect(screen.queryByText("Wynik")).toBeNull();
});

it("keeps student edits through rerenders and both theme changes without writes", async () => {
  const { rerender } = mount();
  await screen.findByRole("textbox", { name: "Twój kod Python" });
  fireEvent.change(code(), { target: { value: "print('moja praca')" } });
  expect(task.starter_code).toBe("def validate_password(password):\n    pass\n");
  rerender(view());
  expect(code().value).toBe("print('moja praca')");
  expect(code().dataset.theme).toBe("light");
  theme.value = "dark"; rerender(view());
  expect(code().dataset.theme).toBe("vs-dark");
  expect(code().value).toBe("print('moja praca')");
  theme.value = "light"; rerender(view());
  expect(code().dataset.theme).toBe("light");
  expect(code().value).toBe("print('moja praca')");
  expect(apiFetch).toHaveBeenCalledOnce();
});

it("preserves edited code when revealing hints and changing theme", async () => {
  vi.mocked(getHintSummary).mockResolvedValue({ total: 1 });
  vi.mocked(getStudentHint).mockResolvedValue({ number: 1, title: "Kierunek", content: "Sprawdź długość hasła." });
  const { rerender } = mount();
  await screen.findByRole("textbox", { name: "Twój kod Python" });
  fireEvent.change(code(), { target: { value: "moja praca" } });
  fireEvent.click(await screen.findByRole("button", { name: "Pokaż podpowiedź" }));
  await screen.findByText("Sprawdź długość hasła.");
  expect(code().value).toBe("moja praca");
  theme.value = "dark"; rerender(view());
  expect(code().value).toBe("moja praca");
  expect(code().dataset.theme).toBe("vs-dark");
  expect(screen.getByText("Wykorzystane podpowiedzi: 1 z 1")).toBeTruthy();
  expect(getStudentHint).toHaveBeenCalledOnce();
  expect(apiFetch).toHaveBeenCalledOnce();
});

it("clears the old code while navigating and initializes the next task's starter once", async () => {
  const pending = deferred();
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json(task)).mockReturnValueOnce(pending.promise);
  mount(); await screen.findByRole("textbox", { name: "Twój kod Python" });
  fireEvent.change(code(), { target: { value: "moja praca dla 7" } });
  const firstSignal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
  fireEvent.click(screen.getByRole("link", { name: "Inne zadanie" }));
  expect(firstSignal?.aborted).toBe(true);
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByText(task.title)).toBeNull();
  expect(screen.getByRole("status").textContent).toBe("Ładowanie zadania…");
  await act(async () => { pending.resolve(Response.json({ ...task, id: 8, title: "Drugie zadanie", starter_code: "print(8)" })); });
  await screen.findByRole("heading", { name: "Drugie zadanie" });
  expect(code().value).toBe("print(8)");
  expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual(["/student/tasks/7", "/student/tasks/8"]);
});

it.each([null, ""])("handles %s starter code as an empty editable buffer and absent optional material", async starter_code => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ...task, starter_code, theory: null, instructions: null, description: "", estimated_time_minutes: null }));
  mount(); await screen.findByRole("textbox", { name: "Twój kod Python" });
  expect(code().value).toBe("");
  expect(screen.getByText("Do tego zadania nie dodano teorii.")).toBeTruthy();
  expect(screen.getByText("Brak opisu zadania.")).toBeTruthy();
  expect(screen.getByText("Czas nieokreślony")).toBeTruthy();
  fireEvent.change(code(), { target: { value: "print(1)" } });
  expect(code().value).toBe("print(1)");
});

it("shows instructions even when the catalog description is empty and treats content as plain text", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ ...task, description: "", instructions: '<script>alert("hello")</script>' }));
  mount(); await screen.findByRole("textbox", { name: "Twój kod Python" });
  expect(screen.getByText('<script>alert("hello")</script>')).toBeTruthy();
  expect(document.querySelector("script")).toBeNull();
  expect(screen.queryByText("Brak opisu zadania.")).toBeNull();
});

it("shows unavailable tasks without an editor and provides a way back to the catalog", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 404 }));
  mount();
  expect((await screen.findByRole("alert")).textContent).toContain("Nie znaleziono zadania lub jest ono niedostępne.");
  expect(screen.getByRole("heading", { name: "Zadanie niedostępne" })).toBeTruthy();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByRole("button", { name: "Spróbuj ponownie" })).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: "Wróć do katalogu zadań" }));
  expect(screen.getByText("Katalog ucznia")).toBeTruthy();
  expect(auth.retrySession).not.toHaveBeenCalled();
});

it.each([401, 403])("refreshes the session on %s without exposing task content", async status => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status }));
  mount(); await screen.findByRole("alert");
  expect(auth.retrySession).toHaveBeenCalledOnce();
  expect(screen.queryByRole("textbox")).toBeNull();
  expect(screen.queryByText(task.instructions)).toBeNull();
});

it.each(["server", "network"])("can retry a %s failure and load starter code", async failure => {
  if (failure === "server") vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 500 }));
  else vi.mocked(apiFetch).mockRejectedValueOnce(new Error("Brak połączenia"));
  mount(); await screen.findByRole("alert");
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  await screen.findByRole("textbox", { name: "Twój kod Python" });
  expect(code().value).toBe(task.starter_code);
  expect(screen.queryByRole("alert")).toBeNull();
  expect(vi.mocked(apiFetch).mock.calls.map(([path]) => path)).toEqual(["/student/tasks/7", "/student/tasks/7"]);
  expect(auth.retrySession).not.toHaveBeenCalled();
});

it.each(["success", "401", "network"])("ignores a stale %s response when switching tasks", async outcome => {
  const stale = deferred();
  vi.mocked(apiFetch).mockReturnValueOnce(stale.promise).mockResolvedValueOnce(Response.json({ ...task, id: 8, title: "Drugie zadanie", starter_code: "print(8)" }));
  mount();
  const signal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
  fireEvent.click(screen.getByRole("link", { name: "Inne zadanie" }));
  await screen.findByRole("textbox", { name: "Twój kod Python" });
  fireEvent.change(code(), { target: { value: "edytowany kod 8" } });
  await act(async () => {
    if (outcome === "network") stale.reject(new Error("Stary błąd"));
    else stale.resolve(outcome === "success" ? Response.json(task) : new Response(null, { status: 401 }));
  });
  expect(signal?.aborted).toBe(true);
  expect(code().value).toBe("edytowany kod 8");
  expect(screen.getByRole("heading", { name: "Drugie zadanie" })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(auth.retrySession).not.toHaveBeenCalled();
});

it("aborts a pending detail request on unmount", async () => {
  const pending = deferred();
  vi.mocked(apiFetch).mockReturnValueOnce(pending.promise);
  const { unmount } = mount();
  const signal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
  unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => { pending.reject(new Error("Cancelled")); });
  expect(auth.retrySession).not.toHaveBeenCalled();
});

it("does not execute, save, submit or reveal hints when disabled controls are clicked", async () => {
  mount(); await screen.findByRole("textbox", { name: "Twój kod Python" });
  for (const name of ["Zapisz wersję roboczą", "Wyślij rozwiązanie", "Uruchom kod"]) {
    const button = screen.getByRole("button", { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(true); fireEvent.click(button);
  }
  expect(apiFetch).toHaveBeenCalledOnce();
  const input = screen.getByRole("textbox", { name: "Dane wejściowe" }) as HTMLTextAreaElement;
  expect(input.disabled).toBe(true);
  expect(input.value).toBe("");
  expect(await screen.findByText("Do tego zadania nie dodano podpowiedzi.")).toBeTruthy();
  expect(screen.getByText("Tutaj pojawi się komentarz nauczyciela do Twojego rozwiązania.")).toBeTruthy();
  expect(monacoRender.mock.calls.at(-1)?.[0]).toMatchObject({ language: "python", options: { readOnly: false, minimap: { enabled: false }, lineNumbers: "on", tabSize: 4, insertSpaces: true, automaticLayout: true, scrollBeyondLastLine: false } });
});

it.each([["TEACHER", "Panel nauczyciela"], ["ADMIN", "Panel administratora"]])("guards the detail route from %s", async (role, heading) => {
  auth.role = role; mount();
  expect(await screen.findByText(heading)).toBeTruthy();
  expect(apiFetch).not.toHaveBeenCalled();
});
