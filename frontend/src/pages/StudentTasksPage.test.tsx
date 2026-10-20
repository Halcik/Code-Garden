import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiFetch } from "../api/client";
import StudentTasksPage from "./StudentTasksPage";
import StudentTaskPage from "./StudentTaskPage";

vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession }) }));
const retrySession = vi.fn();
const task = { id: 7, title: "Suma liczb", description: "Oblicz sumę", topic: "Listy", difficulty: "EASY", task_type: "STANDARD", estimated_time_minutes: 15 };
function mount() { return render(<MemoryRouter initialEntries={["/student/tasks"]}><Routes><Route path="/student/tasks" element={<StudentTasksPage />} /><Route path="/student/tasks/:taskId" element={<StudentTaskPage />} /></Routes></MemoryRouter>); }
function query(path: string) { return new URL(path, "http://localhost").searchParams; }
function requests() { return vi.mocked(apiFetch).mock.calls.map(([path]) => query(path)); }
function page(path: string, total = 49, items = [task]) {
  const params = query(path);
  return Response.json({ items, total, limit: Number(params.get("limit")), offset: Number(params.get("offset")) });
}
function deferredResponse() {
  let resolve!: (value: Response) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<Response>((done, fail) => { resolve = done; reject = fail; });
  return { promise, resolve, reject };
}
async function loaded() { await screen.findByRole("link", { name: task.title }); }
async function nextPage() {
  fireEvent.click(screen.getByRole("button", { name: "Następna" }));
  await loaded();
}
function assignedSection() { return screen.queryByRole("region", { name: "Zadania przypisane przez nauczyciela" }); }

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation(async path => page(path));
});
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("uses the student API and opens task details from a catalog card", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => path.startsWith("/student/tasks?")
    ? page(path, 1) : new Response(null, { status: 404 }));
  mount();
  expect(screen.getByRole("status").textContent).toContain("Ładowanie");
  fireEvent.click(await screen.findByRole("link", { name: "Suma liczb" }));
  expect(await screen.findByRole("heading", { name: "Zadanie niedostępne" })).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls[0][0]).toMatch(/^\/student\/tasks\?/);
  expect(vi.mocked(apiFetch).mock.calls[1][0]).toBe("/student/tasks/7");
});

it("sends search, filters and sort to the backend and handles empty results", async () => {
  vi.mocked(apiFetch).mockImplementation(async () => Response.json({ items: [], total: 0, limit: 24, offset: 0 }));
  mount();
  await screen.findByText("Brak zadań");
  fireEvent.change(screen.getByLabelText("Wyszukaj"), { target: { value: "lista" } });
  fireEvent.change(screen.getByLabelText("Temat"), { target: { value: "Listy" } });
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "EASY" } });
  fireEvent.change(screen.getByLabelText("Typ"), { target: { value: "FUNCTION" } });
  fireEvent.change(screen.getByLabelText(/Sortuj według/), { target: { value: "title:asc" } });
  await waitFor(() => {
    const params = new URL(vi.mocked(apiFetch).mock.calls.at(-1)![0], "http://localhost").searchParams;
    expect(Object.fromEntries(params)).toMatchObject({ search: "lista", topic: "Listy", difficulty: "EASY", task_type: "FUNCTION", sort_by: "title", sort_order: "asc", offset: "0" });
  });
});

it("shows API errors and allows retry", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 500 })).mockImplementation(async () => Response.json({ items: [task], total: 1, limit: 24, offset: 0 }));
  mount();
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByText("Spróbuj ponownie"));
  expect(await screen.findByRole("link", { name: task.title })).toBeTruthy();
});

it("debounces both text fields, trims them, preserves other filters and resets pagination", async () => {
  mount(); await loaded();
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "HARD" } });
  await loaded(); await nextPage();
  expect(requests().at(-1)?.get("offset")).toBe("24");
  vi.useFakeTimers();
  const count = requests().length;
  fireEvent.change(screen.getByLabelText("Wyszukaj"), { target: { value: "su" } });
  await act(async () => { await vi.advanceTimersByTimeAsync(200); });
  fireEvent.change(screen.getByLabelText("Wyszukaj"), { target: { value: " suma " } });
  fireEvent.change(screen.getByLabelText("Temat"), { target: { value: " Listy " } });
  await act(async () => { await vi.advanceTimersByTimeAsync(299); });
  expect(requests()).toHaveLength(count);
  await act(async () => { await vi.advanceTimersByTimeAsync(1); });
  expect(requests()).toHaveLength(count + 1);
  expect(Object.fromEntries(requests().at(-1)!)).toMatchObject({ search: "suma", topic: "Listy", difficulty: "HARD", offset: "0" });
  expect(screen.getByRole("button", { name: "Poprzednia" }).hasAttribute("disabled")).toBe(true);
});

