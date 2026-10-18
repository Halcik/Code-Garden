import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TaskFormPage from "./TaskFormPage";
import { apiFetch } from "../api/client";
vi.mock("../components/teacher/TaskTests", () => ({ default: () => <section aria-label="Przypadki testowe" /> }));
vi.mock("../components/teacher/TaskHints", () => ({ default: () => <section aria-label="Podpowiedzi"><button disabled>Dodaj podpowiedź</button></section> }));
const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
const theme = vi.hoisted(() => ({ value: "light" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: theme.value }) }));
vi.mock("@monaco-editor/react", () => ({
  loader: { config: vi.fn() },
  default: (props: { value: string; onChange: (value: string) => void; theme: string; options: { readOnly: boolean } }) =>
    <textarea aria-label="Kod startowy Python" data-theme={props.theme} readOnly={props.options.readOnly}
      value={props.value} onChange={event => props.onChange(event.target.value)} />,
}));
vi.mock("monaco-editor/editor/editor.worker?worker", () => ({ default: class {} }));
vi.mock("monaco-editor/languages/definitions/python/register", () => ({}));
vi.mock("monaco-editor/editor/editor.api", () => ({}));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const task = { theory: "", instructions: "", starter_code: "", id: 7, title: "Pętle", topic: "Python", description: "Opis", difficulty: "EASY", task_type: "STANDARD", status: "DRAFT", estimated_time_minutes: 15 };
function formView(edit = false) { return <MemoryRouter initialEntries={[edit ? "/teacher/tasks/7/edit" : "/teacher/tasks/new"]}><Routes>
  <Route path="/teacher/tasks/new" element={<TaskFormPage />} /><Route path="/teacher/tasks/:taskId/edit" element={<TaskFormPage />} />
  <Route path="/teacher/tasks" element={<p>Lista zadań</p>} /></Routes></MemoryRouter>; }
function open(edit = false) { return render(formView(edit)); }
function fill() {
  for (const [label, value] of [["Tytuł", " Nowe zadanie "], ["Temat", " Python "], ["Poziom trudności", "EASY"], ["Typ zadania", "STANDARD"]])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
}
beforeEach(() => { theme.value = "light"; vi.resetAllMocks(); vi.mocked(apiFetch).mockImplementation(async () => Response.json(task)); });
afterEach(cleanup);
it("creates a task, trims fields and returns to the list", async () => {
  open(); expect((screen.getByLabelText("Tytuł") as HTMLInputElement).value).toBe(""); fill();
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  expect(await screen.findByText("Lista zadań")).toBeTruthy();
  const [path, options] = vi.mocked(apiFetch).mock.calls[0];
  expect(path).toBe("/teacher/tasks"); expect(options?.method).toBe("POST");
  expect(JSON.parse(options!.body as string)).toEqual({ title: "Nowe zadanie", topic: "Python", description: "", theory: "", instructions: "", starter_code: "", difficulty: "EASY", task_type: "STANDARD", status: "DRAFT", estimated_time_minutes: null });
});
it("validates required fields, whitespace and positive integer time", () => {
  open(); fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  expect(screen.getByRole("alert")).toBeTruthy(); expect(apiFetch).not.toHaveBeenCalled(); fill();
  fireEvent.change(screen.getByLabelText("Przewidywany czas (minuty)"), { target: { value: "0" } });
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" })); expect(apiFetch).not.toHaveBeenCalled();
});
it("loads an existing task and patches only changes including clearing time", async () => {
  open(true); expect(screen.getByRole("status").textContent).toContain("Ładowanie");
  await screen.findByLabelText("Tytuł");
  expect((screen.getByLabelText("Tytuł") as HTMLInputElement).value).toBe("Pętle");
  fireEvent.change(screen.getByLabelText("Tytuł"), { target: { value: "Nowy tytuł" } });
  fireEvent.change(screen.getByLabelText("Przewidywany czas (minuty)"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  expect((await screen.findByRole("status")).textContent).toContain("Zmiany zostały zapisane");
  expect(JSON.parse(vi.mocked(apiFetch).mock.calls[1][1]!.body as string)).toEqual({ title: "Nowy tytuł", estimated_time_minutes: null });
});
it("blocks duplicate submissions and allows retry after save error", async () => {
  let resolve!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  open(); fill(); fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  const button = screen.getByRole("button", { name: "Zapisywanie…" }) as HTMLButtonElement;
  expect(button.disabled).toBe(true); fireEvent.click(button); expect(apiFetch).toHaveBeenCalledTimes(1);
  await act(async () => resolve(Response.json({}, { status: 500 })));
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" })); expect(await screen.findByText("Lista zadań")).toBeTruthy();
});
it.each([401, 403, 404, 500])("handles load failure %s and retry", async status => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({}, { status })); open(true);
  expect(await screen.findByRole("alert")).toBeTruthy(); expect(screen.queryByLabelText("Tytuł")).toBeNull();
  if ([401, 403].includes(status)) expect(auth.retrySession).toHaveBeenCalledOnce();
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" })); await screen.findByLabelText("Tytuł");
});
it("skips unchanged PATCH and cancels to the list", async () => {
  open(true); await screen.findByLabelText("Tytuł"); fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Brak zmian do zapisania."));
  expect(apiFetch).toHaveBeenCalledTimes(1); fireEvent.click(screen.getByRole("link", { name: "Anuluj" })); expect(await screen.findByText("Lista zadań")).toBeTruthy();
});

