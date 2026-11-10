import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiFetch } from "../api/client";
import type { Group } from "../api/groups";
import TeacherGroupsPage from "./TeacherGroupsPage";
import { getInvitationCode, listGroupMembers } from "../api/groupInvitations";

const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../theme/ThemeProvider", () => ({ useTheme: () => ({ theme: "light" }) }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../api/groupInvitations", async importOriginal => ({
  ...await importOriginal<typeof import("../api/groupInvitations")>(), listGroupMembers: vi.fn(), getInvitationCode: vi.fn(),
}));

const group: Group = { id: 7, name: "Podstawy Pythona", description: "Pierwsze kroki", teacher_id: 1, created_at: "2026-11-08T10:00:00Z",
  age_range: null, achievements_enabled: true, study_streak_enabled: false, student_count: 0, pending_invitation_count: 0 };

function renderPage(path = "/teacher/groups") {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/teacher/groups" element={<TeacherGroupsPage />} />
    <Route path="/teacher/groups/:groupId" element={<TeacherGroupsPage />} />
  </Routes></MemoryRouter>);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listGroupMembers).mockResolvedValue([]);
  vi.mocked(getInvitationCode).mockResolvedValue(null);
  vi.mocked(apiFetch).mockImplementation(async path => Response.json(path === "/teacher/groups" ? [group] : group));
});
afterEach(cleanup);

it("shows the total active tasks across groups and preserves it when filtering cards", async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json([
    { ...group, active_task_count: 2 },
    { ...group, id: 8, name: "Algorytmy", active_task_count: 3 },
  ]));
  renderPage();
  await screen.findByRole("heading", { name: group.name });
  const metric = screen.getByRole("heading", { name: "Aktywne zadania" }).closest("article")!;
  expect(within(metric).getByText("5")).toBeTruthy();
  expect(within(metric).queryByText("Statystyki zadań wkrótce")).toBeNull();
  fireEvent.change(screen.getByRole("searchbox", { name: "Szukaj grupy" }), { target: { value: "Algorytmy" } });
  expect(within(metric).getByText("5")).toBeTruthy();
});

it.each([0, 4])("shows %s in the active tasks metric instead of a placeholder", async count => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ ...group, active_task_count: count }));
  renderPage("/teacher/groups/7");
  const heading = await screen.findByRole("heading", { name: "Aktywne zadania" });
  expect(within(heading.closest("article")!).getByText(String(count))).toBeTruthy();
  expect(within(heading.closest("article")!).queryByText("Statystyki zadań wkrótce")).toBeNull();
  expect(screen.getByRole("button", { name: "Zadania" })).toBeTruthy();
});

