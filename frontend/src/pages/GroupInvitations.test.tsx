import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { apiFetch } from "../api/client";
import GroupInvitationsDialog from "../components/teacher/GroupInvitationsDialog";
import GroupCodePanel from "../components/teacher/GroupCodePanel";
import GroupMembers from "../components/teacher/GroupMembers";
import type { Group } from "../api/groups";

const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
const group: Group = { id: 7, name: "Python", description: null, age_range: null, teacher_id: 1,
  created_at: "2026-11-09T10:00:00Z", student_count: 0, pending_invitation_count: 0,
  achievements_enabled: true, study_streak_enabled: false };
const invitation = { id: 9, group_id: 7, group_name: "Python", teacher_login: "teacher", student_id: 3, student_login: "student", status: "PENDING", created_at: "2026-11-09T10:00:00Z" };
const changed = vi.fn();
beforeEach(() => { vi.resetAllMocks(); });
afterEach(() => { cleanup(); vi.useRealTimers(); });

it("does not search until a login is entered and sends an invitation to the selected student", async () => {
  vi.mocked(apiFetch).mockImplementation(async (path, options) => Response.json(path.includes("/students/search?")
    ? [{ id: 3, login: "student" }] : options?.method === "POST" ? invitation : []));
  render(<GroupInvitationsDialog group={group} onClose={vi.fn()} onChanged={changed} />);
  await screen.findByText("Brak oczekujących zaproszeń.");
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.includes("/students/search"))).toBe(false);
  expect((screen.getByRole("button", { name: "Szukaj ucznia" }) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.change(screen.getByLabelText("Login ucznia"), { target: { value: " student " } });
  fireEvent.click(screen.getByRole("button", { name: "Szukaj ucznia" }));
  fireEvent.click(await screen.findByRole("radio", { name: "student" }));
  fireEvent.click(screen.getByRole("button", { name: "Wyślij zaproszenie" }));
  expect(await screen.findByText("Zaproszenie do grupy zostało wysłane do student.")).toBeTruthy();
  const post = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(post[0]).toBe("/teacher/groups/7/invitations");
  expect(JSON.parse(post[1]!.body as string)).toEqual({ login: "student" });
  expect(changed).toHaveBeenCalledOnce();
});

it.each(["Student already belongs to this group", "Student already has a pending invitation"])("explains invite conflict: %s", async detail => {
  vi.mocked(apiFetch).mockImplementation(async (path, options) => options?.method === "POST"
    ? Response.json({ detail }, { status: 409 }) : Response.json(path.includes("/students/search?") ? [{ id: 3, login: "student" }] : []));
  render(<GroupInvitationsDialog group={group} onClose={vi.fn()} onChanged={changed} />);
  fireEvent.change(screen.getByLabelText("Login ucznia"), { target: { value: "student" } });
  fireEvent.click(screen.getByRole("button", { name: "Szukaj ucznia" }));
  fireEvent.click(await screen.findByRole("radio", { name: "student" }));
  fireEvent.click(screen.getByRole("button", { name: "Wyślij zaproszenie" }));
  expect((await screen.findByRole("alert")).textContent).toContain(detail.includes("belongs") ? "Uczeń już należy" : "oczekujące zaproszenie");
  expect(changed).not.toHaveBeenCalled();
});

it("cancels a pending invitation", async () => {
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => options?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json([invitation]));
  render(<GroupInvitationsDialog group={group} onClose={vi.fn()} onChanged={changed} />);
  fireEvent.click(await screen.findByRole("button", { name: "Anuluj zaproszenie student" }));
  expect(await screen.findByText("Zaproszenie zostało anulowane.")).toBeTruthy();
  expect(changed).toHaveBeenCalledOnce();
});

it("generates a code only after clicking and submitting validity, then copies it", async () => {
  const clipboard = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: clipboard } });
  const generated = { code: "secure-random-code", created_at: "2026-11-09T10:00:00Z", expires_at: "2099-11-09T12:00:00Z" };
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => Response.json(options?.method === "POST" ? generated : null));
  render(<GroupCodePanel groupId={7} />);
  await screen.findByText("Ta grupa nie ma jeszcze kodu zaproszenia.");
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
  fireEvent.click(screen.getByRole("button", { name: "Wygeneruj kod" }));
  const dialog = screen.getByRole("dialog", { name: "Wygeneruj kod zaproszenia" });
  fireEvent.change(within(dialog).getByLabelText("Czas ważności"), { target: { value: "2" } });
  fireEvent.change(within(dialog).getByLabelText("Jednostka"), { target: { value: "hours" } });
  fireEvent.click(within(dialog).getByRole("button", { name: "Generuj kod" }));
  expect(await screen.findByText(generated.code)).toBeTruthy();
  expect(screen.queryByRole("dialog")).toBeNull();
  const post = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(JSON.parse(post[1]!.body as string)).toEqual({ value: 2, unit: "hours" });
  fireEvent.click(screen.getByRole("button", { name: "Kopiuj kod" }));
  await waitFor(() => expect(clipboard).toHaveBeenCalledWith(generated.code));
});

it("marks an expired code and offers regeneration without automatically creating a code", async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ code: "expired-code", created_at: "2000-01-01T00:00:00Z", expires_at: "2000-01-02T00:00:00Z" }));
  render(<GroupCodePanel groupId={7} />);
  expect(await screen.findByText("Kod wygasł. Wygeneruj nowy kod.")).toBeTruthy();
  expect((screen.getByRole("button", { name: "Kopiuj kod" }) as HTMLButtonElement).disabled).toBe(true);
  expect(screen.getByRole("button", { name: "Wygeneruj nowy kod" })).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("loads members and removes one only after confirmation", async () => {
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => options?.method === "DELETE" ? new Response(null, { status: 204 }) : Response.json([{ id: 3, login: "student" }]));
  render(<GroupMembers group={group} onInvite={vi.fn()} onChanged={changed} />);
  fireEvent.click(await screen.findByRole("button", { name: "Usuń ucznia student" }));
  expect(screen.getByRole("dialog", { name: "Usuń ucznia z grupy" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Usuń ucznia" }));
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("Grupa nie ma jeszcze członków.")).toBeTruthy();
  expect(changed).toHaveBeenCalledOnce();
});