it.each(["light", "dark"])("shows all Figma editor placeholders in %s mode without saving their data", async mode => {
  theme.value = mode;
  open(); fill();
  expect(screen.getByRole("region", { name: "Przypadki testowe" })).toBeTruthy();
  expect(screen.getByRole("region", { name: "Podpowiedzi" })).toBeTruthy();
  for (const name of ["Ustawienia wykonania", "Gotowość zadania", "Publikacja"])
    expect(screen.getByRole("region", { name: `${name} — placeholder` })).toBeTruthy();
  expect((screen.getByLabelText("Krótka teoria") as HTMLTextAreaElement).disabled).toBe(false);
  expect((screen.getByLabelText("Treść zadania") as HTMLTextAreaElement).disabled).toBe(false);
  expect(screen.queryByRole("button", { name: "Archiwizuj zadanie" })).toBeNull();
  for (const name of ["Podgląd", "Dodaj podpowiedź", "Edytuj limity", "Wyślij do recenzji publicznej"])
    expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  for (const button of screen.getAllByRole("button", { name: "Przetestuj zadanie" })) {
    expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button);
  }
  expect(apiFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  await screen.findByText("Lista zadań");
  const payload = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(Object.keys(payload).sort()).toEqual(["description", "difficulty", "estimated_time_minutes", "instructions", "starter_code", "status", "task_type", "theory", "title", "topic"]);
});

it("opens archived tasks read-only and restores before enabling editing", async () => {
  let archived = true;
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => {
    if (options?.method === "PATCH") archived = false;
    return Response.json({ ...task, is_archived: archived });
  });
  open(true); await screen.findByLabelText("Tytuł");
  const field = screen.getByLabelText("Tytuł") as HTMLInputElement;
  expect(field.closest("fieldset")?.disabled).toBe(true);
  expect(screen.getByText("Tylko do odczytu. Przywróć zadanie, aby ponownie je edytować.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Zapisz zmiany" })).toBeNull();
  fireEvent.submit(field.closest("form")!);
  expect(vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(0);
  fireEvent.click(screen.getByRole("button", { name: "Przywróć" }));
  await screen.findByRole("button", { name: "Zapisz zmiany" });
  await screen.findByLabelText("Tytuł");
  expect(screen.getByLabelText("Tytuł").closest("fieldset")?.disabled).toBe(false);
  expect(apiFetch).toHaveBeenCalledWith("/teacher/tasks/7/restore", expect.objectContaining({ method: "PATCH" }));
});

it.each(["light", "dark"])("archives an existing task in %s mode and switches to read-only", async mode => {
  theme.value = mode;
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => options?.method === "PATCH"
    ? new Promise(done => { finish = done; }) : Response.json({ ...task, is_archived: false }));
  open(true); await screen.findByLabelText("Tytuł");
  fireEvent.click(screen.getByRole("button", { name: "Archiwizuj zadanie" }));
  const pending = screen.getByRole("button", { name: "Archiwizowanie…" }) as HTMLButtonElement;
  expect(pending.disabled).toBe(true); fireEvent.click(pending);
  expect(vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(1);
  expect(apiFetch).toHaveBeenCalledWith("/teacher/tasks/7/archive", expect.objectContaining({ method: "PATCH" }));
  await act(async () => finish(Response.json({ ...task, is_archived: true })));
  expect((await screen.findByRole("status")).textContent).toBe("Zadanie zostało zarchiwizowane.");
  expect(screen.queryByRole("button", { name: "Archiwizuj zadanie" })).toBeNull();
  expect(screen.getByRole("button", { name: "Przywróć" })).toBeTruthy();
  expect(screen.getByLabelText("Tytuł").closest("fieldset")?.disabled).toBe(true);
});