it.each(["/teacher/groups", "/teacher/groups/7"])("assigns a task through the group button at %s", async path => {
  vi.mocked(apiFetch).mockImplementation(async (url, options) => {
    if (url.endsWith("/task-assignments")) return Response.json([]);
    if (url.startsWith("/teacher/tasks?")) return Response.json({ items: [{ id: 15, title: "Pętle" }], total: 1, limit: 25, offset: 0 });
    if (url === "/teacher/tasks/15/group-assignments") {
      expect(JSON.parse(options!.body as string)).toEqual({ group_id: 7 });
      return Response.json({ total_students: 12, assigned_count: 10, already_assigned_count: 2 });
    }
    return Response.json(url === "/teacher/groups" ? [{ ...group, student_count: 12 }] : { ...group, student_count: 12 });
  });
  renderPage(path);
  fireEvent.click(await screen.findByRole("button", { name: "Przypisz zadanie" }));
  const dialog = within(screen.getByRole("dialog", { name: "Przypisz zadanie grupie" }));
  expect(dialog.getByText(/Liczba uczniów: 12/)).toBeTruthy();
  await dialog.findByRole("radio", { name: "Pętle" });
  const request = vi.mocked(apiFetch).mock.calls.find(([url]) => url.startsWith("/teacher/tasks?"))![0];
  expect(new URL(request, "http://localhost").searchParams.get("status")).toBe("READY");
  expect(new URL(request, "http://localhost").searchParams.get("archived")).toBe("false");
  fireEvent.click(dialog.getByRole("radio", { name: "Pętle" }));
  fireEvent.click(dialog.getByRole("button", { name: "Przypisz grupie" }));
  expect(await dialog.findByText("Nowe przypisania: 10. Już przypisane: 2. Uczniów w grupie: 12.")).toBeTruthy();
  fireEvent.click(dialog.getByRole("button", { name: "Zamknij" }));
  expect(screen.queryByRole("dialog")).toBeNull();
  if (path.endsWith("/7")) {
    expect(await screen.findByRole("region", { name: "Zadania przypisane grupie" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Zadania" }).getAttribute("aria-pressed")).toBe("true");
  }
});

it("opens the assigned task list from the group tasks tab", async () => {
  vi.mocked(apiFetch).mockImplementation(async url => Response.json(url.endsWith("/task-assignments")
    ? [{ task_id: 15, title: "Warunki", topic: "Python", difficulty: "EASY", is_archived: false, student_count: 3, created_at: "2026-11-09T10:00:00Z" }]
    : group));
  renderPage("/teacher/groups/7");
  fireEvent.click(await screen.findByRole("button", { name: "Zadania" }));
  expect(await screen.findByRole("heading", { name: "Warunki" })).toBeTruthy();
  expect(screen.getByRole("button", { name: "Usuń przypisanie: Warunki" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Uczniowie" }));
  expect(await screen.findByRole("table", { name: "Uczniowie grupy" })).toBeTruthy();
});

it("shows the group detail layout and omits the excluded analysis and motivation panels", async () => {
  renderPage("/teacher/groups/7");
  expect(await screen.findByRole("heading", { name: group.name, level: 1 })).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Statystyki grupy" })).getAllByRole("article")).toHaveLength(4);
  expect(screen.getByRole("table", { name: "Uczniowie grupy" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Status zadania" })).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Zarządzanie grupą" })).toBeTruthy();
  expect(screen.queryByText("Postęp według tematów")).toBeNull();
  expect(screen.queryByText("Najczęstsze błędy")).toBeNull();
  expect(screen.queryByText("Ustawienia motywacyjne")).toBeNull();
  expect(screen.queryByRole("button", { name: "Zaproś uczniów" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Więcej" })).toBeNull();
  expect((screen.getByRole("button", { name: "Przypisz zadanie" }) as HTMLButtonElement).disabled).toBe(false);
});

it("opens settings through group editing without a separate settings tab", async () => {
  renderPage("/teacher/groups/7");
  fireEvent.click(await screen.findByRole("button", { name: "Edytuj grupę" }));
  expect(screen.queryByRole("button", { name: "Ustawienia" })).toBeNull();
  expect(screen.getByRole("dialog", { name: "Edytuj grupę" })).toBeTruthy();
  expect((screen.getByLabelText("Nazwa grupy") as HTMLInputElement).value).toBe(group.name);
  expect(screen.getByText("Domyślne ustawienia motywacyjne")).toBeTruthy();
});

it("searches names and descriptions without changing the total group count", async () => {
  const other = { ...group, id: 8, name: "Algorytmy", description: "Pętle i warunki" };
  vi.mocked(apiFetch).mockResolvedValue(Response.json([group, other]));
  renderPage();
  await screen.findByRole("heading", { name: group.name });
  const input = screen.getByRole("searchbox", { name: "Szukaj grupy" });
  fireEvent.change(input, { target: { value: " PODSTAWY " } });
  expect(screen.getByRole("heading", { name: group.name })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: other.name })).toBeNull();
  fireEvent.change(input, { target: { value: "warunki" } });
  expect(screen.getByRole("heading", { name: other.name })).toBeTruthy();
  expect(screen.queryByRole("heading", { name: group.name })).toBeNull();
  fireEvent.change(input, { target: { value: "nieistniejąca" } });
  expect(screen.getByText("Brak pasujących grup")).toBeTruthy();
  expect(within(screen.getByRole("region", { name: "Statystyki grup" })).getByText("2")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Wyczyść wyszukiwanie" }));
  expect(within(screen.getByRole("region", { name: "Lista grup" })).getAllByRole("article")).toHaveLength(2);
});

it("shows the actual member count and disabled future actions on each card", async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json([{ ...group, student_count: 12 }]));
  renderPage();
  const list = await screen.findByRole("region", { name: "Lista grup" });
  expect(within(list).getByText(/Liczba uczniów: 12 · Przypisane zadania:/)).toBeTruthy();
  expect(within(list).getByText("Średni poziom ukończenia")).toBeTruthy();
  expect(within(list).getByText("Oczekujące zaproszenia")).toBeTruthy();
  expect((within(list).getByRole("button", { name: "Zaproś" }) as HTMLButtonElement).disabled).toBe(false);
  expect((within(list).getByRole("button", { name: "Przypisz zadanie" }) as HTMLButtonElement).disabled).toBe(false);
});

it("opens a group by clicking its name", async () => {
  renderPage();
  fireEvent.click(await screen.findByRole("link", { name: group.name }));
  expect(await screen.findByRole("heading", { name: group.name, level: 1 })).toBeTruthy();
  expect(await screen.findByRole("table", { name: "Uczniowie grupy" })).toBeTruthy();
});

it("keeps editing in the details rather than on the list cards", async () => {
  renderPage();
  await screen.findByRole("heading", { name: group.name });
  expect(screen.queryByRole("button", { name: /Edytuj grupę/ })).toBeNull();
  fireEvent.click(screen.getByRole("link", { name: group.name }));
  expect(await screen.findByRole("button", { name: "Edytuj grupę" })).toBeTruthy();
});

it("shows four metric tiles with real group count and unavailable future metrics", async () => {
  renderPage();
  await screen.findByRole("heading", { name: group.name });
  const metrics = screen.getByRole("region", { name: "Statystyki grup" });
  expect(within(metrics).getAllByRole("article")).toHaveLength(4);
  expect(within(metrics).getByText("1")).toBeTruthy();
  expect(within(metrics).getAllByText("—")).toHaveLength(1);
});

it("closes the modal with Escape without saving and restores page scroll", async () => {
  renderPage();
  await screen.findByRole("heading", { name: group.name });
  fireEvent.click(screen.getByRole("button", { name: "Utwórz grupę" }));
  const dialog = screen.getByRole("dialog", { name: "Utwórz grupę" });
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("shows loading then the teacher's groups and opens details", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  renderPage();
  expect(screen.getByRole("status").textContent).toBe("Ładowanie grup…");
  await act(async () => { resolve(Response.json([group])); });
  expect(await screen.findByRole("heading", { name: group.name })).toBeTruthy();
  fireEvent.click(screen.getByRole("link", { name: `Otwórz grupę ${group.name}` }));
  expect(await screen.findByRole("heading", { name: group.name, level: 1 })).toBeTruthy();
  expect(await screen.findByText("Grupa nie ma jeszcze członków.")).toBeTruthy();
});

it("creates a group from an empty list without sending ownership", async () => {
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => options?.method === "POST" ? Response.json(group, { status: 201 }) : Response.json([]));
  renderPage();
  expect(await screen.findByText("Nie masz jeszcze żadnych grup")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Utwórz grupę" }));
  fireEvent.change(screen.getByLabelText("Nazwa grupy"), { target: { value: " Podstawy Pythona " } });
  fireEvent.change(screen.getByLabelText("Opis (opcjonalny)"), { target: { value: " Pierwsze kroki " } });
  fireEvent.change(screen.getByLabelText("Przedział wieku"), { target: { value: " 14–18 lat " } });
  fireEvent.click(screen.getByRole("button", { name: "Seria nauki" }));
  const form = screen.getByRole("dialog", { name: "Utwórz grupę" });
  fireEvent.click(within(form).getByRole("button", { name: "Utwórz grupę" }));
  expect(await screen.findByText("Grupa została utworzona.")).toBeTruthy();
  expect(screen.getByRole("heading", { name: group.name })).toBeTruthy();
  const post = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(JSON.parse(post[1]!.body as string)).toEqual({ name: group.name, description: group.description,
    age_range: "14–18 lat", achievements_enabled: true, study_streak_enabled: true });
});

it("edits name and clears the optional description", async () => {
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => Response.json(options?.method === "PATCH" ? { ...group, name: "Nowa nazwa", description: null } : group));
  renderPage("/teacher/groups/7");
  fireEvent.click(await screen.findByRole("button", { name: "Edytuj grupę" }));
  expect((screen.getByLabelText("Nazwa grupy") as HTMLInputElement).value).toBe(group.name);
  fireEvent.change(screen.getByLabelText("Nazwa grupy"), { target: { value: "Nowa nazwa" } });
  fireEvent.change(screen.getByLabelText("Opis (opcjonalny)"), { target: { value: "" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  expect(await screen.findByText("Zmiany zostały zapisane.")).toBeTruthy();
  expect(screen.getByText("Nowa nazwa")).toBeTruthy();
  expect(screen.getByText("Brak opisu.")).toBeTruthy();
  const patch = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "PATCH")!;
  expect(JSON.parse(patch[1]!.body as string)).toEqual({ name: "Nowa nazwa", description: null,
    age_range: null, achievements_enabled: true, study_streak_enabled: false });
});

it("requires confirmation and handles a 204 deletion before returning to the list", async () => {
  vi.mocked(apiFetch).mockImplementation(async (path, options) => options?.method === "DELETE"
    ? new Response(null, { status: 204 }) : Response.json(path === "/teacher/groups" ? [] : group));
  renderPage("/teacher/groups/7");
  fireEvent.click(await screen.findByRole("button", { name: "Usuń grupę" }));
  expect(screen.getByRole("dialog", { name: "Potwierdzenie usunięcia" })).toBeTruthy();
  expect(document.body.style.overflow).toBe("hidden");
  fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Usuń grupę" }));
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź usunięcie" }));
  expect(await screen.findByText("Nie masz jeszcze żadnych grup")).toBeTruthy();
  expect(screen.getByText("Grupa została usunięta.")).toBeTruthy();
});

it("cancels the deletion modal with Escape without deleting the group", async () => {
  renderPage("/teacher/groups/7");
  fireEvent.click(await screen.findByRole("button", { name: "Usuń grupę" }));
  const dialog = screen.getByRole("dialog", { name: "Potwierdzenie usunięcia" });
  fireEvent(dialog, new Event("cancel", { cancelable: true }));
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(document.body.style.overflow).toBe("");
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
});

it("retains form data and allows retry after a failed save", async () => {
  let failed = true;
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => options?.method === "PATCH"
    ? failed ? new Response(null, { status: 500 }) : Response.json({ ...group, name: "Poprawiona" }) : Response.json(group));
  renderPage("/teacher/groups/7");
  fireEvent.click(await screen.findByRole("button", { name: "Edytuj grupę" }));
  fireEvent.change(screen.getByLabelText("Nazwa grupy"), { target: { value: "Poprawiona" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect((screen.getByLabelText("Nazwa grupy") as HTMLInputElement).value).toBe("Poprawiona");
  failed = false;
  fireEvent.click(screen.getByRole("button", { name: "Zapisz zmiany" }));
  expect(await screen.findByText("Zmiany zostały zapisane.")).toBeTruthy();
});

it.each([401, 403, 404, 500])("handles detail error %s without displaying private data", async status => {
  vi.mocked(apiFetch).mockResolvedValue(new Response(null, { status }));
  renderPage("/teacher/groups/7");
  expect(await screen.findByRole("alert")).toBeTruthy();
  expect(screen.queryByText(group.name)).toBeNull();
  expect(screen.queryByRole("button", { name: "Edytuj grupę" })).toBeNull();
  expect(auth.retrySession).toHaveBeenCalledTimes([401, 403].includes(status) ? 1 : 0);
  vi.mocked(apiFetch).mockResolvedValue(Response.json(group));
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  expect(await screen.findByText(group.name)).toBeTruthy();
});

it("blocks duplicate submissions while a save is pending", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => options?.method === "PATCH"
    ? new Promise(done => { resolve = done; }) : Response.json(group));
  renderPage("/teacher/groups/7");
  fireEvent.click(await screen.findByRole("button", { name: "Edytuj grupę" }));
  const save = screen.getByRole("button", { name: "Zapisz zmiany" });
  fireEvent.click(save); fireEvent.click(save);
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === "PATCH")).toHaveLength(1));
  expect((screen.getByRole("button", { name: "Zapisywanie…" }) as HTMLButtonElement).disabled).toBe(true);
  await act(async () => { resolve(Response.json(group)); });
});
