import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { Task } from "../api/tasks";
import TeacherTasksPage from "./TeacherTasksPage";

const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));

const task: Task = {
  id: 7, title: "Suma liczb dodatnich", description: "Oblicz sumę.", topic: "Pętle",
  difficulty: "EASY", task_type: "STANDARD", status: "DRAFT", estimated_time_minutes: 15,
  is_archived: false, author_id: 1, created_at: "2026-10-16T10:00:00Z", updated_at: "2026-10-16T10:00:00Z",
};

function params(path: string) { return new URL(path, "http://localhost").searchParams; }
function response(path: string, total = 51, items = [task]) {
  const query = params(path);
  return Response.json({ items, total, limit: Number(query.get("limit")), offset: Number(query.get("offset")) });
}
function listRequests() {
  return vi.mocked(apiFetch).mock.calls.map(([path]) => params(path)).filter(query => query.get("limit") === "25");
}
function Location() { return <output aria-label="Adres">{useLocation().pathname}</output>; }
function renderPage() {
  return render(<MemoryRouter initialEntries={["/teacher/tasks"]}><Location /><Routes>
    <Route path="/teacher/tasks" element={<TeacherTasksPage />} />
    <Route path="/teacher/tasks/new" element={<p>Nowe zadanie</p>} />
    <Route path="/teacher/tasks/:taskId/edit" element={<p>Edycja zadania</p>} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation(async path => response(path));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("shows loading until the list arrives", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(apiFetch).mockImplementation(path => params(path).get("limit") === "1"
    ? Promise.resolve(response(path)) : new Promise(done => { resolve = done; }));
  renderPage();
  expect(within(screen.getByRole("region", { name: "Lista zadań" })).getByRole("status").textContent).toBe("Ładowanie zadań…");
  await act(async () => { resolve(response("/teacher/tasks?limit=25&offset=0")); });
  expect(await screen.findByRole("table")).toBeTruthy();
});

it("shows the empty state for a teacher without tasks and zero counters", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => response(path, 0, []));
  renderPage();
  expect(await screen.findByText("Nie masz jeszcze żadnych zadań")).toBeTruthy();
  expect(screen.queryByRole("table")).toBeNull();
  expect(screen.getByRole("link", { name: "Utwórz zadanie" })).toBeTruthy();
  await waitFor(() => expect(screen.getAllByText("0")).toHaveLength(2));
});

it("distinguishes no matching results and lets the teacher clear filters", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => params(path).get("status") === "READY"
    ? response(path, 0, []) : response(path));
  renderPage();
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "READY" } });
  expect(await screen.findByText("Brak pasujących zadań")).toBeTruthy();
  expect(screen.queryByText("Nie masz jeszcze żadnych zadań")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Wyczyść filtry" }));
  expect(await screen.findByRole("table")).toBeTruthy();
  expect((screen.getByLabelText("Status") as HTMLSelectElement).value).toBe("");
});

