import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import GroupTaskAssignments from "./GroupTaskAssignments";
import { apiFetch } from "../../api/client";

vi.mock("../../api/client", () => ({ apiFetch: vi.fn() }));
const retrySession = vi.fn();
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession }) }));
const task = { task_id: 15, title: "Pętle", topic: "Python", difficulty: "EASY", is_archived: false, student_count: 8, created_at: "2026-11-09T10:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(apiFetch).mockResolvedValue(Response.json([task])); });
afterEach(cleanup);

it("lists assigned tasks and cancels removal without a request", async () => {
  render(<GroupTaskAssignments groupId={7} revision={0} onAssign={vi.fn()} />);
  expect(await screen.findByRole("heading", { name: "Pętle" })).toBeTruthy();
  expect(screen.getByText(/Liczba przypisań: 8/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Usuń przypisanie: Pętle" }));
  expect(screen.getByRole("dialog", { name: "Usuń przypisanie zadania" })).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
  expect(apiFetch).toHaveBeenCalledTimes(1);
  expect(screen.queryByRole("dialog")).toBeNull();
});

it("removes only the confirmed task and refreshes the list", async () => {
  render(<GroupTaskAssignments groupId={7} revision={0} onAssign={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Usuń przypisanie: Pętle" }));
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValue(Response.json([]));
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź usunięcie przypisania" }));
  expect(await screen.findByText("Przypisanie zadania do grupy zostało usunięte.")).toBeTruthy();
  expect(await screen.findByText("Nie przypisano jeszcze zadań tej grupie.")).toBeTruthy();
  expect(vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "DELETE")?.[0]).toBe("/teacher/groups/7/task-assignments/15");
});

it("keeps the assignment visible after a failed removal and allows retry", async () => {
  render(<GroupTaskAssignments groupId={7} revision={0} onAssign={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Usuń przypisanie: Pętle" }));
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({}, { status: 500 }));
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź usunięcie przypisania" }));
  const dialog = within(screen.getByRole("dialog"));
  expect(await dialog.findByRole("alert")).toBeTruthy();
  expect(screen.getByRole("heading", { name: "Pętle" })).toBeTruthy();
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 204 })).mockResolvedValue(Response.json([]));
  fireEvent.click(dialog.getByRole("button", { name: "Potwierdź usunięcie przypisania" }));
  expect(await screen.findByText("Nie przypisano jeszcze zadań tej grupie.")).toBeTruthy();
});

it("refreshes assignments after a new task is assigned", async () => {
  const view = render(<GroupTaskAssignments groupId={7} revision={0} onAssign={vi.fn()} />);
  await screen.findByRole("heading", { name: "Pętle" });
  vi.mocked(apiFetch).mockResolvedValue(Response.json([task, { ...task, task_id: 16, title: "Listy" }]));
  view.rerender(<GroupTaskAssignments groupId={7} revision={1} onAssign={vi.fn()} />);
  expect(await screen.findByRole("heading", { name: "Listy" })).toBeTruthy();
});