it.each([
  ["Trudność", "EASY", { difficulty: "EASY" }],
  ["Typ", "FUNCTION", { task_type: "FUNCTION" }],
  [/Sortuj według/, "title:asc", { sort_by: "title", sort_order: "asc" }],
])("resets offset when changing %s", async (label, value, expected) => {
  mount(); await loaded(); await nextPage();
  expect(requests().at(-1)?.get("offset")).toBe("24");
  fireEvent.change(screen.getByLabelText(label), { target: { value } });
  await loaded();
  expect(Object.fromEntries(requests().at(-1)!)).toMatchObject({ ...expected, offset: "0" });
});

it("navigates forwards and backwards and disables pagination at both boundaries", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => page(path, 49, Array.from(
    { length: Number(query(path).get("offset")) === 48 ? 1 : 24 },
    (_, index) => ({ ...task, id: Number(query(path).get("offset")) + index, title: `Zadanie ${Number(query(path).get("offset")) + index + 1}` }),
  )));
  mount(); await screen.findByText("1–24 z 49");
  const previous = () => screen.getByRole("button", { name: "Poprzednia" }) as HTMLButtonElement;
  const next = () => screen.getByRole("button", { name: "Następna" }) as HTMLButtonElement;
  expect(previous().disabled).toBe(true); expect(next().disabled).toBe(false);
  fireEvent.click(previous()); expect(requests()).toHaveLength(1);
  fireEvent.click(next()); await screen.findByText("25–48 z 49");
  expect(previous().disabled).toBe(false); expect(next().disabled).toBe(false);
  expect(screen.queryByRole("link", { name: "Zadanie 1" })).toBeNull();
  fireEvent.click(next()); await screen.findByText("49–49 z 49");
  expect(next().disabled).toBe(true);
  fireEvent.click(next()); expect(requests()).toHaveLength(3);
  fireEvent.click(previous()); await screen.findByText("25–48 z 49");
  fireEvent.click(previous()); await screen.findByText("1–24 z 49");
  expect(previous().disabled).toBe(true);
  expect(requests().map(params => params.get("offset"))).toEqual(["0", "24", "48", "24", "0"]);
});

it.each([[25, 24], [1, 0]])("corrects an out-of-range offset after total shrinks to %s", async (total, expectedOffset) => {
  let shrunk = false;
  vi.mocked(apiFetch).mockImplementation(async path => {
    const offset = Number(query(path).get("offset"));
    if (offset === 48) shrunk = true;
    return page(path, shrunk ? total : 49, shrunk && offset >= total ? [] : [task]);
  });
  mount(); await loaded(); await nextPage(); await nextPage();
  await waitFor(() => expect(requests().map(params => params.get("offset"))).toEqual(["0", "24", "48", String(expectedOffset)]));
  await loaded();
  expect(screen.getByText(`${expectedOffset + 1}–${expectedOffset + 1} z ${total}`)).toBeTruthy();
  expect(screen.queryByText("Brak zadań")).toBeNull();
  expect((screen.getByRole("button", { name: "Następna" }) as HTMLButtonElement).disabled).toBe(true);
});

it.each([
  [401, "Sesja wygasła. Zaloguj się ponownie."],
  [403, "Katalog jest dostępny tylko dla uczniów."],
])("refreshes the session on HTTP %s", async (status, message) => {
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status }));
  mount();
  expect((await screen.findByRole("alert")).textContent).toContain(message);
  expect(retrySession).toHaveBeenCalledOnce();
  expect(screen.queryByRole("link", { name: task.title })).toBeNull();
});

