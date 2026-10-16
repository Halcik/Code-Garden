import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TaskFormPage from "./TaskFormPage";
import { apiFetch } from "../api/client";
const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
const theme = vi.hoisted(() => ({ value: "light" }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: theme.value }) }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const task = { id: 7, title: "Pętle", topic: "Python", description: "Opis", difficulty: "EASY", task_type: "STANDARD", status: "DRAFT", estimated_time_minutes: 15 };
function open(edit = false) { render(<MemoryRouter initialEntries={[edit ? "/teacher/tasks/7/edit" : "/teacher/tasks/new"]}><Routes>
  <Route path="/teacher/tasks/new" element={<TaskFormPage />} /><Route path="/teacher/tasks/:taskId/edit" element={<TaskFormPage />} />
  <Route path="/teacher/tasks" element={<p>Lista zadań</p>} /></Routes></MemoryRouter>); }
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
  expect(JSON.parse(options!.body as string)).toEqual({ title: "Nowe zadanie", topic: "Python", description: "", difficulty: "EASY", task_type: "STANDARD", status: "DRAFT", estimated_time_minutes: null });
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
  for (const name of ["Treści edukacyjne", "Kod startowy", "Przypadki testowe", "Podpowiedzi", "Ustawienia wykonania", "Gotowość zadania", "Publikacja"])
    expect(screen.getByRole("region", { name: `${name} — placeholder` })).toBeTruthy();
  expect((screen.getByLabelText("Krótka teoria") as HTMLTextAreaElement).disabled).toBe(true);
  expect((screen.getByLabelText("Treść zadania") as HTMLTextAreaElement).disabled).toBe(true);
  expect(screen.queryByRole("button", { name: "Archiwizuj zadanie" })).toBeNull();
  for (const name of ["Podgląd", "Dodaj przypadek testowy", "Dodaj podpowiedź", "Edytuj limity", "Wyślij do recenzji publicznej"])
    expect((screen.getByRole("button", { name }) as HTMLButtonElement).disabled).toBe(true);
  for (const button of screen.getAllByRole("button", { name: "Przetestuj zadanie" })) {
    expect((button as HTMLButtonElement).disabled).toBe(true); fireEvent.click(button);
  }
  expect(apiFetch).not.toHaveBeenCalled();
  expect(screen.getAllByText("Publiczny")).toHaveLength(2);
  expect(screen.getAllByText("Ukryty")).toHaveLength(2);
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  await screen.findByText("Lista zadań");
  const payload = JSON.parse(vi.mocked(apiFetch).mock.calls[0][1]!.body as string);
  expect(Object.keys(payload).sort()).toEqual(["description", "difficulty", "estimated_time_minutes", "status", "task_type", "title", "topic"]);
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
