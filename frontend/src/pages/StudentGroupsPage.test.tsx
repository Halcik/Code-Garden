import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { apiFetch } from "../api/client";
import StudentGroupsPage from "./StudentGroupsPage";

const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const group = { id: 7, name: "Python", description: "Podstawy", age_range: "14–18 lat", teacher_login: "teacher", student_count: 1, created_at: "2026-11-09T10:00:00Z" };
const invitation = { id: 9, group_id: 7, group_name: "Python", teacher_login: "teacher", student_id: 3, student_login: "student", status: "PENDING", created_at: "2026-11-09T10:00:00Z" };
let memberships: typeof group[];
let pendingInvitations: typeof invitation[];
function renderPage(path = "/student/groups") {
  return render(<MemoryRouter initialEntries={[path]}><Routes>
    <Route path="/student/groups" element={<StudentGroupsPage />} />
    <Route path="/student/groups/:groupId" element={<StudentGroupsPage />} />
  </Routes></MemoryRouter>);
}
function read(path: string) {
  return Response.json(path.startsWith("/student/tasks?") ? { total: 86, items: [] }
    : path === "/student/group-invitations" ? pendingInvitations
    : path === "/student/groups" ? memberships : group);
}
beforeEach(() => {
  vi.resetAllMocks(); memberships = []; pendingInvitations = [];
  vi.mocked(apiFetch).mockImplementation(async path => read(path));
});
afterEach(cleanup);

it("shows empty memberships, independent catalog access and join form without joining automatically", async () => {
  renderPage();
  expect(await screen.findByText("Nie należysz jeszcze do żadnej grupy")).toBeTruthy();
  expect(await screen.findByRole("link", { name: "86 zadań" })).toBeTruthy();
  expect(screen.getByLabelText("Kod grupy")).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("accepts an invitation and reloads the membership list", async () => {
  pendingInvitations = [invitation];
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === "POST") { memberships = [group]; pendingInvitations = []; return new Response(null, { status: 204 }); }
    return read(path);
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Zaakceptuj zaproszenie" }));
  expect(await screen.findByText("Zaproszenie zostało zaakceptowane. Dołączono do grupy.")).toBeTruthy();
  expect(await screen.findByRole("link", { name: "Otwórz grupę Python" })).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Zaakceptuj zaproszenie" })).toBeNull();
  expect(vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")?.[0]).toBe("/student/group-invitations/9/accept");
});

it("rejects an invitation without gaining membership", async () => {
  pendingInvitations = [invitation];
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === "POST") { pendingInvitations = []; return new Response(null, { status: 204 }); }
    return read(path);
  });
  renderPage();
  fireEvent.click(await screen.findByRole("button", { name: "Odrzuć" }));
  expect(await screen.findByText("Zaproszenie zostało odrzucone.")).toBeTruthy();
  expect(await screen.findByText("Nie należysz jeszcze do żadnej grupy")).toBeTruthy();
});

it("joins by code and displays the new membership", async () => {
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === "POST") { memberships = [group]; return Response.json(group); }
    return read(path);
  });
  renderPage();
  fireEvent.change(await screen.findByLabelText("Kod grupy"), { target: { value: " secret-code " } });
  fireEvent.click(screen.getByRole("button", { name: "Dołącz do grupy" }));
  expect(await screen.findByText("Dołączono do grupy.")).toBeTruthy();
  expect(await screen.findByRole("link", { name: "Python" })).toBeTruthy();
  const post = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(post[0]).toBe("/student/groups/join");
  expect(JSON.parse(post[1]!.body as string)).toEqual({ code: "secret-code" });
});

it.each([
  [404, "Invalid invitation code", "Nieprawidłowy kod zaproszenia."],
  [410, "Invitation code expired", "Kod zaproszenia wygasł."],
  [409, "Student already belongs to this group", "Uczeń już należy do tej grupy."],
])("shows code error %s and preserves the entered code", async (status, detail, expected) => {
  vi.mocked(apiFetch).mockImplementation(async (path, options) => options?.method === "POST" ? Response.json({ detail }, { status: status as number }) : read(path));
  renderPage();
  fireEvent.change(await screen.findByLabelText("Kod grupy"), { target: { value: "entered-code" } });
  fireEvent.click(screen.getByRole("button", { name: "Dołącz do grupy" }));
  expect((await screen.findByRole("alert")).textContent).toContain(expected);
  expect((screen.getByLabelText("Kod grupy") as HTMLInputElement).value).toBe("entered-code");
});

it("opens group details by name and requires confirmation before leaving", async () => {
  memberships = [group];
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (options?.method === "DELETE") { memberships = []; return new Response(null, { status: 204 }); }
    return read(path);
  });
  renderPage();
  fireEvent.click(await screen.findByRole("link", { name: "Python" }));
  expect(await screen.findByRole("heading", { name: "Python", level: 1 })).toBeTruthy();
  fireEvent.click(await screen.findByRole("button", { name: "Opuść grupę" }));
  expect(screen.getByRole("dialog", { name: "Opuść grupę" })).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź opuszczenie" }));
  expect(await screen.findByText("Opuszczono grupę.")).toBeTruthy();
  expect(await screen.findByText("Nie należysz jeszcze do żadnej grupy")).toBeTruthy();
});

it("recovers from a load error", async () => {
  vi.mocked(apiFetch).mockImplementation(async path => path.startsWith("/student/tasks?") ? read(path) : new Response(null, { status: 500 }));
  renderPage();
  expect(await screen.findByRole("alert")).toBeTruthy();
  vi.mocked(apiFetch).mockImplementation(async path => read(path));
  fireEvent.click(screen.getByRole("button", { name: "Odśwież grupy" }));
  expect(await screen.findByText("Nie należysz jeszcze do żadnej grupy")).toBeTruthy();
});