it("aborts superseded requests and ignores stale success without ending current loading", async () => {
  const stale = deferredResponse(), current = deferredResponse();
  vi.mocked(apiFetch).mockReturnValueOnce(stale.promise).mockReturnValueOnce(current.promise);
  mount();
  const staleSignal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "HARD" } });
  expect(staleSignal?.aborted).toBe(true);
  expect(vi.mocked(apiFetch).mock.calls[1][1]?.signal?.aborted).toBe(false);
  await act(async () => { stale.resolve(page("/student/tasks?limit=24&offset=48", 1, [{ ...task, title: "Stary wynik" }])); });
  expect(screen.queryByText("Stary wynik")).toBeNull();
  expect(screen.getByRole("status").textContent).toContain("Ładowanie");
  expect(requests()).toHaveLength(2);
  await act(async () => { current.resolve(page("/student/tasks?limit=24&offset=0", 1)); });
  await loaded();
  expect(screen.queryByRole("status")).toBeNull();
  expect(screen.queryByRole("alert")).toBeNull();
});

it.each([401, 403, "network"])("ignores stale %s errors after a newer response", async status => {
  const stale = deferredResponse();
  vi.mocked(apiFetch).mockReturnValueOnce(stale.promise).mockImplementation(async path => page(path, 1));
  mount();
  fireEvent.change(screen.getByLabelText("Typ"), { target: { value: "FUNCTION" } });
  await loaded();
  await act(async () => {
    if (status === "network") stale.reject(new Error("Stary błąd sieci"));
    else stale.resolve(new Response(null, { status: Number(status) }));
  });
  expect(screen.getByRole("link", { name: task.title })).toBeTruthy();
  expect(screen.queryByRole("alert")).toBeNull();
  expect(retrySession).not.toHaveBeenCalled();
  expect(requests()).toHaveLength(2);
});

it("does not replace newer cards and counters with a late successful response", async () => {
  const stale = deferredResponse();
  vi.mocked(apiFetch).mockReturnValueOnce(stale.promise).mockImplementation(async path => page(path, 1));
  mount();
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "HARD" } });
  await loaded();
  await act(async () => { stale.resolve(page("/student/tasks?limit=24&offset=0", 99, [{ ...task, title: "Stary wynik" }])); });
  expect(screen.getByRole("link", { name: task.title })).toBeTruthy();
  expect(screen.queryByText("Stary wynik")).toBeNull();
  expect(screen.getByRole("button", { name: "Wszystkie 1" })).toBeTruthy();
  expect(requests()).toHaveLength(2);
});

it("retries a failed filtered page with the same query and without refreshing the session", async () => {
  let fail = true;
  vi.mocked(apiFetch).mockImplementation(async path => query(path).get("offset") === "24" && fail
    ? new Response(null, { status: 500 }) : page(path));
  mount(); await loaded();
  fireEvent.change(screen.getByLabelText("Typ"), { target: { value: "FUNCTION" } });
  await loaded();
  fireEvent.click(screen.getByRole("button", { name: "Następna" }));
  await screen.findByRole("alert");
  const failedQuery = requests().at(-1)!.toString();
  expect(retrySession).not.toHaveBeenCalled();
  fail = false;
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  await loaded();
  expect(requests().at(-1)!.toString()).toBe(failedQuery);
  expect(requests().at(-1)?.get("task_type")).toBe("FUNCTION");
  expect(requests().at(-1)?.get("offset")).toBe("24");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(retrySession).not.toHaveBeenCalled();
});

it("aborts the active request on unmount", async () => {
  const pending = deferredResponse();
  vi.mocked(apiFetch).mockReturnValueOnce(pending.promise);
  const { unmount } = mount();
  const signal = vi.mocked(apiFetch).mock.calls[0][1]?.signal;
  expect(signal?.aborted).toBe(false);
  unmount(); expect(signal?.aborted).toBe(true);
  await act(async () => { pending.reject(new Error("Cancelled")); });
  expect(retrySession).not.toHaveBeenCalled();
});