it.each([
  ["Status", "READY", "status", "READY"],
  ["Poziom trudności", "HARD", "difficulty", "HARD"],
  ["Sortowanie", "title:asc", "sort_by", "title"],
])("resets pagination when changing %s", async (label, value, key, expected) => {
  renderPage();
  await screen.findByRole("table");
  expect((screen.getByRole("button", { name: "Poprzednia" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Następna" }));
  await waitFor(() => expect(listRequests().at(-1)?.get("offset")).toBe("25"));
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await waitFor(() => {
    const query = listRequests().at(-1)!;
    expect(query.get(key)).toBe(expected);
    expect(query.get("offset")).toBe("0");
    if (key === "sort_by") expect(query.get("sort_order")).toBe("asc");
  });
});

it("debounces search and topic, trims values, preserves filters and resets offset", async () => {
  renderPage();
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "DRAFT" } });
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Następna" }));
  await screen.findByRole("table");
  vi.useFakeTimers();
  const count = listRequests().length;
  fireEvent.change(screen.getByLabelText("Szukaj zadania"), { target: { value: "su" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  fireEvent.change(screen.getByLabelText("Szukaj zadania"), { target: { value: " suma " } });
  fireEvent.change(screen.getByLabelText("Temat"), { target: { value: " Pętle " } });
  await act(async () => { await vi.advanceTimersByTimeAsync(299); });
  expect(listRequests()).toHaveLength(count);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(listRequests()).toHaveLength(count + 1);
  const query = listRequests().at(-1)!;
  expect(query.get("q")).toBe("suma");
  expect(query.get("topic")).toBe("Pętle");
  expect(query.get("status")).toBe("DRAFT");
  expect(query.get("offset")).toBe("0");
});

it("shows an API error and recovers after retry", async () => {
  let fail = true;
  vi.mocked(apiFetch).mockImplementation(async path => {
    if (fail && params(path).get("limit") === "25") return Response.json({}, { status: 500 });
    return response(path);
  });
  renderPage();
  const alert = await screen.findByRole("alert");
  expect(alert.textContent).toContain("Nie udało się pobrać zadań");
  expect(auth.retrySession).not.toHaveBeenCalled();
  fail = false;
  fireEvent.click(within(alert).getByRole("button", { name: "Spróbuj ponownie" }));
  expect(await screen.findByRole("table")).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([
  [401, "Sesja wygasła. Zaloguj się ponownie."],
  [403, "Nie masz dostępu do zadań nauczyciela."],
])("refreshes the session and displays the appropriate message for %s", async (status, message) => {
  vi.mocked(apiFetch).mockImplementation(async path => params(path).get("limit") === "25"
    ? Response.json({}, { status }) : response(path));
  renderPage();
  expect((await screen.findByRole("alert")).textContent).toContain(message);
  expect(auth.retrySession).toHaveBeenCalledOnce();
});

it.each([
  ["Utwórz zadanie", "/teacher/tasks/new", "Nowe zadanie"],
  ["Suma liczb dodatnich", "/teacher/tasks/7/edit", "Edycja zadania"],
])("navigates to the form through %s", async (name, path, message) => {
  renderPage();
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("link", { name }));
  expect(screen.getByLabelText("Adres").textContent).toBe(path);
  expect(screen.getByText(message)).toBeTruthy();

});

it("keeps total and draft counters unchanged when filtering the list", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => {
    const query = params(path);
    return response(path, query.get("limit") === "1" ? query.get("status") === "DRAFT" ? 8 : 51 : 1);
  });
  renderPage();
  await screen.findByRole("table");
  const metrics = screen.getByRole("region", { name: "Statystyki zadań" });
  await waitFor(() => {
    expect(within(metrics).getByText("51")).toBeTruthy();
    expect(within(metrics).getByText("8")).toBeTruthy();
  });
  fireEvent.change(screen.getByLabelText("Status"), { target: { value: "READY" } });
  await screen.findByRole("table");
  expect(within(metrics).getByText("51")).toBeTruthy();
  expect(within(metrics).getByText("8")).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.filter(([path]) => params(path).get("limit") === "1")).toHaveLength(3);
});

it("archives from the row menu and refreshes the list and metrics", async () => {
  let archived = false;
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === "PATCH") { archived = true; return Response.json({ ...task, is_archived: true }); }
    const query = params(path);
    return response(path, query.get("archived") === "true" ? archived ? 1 : 0 : 1, [{ ...task, is_archived: archived }]);
  });
  renderPage(); await screen.findByRole("table");
  expect(screen.queryByRole("button", { name: "Archiwizuj" })).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: `Więcej akcji: ${task.title}` }));
  fireEvent.click(screen.getByRole("button", { name: "Archiwizuj" }));
  await screen.findByRole("button", { name: "Przywróć" });
  expect(screen.getByText("Tylko do odczytu")).toBeTruthy();
  expect(screen.queryByRole("link", { name: `Otwórz zadanie: ${task.title}` })).toBeNull();
  expect(apiFetch).toHaveBeenCalledWith("/teacher/tasks/7/archive", expect.objectContaining({ method: "PATCH" }));
  expect(screen.getByRole("button", { name: "Wszystkie" }).getAttribute("aria-pressed")).toBe("true");
  await screen.findByText("0 aktywnych · 1 zarchiwizowanych");
});

