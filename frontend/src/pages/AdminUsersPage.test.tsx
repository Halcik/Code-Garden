import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render as renderView, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ReactElement } from "react";
import type { User } from "../api/auth";
import * as api from "../api/admin";
import AdminUsersPage from "./AdminUsersPage";

function render(ui: ReactElement) {
  return renderView(<MemoryRouter initialEntries={["/admin"]}>{ui}</MemoryRouter>);
}

vi.mock("../api/admin", async importOriginal => ({
  ...await importOriginal<typeof import("../api/admin")>(),
  listUsers: vi.fn(), getUser: vi.fn(), changeUserStatus: vi.fn(), updateUser: vi.fn(),
}));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => ({ user: { id: 99, login: "admin" }, retrySession: vi.fn() }) }));
vi.mock("../components/ThemeSwitch", () => ({ default: () => null }));
vi.mock("../components/LogoutButton", () => ({ default: () => <button>Wyloguj się</button> }));
vi.mock("../components/admin/DesignIcon", () => ({ default: () => null }));

const teacher: User = { id: 1, login: "teacher", email: "teacher@example.com", role: "TEACHER", status: "ACTIVE", teacher_approval: "PENDING", created_at: "2026-10-15T10:00:00Z" };
const response = { items: [teacher], total: 1, limit: 25, offset: 0 };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.listUsers).mockResolvedValue(response);
  vi.mocked(api.getUser).mockResolvedValue(teacher);
});
afterEach(cleanup);

it("searches across users, preserves filters and clears the search", async () => {
  render(<AdminUsersPage />);
  await screen.findByRole("table");
  fireEvent.change(screen.getByLabelText("Rola"), { target: { value: "TEACHER" } });
  fireEvent.change(screen.getByLabelText("Szukaj użytkownika"), { target: { value: " teacher@example.com " } });
  await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith(
    { role: "TEACHER", q: "teacher@example.com", offset: 0 }, expect.any(AbortSignal)));
  fireEvent.change(screen.getByLabelText("Szukaj użytkownika"), { target: { value: "" } });
  await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith(
    { role: "TEACHER", q: undefined, offset: 0 }, expect.any(AbortSignal)));
});

it.each(["Odznacz użytkownika teacher", "Zamknij szczegóły"])("clears selection using %s", async name => {
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  await screen.findByRole("region", { name: "teacher" });
  fireEvent.click(screen.getByRole("button", { name }));
  expect(screen.queryByRole("region", { name: "teacher" })).toBeNull();
  expect(screen.getByRole("button", { name: "Otwórz użytkownika teacher" }).getAttribute("aria-pressed")).toBe("false");
  expect(screen.getByText(/Wybierz „Otwórz”/)).toBeTruthy();
});