it("switches all/assigned/catalog sections without refetching or losing filters", async () => {
  mount(); await loaded();
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "HARD" } });
  await loaded();
  const count = requests().length;
  const tabs = within(screen.getByRole("group", { name: "Widok zadań" }));
  expect(tabs.getByRole("button", { name: /^Wszystkie/ }).getAttribute("aria-pressed")).toBe("true");
  expect(assignedSection()).toBeTruthy();
  fireEvent.click(tabs.getByRole("button", { name: "Przypisane" }));
  expect(assignedSection()).toBeTruthy();
  expect(screen.queryByRole("region", { name: "Katalog zadań" })).toBeNull();
  expect(screen.queryByRole("search")).toBeNull();
  expect(tabs.getByRole("button", { name: "Przypisane" }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(tabs.getByRole("button", { name: /^Z katalogu/ }));
  expect(assignedSection()).toBeNull();
  expect(screen.getByRole("link", { name: task.title })).toBeTruthy();
  expect((screen.getByLabelText("Trudność") as HTMLSelectElement).value).toBe("HARD");
  expect(tabs.getByRole("button", { name: /^Z katalogu/ }).getAttribute("aria-pressed")).toBe("true");
  fireEvent.click(tabs.getByRole("button", { name: /^Wszystkie/ }));
  expect(assignedSection()).toBeTruthy();
  expect(screen.getByRole("region", { name: "Katalog zadań" })).toBeTruthy();
  expect(requests()).toHaveLength(count);
});

it("clears all filters, sort and offset while keeping the assigned section", async () => {
  mount(); await loaded();
  fireEvent.change(screen.getByLabelText("Wyszukaj"), { target: { value: " suma " } });
  fireEvent.change(screen.getByLabelText("Temat"), { target: { value: " Listy " } });
  await waitFor(() => expect(requests().at(-1)?.get("search")).toBe("suma"));
  await loaded();
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "HARD" } });
  await loaded();
  fireEvent.change(screen.getByLabelText("Typ"), { target: { value: "FUNCTION" } });
  await loaded();
  fireEvent.change(screen.getByLabelText(/Sortuj według/), { target: { value: "title:asc" } });
  await loaded(); await nextPage();
  fireEvent.click(screen.getByRole("button", { name: "Wyczyść filtry" }));
  await loaded();
  expect(Object.fromEntries(requests().at(-1)!)).toEqual({ limit: "24", sort_by: "created_at", sort_order: "desc", offset: "0" });
  for (const label of ["Wyszukaj", "Temat", "Trudność", "Typ"]) expect((screen.getByLabelText(label) as HTMLInputElement).value).toBe("");
  expect((screen.getByLabelText(/Sortuj według/) as HTMLSelectElement).value).toBe("created_at:desc");
  expect(assignedSection()).toBeTruthy();
  const count = requests().length;
  vi.useFakeTimers();
  await act(async () => { await vi.advanceTimersByTimeAsync(300); });
  expect(requests()).toHaveLength(count);
});

it("keeps assigned information visible for no results and recovers through empty-state reset", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => query(path).has("difficulty") ? page(path, 0, []) : page(path, 1));
  mount(); await loaded();
  fireEvent.change(screen.getByLabelText("Trudność"), { target: { value: "HARD" } });
  await screen.findByText("Brak zadań");
  expect(assignedSection()).toBeTruthy();
  fireEvent.click(within(screen.getByRole("region", { name: "Katalog zadań" })).getByRole("button", { name: "Wyczyść filtry" }));
  await loaded();
  expect(requests().at(-1)?.has("difficulty")).toBe(false);
  expect(assignedSection()).toBeTruthy();
});

it("keeps all progress placeholders disabled and leaves the current view unchanged", async () => {
  mount(); await loaded();
  const tabs = within(screen.getByRole("group", { name: "Widok zadań" }));
  const count = requests().length;
  for (const name of ["Nierozpoczęte", "W toku", "Ukończone", "Po terminie"]) {
    const button = tabs.getByRole("button", { name }) as HTMLButtonElement;
    expect(button.disabled).toBe(true);
    expect(document.getElementById(button.getAttribute("aria-describedby")!)?.textContent).toContain("będą dostępne wkrótce");
    fireEvent.click(button);
  }
  expect(tabs.getByRole("button", { name: /^Wszystkie/ }).getAttribute("aria-pressed")).toBe("true");
  expect(assignedSection()).toBeTruthy();
  expect(screen.getByRole("link", { name: task.title })).toBeTruthy();
  expect(requests()).toHaveLength(count);
});