it("filters archives, restores and removes the row from archives, then shows it in all tasks", async () => {
  let archived = true;
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === "PATCH") { archived = false; return Response.json({ ...task, is_archived: false }); }
    const matching = params(path).get("archived") !== "true" || archived;
    return response(path, matching ? 1 : 0, matching ? [{ ...task, is_archived: archived }] : []);
  });
  renderPage(); await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: "Zarchiwizowane" }));
  await waitFor(() => expect(listRequests().at(-1)?.get("archived")).toBe("true"));
  fireEvent.click(await screen.findByRole("button", { name: "Przywróć" }));
  await screen.findByText("Brak pasujących zadań");
  expect(apiFetch).toHaveBeenCalledWith("/teacher/tasks/7/restore", expect.objectContaining({ method: "PATCH" }));
  fireEvent.click(screen.getByRole("button", { name: "Wszystkie" }));
  await screen.findByRole("table");
  expect(listRequests().at(-1)?.has("archived")).toBe(false);
  expect(screen.getByRole("link", { name: `Otwórz zadanie: ${task.title}` })).toBeTruthy();
});

it("blocks duplicate archive requests and preserves the row after failure for retry", async () => {
  let finish!: (value: Response) => void;
  vi.mocked(apiFetch).mockImplementation((path, options) => options?.method === "PATCH"
    ? new Promise(done => { finish = done; }) : Promise.resolve(response(path)));
  renderPage(); await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: `Więcej akcji: ${task.title}` }));
  fireEvent.click(screen.getByRole("button", { name: "Archiwizuj" }));
  expect((screen.getByRole("button", { name: `Więcej akcji: ${task.title}` }) as HTMLButtonElement).disabled).toBe(true);
  expect(vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(1);
  await act(async () => finish(Response.json({}, { status: 500 })));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("link", { name: `Otwórz zadanie: ${task.title}` })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: `Więcej akcji: ${task.title}` }));
  expect(screen.getByRole("button", { name: "Archiwizuj" })).toBeTruthy();
});

it("keeps the draft metric and tab consistent when a draft is archived", async () => {
  let archived = false;
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === "PATCH") { archived = true; return Response.json({ ...task, is_archived: true }); }
    const query = params(path);
    const matching = (query.get("archived") !== "false" || !archived) && (query.get("archived") !== "true" || archived);
    return response(path, matching ? 1 : 0, matching ? [{ ...task, is_archived: archived }] : []);
  });
  renderPage(); await screen.findByRole("table");
  const metric = screen.getByRole("heading", { name: "Wersje robocze" }).closest("article")!;
  await waitFor(() => expect(within(metric).getByText("1")).toBeTruthy());
  fireEvent.click(screen.getByRole("button", { name: "Wersje robocze" }));
  await screen.findByRole("table");
  fireEvent.click(screen.getByRole("button", { name: `Więcej akcji: ${task.title}` }));
  fireEvent.click(screen.getByRole("button", { name: "Archiwizuj" }));
  await screen.findByText("Brak pasujących zadań");
  await waitFor(() => expect(within(metric).getByText("0")).toBeTruthy());
  const draftCounts = vi.mocked(apiFetch).mock.calls.map(([path]) => params(path))
    .filter(query => query.get("limit") === "1" && query.get("status") === "DRAFT");
  expect(draftCounts.length).toBeGreaterThan(0);
  expect(draftCounts.every(query => query.get("archived") === "false")).toBe(true);
  fireEvent.click(screen.getByRole("button", { name: "Wszystkie" }));
  await screen.findByRole("table");
  expect(screen.getByText("Tylko do odczytu")).toBeTruthy();
  await screen.findByText("0 aktywnych · 1 zarchiwizowanych");
});