it("can close details while loading and ignores the late response", async () => {
  let resolveDetail!: (user: User) => void;
  vi.mocked(api.getUser).mockImplementation(() => new Promise(resolve => { resolveDetail = resolve; }));
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  expect(await screen.findByText("Ładowanie danych konta…")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Zamknij szczegóły" }));
  resolveDetail(teacher);
  await waitFor(() => expect(screen.queryByText("Ładowanie danych konta…")).toBeNull());
  expect(screen.queryByRole("region", { name: "teacher" })).toBeNull();
  expect(screen.getByRole("button", { name: "Otwórz użytkownika teacher" }).getAttribute("aria-pressed")).toBe("false");
});

it("loads users and sends role, status and approval filters to the API", async () => {
  render(<AdminUsersPage />);
  const table = await screen.findByRole("table");
  expect(within(table).getByText("teacher@example.com")).toBeTruthy();
  fireEvent.change(screen.getByLabelText("Rola"), { target: { value: "TEACHER" } });
  fireEvent.change(screen.getByLabelText("Status konta"), { target: { value: "INACTIVE" } });
  fireEvent.change(screen.getByLabelText("Akceptacja nauczyciela"), { target: { value: "PENDING" } });
  await waitFor(() => expect(api.listUsers).toHaveBeenLastCalledWith({ role: "TEACHER", status: "INACTIVE", teacher_approval: "PENDING", offset: 0 }, expect.any(AbortSignal)));
});

it("loads details, approves teacher and refreshes list with feedback", async () => {
  vi.mocked(api.changeUserStatus).mockResolvedValue({ ...teacher, teacher_approval: "APPROVED" });
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  fireEvent.click(await screen.findByRole("button", { name: "Zatwierdź nauczyciela" }));
  await waitFor(() => expect(api.changeUserStatus).toHaveBeenCalledWith(1, "approve-teacher"));
  expect(await screen.findByText("teacher: Nauczyciel został zaakceptowany.")).toBeTruthy();
  await waitFor(() => expect(api.listUsers).toHaveBeenCalledTimes(2));
  expect(screen.queryByRole("button", { name: "Zatwierdź nauczyciela" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Odrzuć nauczyciela" })).toBeNull();
  expect(screen.queryByText("Dostęp nauczyciela wymaga aktywnego konta i akceptacji administratora.")).toBeNull();
  expect(screen.getByRole("button", { name: "Cofnij zatwierdzenie" })).toBeTruthy();
});

it("revokes approval and shows the pending approval actions again", async () => {
  vi.mocked(api.getUser).mockResolvedValue({ ...teacher, teacher_approval: "APPROVED" });
  vi.mocked(api.changeUserStatus).mockResolvedValue(teacher);
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  fireEvent.click(await screen.findByRole("button", { name: "Cofnij zatwierdzenie" }));
  await waitFor(() => expect(api.changeUserStatus).toHaveBeenCalledWith(1, "revoke-teacher"));
  expect(await screen.findByRole("button", { name: "Zatwierdź nauczyciela" })).toBeTruthy();
  expect(screen.getByText("Dostęp nauczyciela wymaga aktywnego konta i akceptacji administratora.")).toBeTruthy();
  expect(screen.queryByRole("button", { name: "Cofnij zatwierdzenie" })).toBeNull();
});

it.each(["deactivate", "reject-teacher"] as const)("sends %s action from user details", async action => {
  vi.mocked(api.changeUserStatus).mockResolvedValue({ ...teacher, status: action === "deactivate" ? "INACTIVE" : "ACTIVE", teacher_approval: action === "reject-teacher" ? "REJECTED" : "PENDING" });
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  fireEvent.click(await screen.findByRole("button", { name: action === "deactivate" ? "Dezaktywuj konto" : "Odrzuć nauczyciela" }));
  await waitFor(() => expect(api.changeUserStatus).toHaveBeenCalledWith(1, action));
});

it("activates an account without approving a pending teacher", async () => {
  vi.mocked(api.getUser).mockResolvedValue({ ...teacher, status: "INACTIVE" });
  vi.mocked(api.changeUserStatus).mockResolvedValue(teacher);
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  fireEvent.click(await screen.findByRole("button", { name: "Aktywuj konto" }));
  await waitFor(() => expect(api.changeUserStatus).toHaveBeenCalledWith(1, "activate"));
  const details = screen.getByRole("region", { name: "teacher" });
  expect(within(details).getByText("Oczekuje na akceptację")).toBeTruthy();
});

it("edits identity without sending role or status", async () => {
  vi.mocked(api.updateUser).mockResolvedValue({ ...teacher, login: "updated" });
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  fireEvent.click(await screen.findByRole("button", { name: "Edytuj dane konta" }));
  fireEvent.change(screen.getByLabelText("Login"), { target: { value: "updated" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz dane" }));
  await waitFor(() => expect(api.updateUser).toHaveBeenCalledWith(1, { login: "updated", email: teacher.email }));
});

it("shows empty state", async () => {
  vi.mocked(api.listUsers).mockResolvedValue({ ...response, items: [], total: 0 });
  render(<AdminUsersPage />);
  expect(await screen.findByText("Brak użytkowników pasujących do filtrów.")).toBeTruthy();
});

it("shows list error and supports retry", async () => {
  vi.mocked(api.listUsers).mockRejectedValueOnce(new Error("Brak połączenia"));
  render(<AdminUsersPage />);
  expect(await screen.findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Spróbuj ponownie" }));
  expect(await screen.findByRole("table")).toBeTruthy();
});

it("shows action error without changing the selected user's status", async () => {
  vi.mocked(api.changeUserStatus).mockRejectedValue(new Error("Nie udało się zapisać"));
  render(<AdminUsersPage />);
  fireEvent.click(await screen.findByRole("button", { name: "Otwórz użytkownika teacher" }));
  fireEvent.click(await screen.findByRole("button", { name: "Zatwierdź nauczyciela" }));
  expect((await screen.findByRole("alert")).textContent).toBe("Nie udało się zapisać");
  expect(api.listUsers).toHaveBeenCalledOnce();
});