it("keeps editing available and allows retry when archiving fails", async () => {
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => options?.method === "PATCH"
    ? Response.json({}, { status: 500 }) : Response.json({ ...task, is_archived: false }));
  open(true); await screen.findByLabelText("Tytuł");
  fireEvent.click(screen.getByRole("button", { name: "Archiwizuj zadanie" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Archiwizuj zadanie" }) as HTMLButtonElement).disabled).toBe(false);
  expect(screen.getByLabelText("Tytuł").closest("fieldset")?.disabled).toBe(false);
});

it.each(["light", "dark"])("loads and saves learning content and exact Python whitespace in %s mode", async mode => {
  theme.value = mode;
  const code = "    print('hello')\n\n";
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ ...task, theory: "Theory", instructions: "Context", starter_code: code }));
  open(true);
  await screen.findByDisplayValue("Theory");
  const editor = await screen.findByLabelText("Kod startowy Python") as HTMLTextAreaElement;
  expect(editor.value).toBe(code);
  expect(editor.dataset.theme).toBe(mode === "dark" ? "vs-dark" : "light");
  fireEvent.change(screen.getByLabelText("Krótka teoria"), { target: { value: "New theory" } });
  fireEvent.change(screen.getByLabelText("Treść zadania"), { target: { value: "New instructions" } });
  fireEvent.change(editor, { target: { value: code + "# end\n" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  await screen.findByText("Zmiany zostały zapisane.", { selector: "[role=status]" });
  expect(JSON.parse(vi.mocked(apiFetch).mock.calls[1][1]!.body as string)).toEqual({
    theory: "New theory", instructions: "New instructions", starter_code: code + "# end\n",
  });
});

it("keeps the archived code editor read-only", async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ ...task, is_archived: true, starter_code: "print(1)" }));
  open(true);
  const editor = await screen.findByLabelText("Kod startowy Python") as HTMLTextAreaElement;
  expect(editor.readOnly).toBe(true);
  fireEvent.change(editor, { target: { value: "changed" } });
  expect(editor.value).toBe("print(1)");
});

it("requires instructions for READY while allowing an empty draft", () => {
  open(); fill();
  fireEvent.change(screen.getByLabelText("Krótki opis"), { target: { value: "Sam opis nie jest poleceniem" } });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "READY" } });
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  expect(screen.getByRole("alert").textContent).toContain("polecenie");
  expect(apiFetch).not.toHaveBeenCalled();
});

it("keeps summary and instructions in separate sections and saves them independently", async () => {
  open(); fill();
  const summary = screen.getByLabelText("Krótki opis");
  const instructions = screen.getByLabelText("Treść zadania");
  expect(summary.closest("form")?.id).toBe("task-basics-form");
  expect(instructions.closest("section")?.getAttribute("aria-label")).toBe("Treści edukacyjne");
  fireEvent.change(summary, { target: { value: "Short summary" } });
  fireEvent.change(instructions, { target: { value: "Detailed instructions" } });
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  await screen.findByText("Lista zadań");
  expect(JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string)).toMatchObject({
    description: "Short summary", instructions: "Detailed instructions",
  });
});

it("switches Monaco theme without resetting unsaved content or reloading the task", async () => {
  const view = open(true);
  const editor = await screen.findByLabelText("Kod startowy Python") as HTMLTextAreaElement;
  fireEvent.change(editor, { target: { value: "    print('unsaved')\n" } });
  fireEvent.change(screen.getByLabelText("Treść zadania"), { target: { value: "Unsaved instructions" } });
  theme.value = "dark";
  view.rerender(formView(true));
  expect(editor.dataset.theme).toBe("vs-dark");
  expect(editor.value).toBe("    print('unsaved')\n");
  expect((screen.getByLabelText("Treść zadania") as HTMLTextAreaElement).value).toBe("Unsaved instructions");
  theme.value = "light";
  view.rerender(formView(true));
  expect(editor.dataset.theme).toBe("light");
  expect(editor.value).toBe("    print('unsaved')\n");
  expect(apiFetch).toHaveBeenCalledTimes(1);
});

it("locks content while saving and preserves it after a failed PATCH for retry", async () => {
  let finish!: (response: Response) => void;
  vi.mocked(apiFetch)
    .mockResolvedValueOnce(Response.json(task))
    .mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }))
    .mockImplementation(async () => Response.json(task));
  open(true);
  const editor = await screen.findByLabelText("Kod startowy Python") as HTMLTextAreaElement;
  for (const [label, value] of [["Krótki opis", "New summary"], ["Krótka teoria", "New theory"],
    ["Treść zadania", "New instructions"], ["Kod startowy Python", "    pass\n"]]) {
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  }
  fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  expect(editor.readOnly).toBe(true);
  expect(screen.getByLabelText("Treść zadania").closest("fieldset")?.disabled).toBe(true);
  await act(async () => finish(Response.json({}, { status: 500 })));
  await screen.findByRole("alert");
  expect(editor.readOnly).toBe(false);
  expect(editor.value).toBe("    pass\n");
  expect((screen.getByLabelText("Treść zadania") as HTMLTextAreaElement).value).toBe("New instructions");
  fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  await screen.findByText("Zmiany zostały zapisane.", { selector: "[role=status]" });
  expect(vi.mocked(apiFetch).mock.calls[2][1]?.body).toBe(vi.mocked(apiFetch).mock.calls[1][1]?.body);
  expect(JSON.parse(vi.mocked(apiFetch).mock.calls[2][1]!.body as string)).toEqual({
    description: "New summary", theory: "New theory", instructions: "New instructions", starter_code: "    pass\n",
  });
});
