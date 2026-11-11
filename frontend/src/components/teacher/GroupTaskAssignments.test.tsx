import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, within, waitFor } from "@testing-library/react";
import GroupTaskAssignments from "./GroupTaskAssignments";
import { apiFetch } from "../../api/client";

vi.mock("../../api/client", () => ({ apiFetch: vi.fn() }));
const retrySession = vi.fn();
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession }) }));
const task = { task_id: 15, title: "Pętle", topic: "Python", difficulty: "EASY", is_archived: false, student_count: 8, created_at: "2026-11-09T10:00:00Z" };
beforeEach(() => { vi.resetAllMocks(); vi.mocked(apiFetch).mockResolvedValue(Response.json([task])); });
afterEach(cleanup);

it("previews the saved deadline and starts editing from its local date", async () => {
  const deadline = "2030-11-20T15:30:00Z";
  vi.mocked(apiFetch).mockResolvedValue(Response.json([{ ...task, deadline }]));
  const { container } = render(<GroupTaskAssignments groupId={7} revision={0} onAssign={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edytuj termin: Pętle" }));
  expect(container.querySelector("time")?.getAttribute("datetime")).toBe(deadline);
  const date = new Date(deadline);
  const localValue = new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  const input = screen.getByLabelText("Termin wykonania") as HTMLInputElement;
  expect(input.value).toBe(localValue);
  fireEvent.click(screen.getByRole("button", { name: "Wybierz datę: Termin wykonania" }));
  expect(screen.getByText("listopad 2030")).toBeTruthy();
  const checkbox = screen.getByRole("checkbox", { name: "Bez terminu (usuń termin)" });
  fireEvent.click(checkbox);
  expect(input.disabled).toBe(true);
  fireEvent.click(checkbox);
  expect(input.disabled).toBe(false);
  expect(input.value).toBe(localValue);
  fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "PATCH")).toBe(false);
});

it("adds, changes and clears the group deadline without creating assignments", async () => {
  let deadline: string | null = null;
  vi.mocked(apiFetch).mockImplementation(async (_path, options) => {
    if (options?.method === "PATCH") {
      deadline = JSON.parse(options.body as string).deadline;
      return new Response(null, { status: 204 });
    }
    return Response.json([{ ...task, deadline }]);
  });
  render(<GroupTaskAssignments groupId={7} revision={0} onAssign={vi.fn()} />);
  for (const value of ["2030-11-20T23:59", "2031-11-20T23:59", ""]) {
    fireEvent.click(await screen.findByRole("button", { name: "Edytuj termin: Pętle" }));
    const dialog = within(screen.getByRole("dialog"));
    const checkbox = dialog.getByRole("checkbox", { name: "Bez terminu (usuń termin)" }) as HTMLInputElement;
    if (checkbox.checked === Boolean(value)) fireEvent.click(checkbox);
    if (value) fireEvent.change(dialog.getByLabelText("Termin wykonania"), { target: { value } });
    fireEvent.click(dialog.getByRole("button", { name: "Zapisz termin" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(deadline).toBe(value ? new Date(value).toISOString() : null);
    await screen.findByRole("heading", { name: "Pętle" });
  }
  const patches = vi.mocked(apiFetch).mock.calls.filter(([, options]) => options?.method === "PATCH");
  expect(patches).toHaveLength(3);
  expect(patches.every(([path]) => path === "/teacher/groups/7/task-assignments/15")).toBe(true);
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("explains mixed deadlines and keeps the editor open on failure", async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json([{ ...task, deadlines_differ: true }]));
  render(<GroupTaskAssignments groupId={7} revision={0} onAssign={vi.fn()} />);
  fireEvent.click(await screen.findByRole("button", { name: "Edytuj termin: Pętle" }));
  expect(screen.getByText(/Uczniowie mają różne terminy/)).toBeTruthy();
  fireEvent.click(screen.getByRole("checkbox", { name: "Bez terminu (usuń termin)" }));
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({}, { status: 500 }));
  fireEvent.click(screen.getByRole("button", { name: "Zapisz termin" }));
  expect(await within(screen.getByRole("dialog")).findByRole("alert")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Anuluj" }));
  expect(screen.queryByRole("dialog")).toBeNull();
});

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
