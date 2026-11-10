import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import TaskAssignments from "./TaskAssignments";
import { apiFetch } from "../../api/client";

vi.mock("../../api/client", () => ({ apiFetch: vi.fn() }));
const retrySession = vi.fn();
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession }) }));
const assignment = { id: 1, task_id: 7, student_id: 3, student_login: "uczen", assigned_by_teacher_id: 2, group_id: null, group_name: null, created_at: "2026-11-09T10:00:00Z" };
let assigned = false;
beforeEach(() => {
  assigned = false; vi.resetAllMocks();
  vi.mocked(apiFetch).mockImplementation(async (path, options) => {
    if (path === "/teacher/groups") return Response.json([{ id: 4, name: "Python", student_count: 2 }]);
    if (path.startsWith("/teacher/assignment-students?")) return Response.json([{ id: 3, login: "uczen" }]);
    if (options?.method === "POST") {
      assigned = true;
      return Response.json(path.endsWith("group-assignments") ? { total_students: 2, assigned_count: 1, already_assigned_count: 1 } : assignment);
    }
    return Response.json(assigned ? [assignment] : []);
  });
});
afterEach(cleanup);

it.each([null, 42])("revokes an owned source including a deleted group source %s", async sourceGroupId => {
  const original = vi.mocked(apiFetch).getMockImplementation()!;
  vi.mocked(apiFetch).mockImplementation((path, options) => path.endsWith("/assignments") && options?.method !== "POST"
    ? Promise.resolve(Response.json([{ ...assignment, source_group_id: sourceGroupId }])) : original(path, options));
  await open(false);
  const table = screen.getByRole("table", { name: "Uczniowie z przypisanym zadaniem" });
  expect(within(table).getByText(sourceGroupId ? "Usunięta grupa #42" : "Bezpośrednio")).toBeTruthy();
  fireEvent.click(within(table).getByRole("button", { name: "Cofnij przypisanie: uczen, źródło 1" }));
  fireEvent.click(screen.getByRole("button", { name: "Anuluj cofnięcie" }));
  expect(vi.mocked(apiFetch).mock.calls.some(([, options]) => options?.method === "DELETE")).toBe(false);
  fireEvent.click(within(table).getByRole("button", { name: "Cofnij przypisanie: uczen, źródło 1" }));
  vi.mocked(apiFetch).mockResolvedValueOnce(new Response(null, { status: 204 }));
  fireEvent.click(screen.getByRole("button", { name: "Potwierdź cofnięcie" }));
  expect(await screen.findByText("Cofnięto wybrane źródło przypisania. Pozostałe źródła i rozwiązania są zachowane.")).toBeTruthy();
  expect(screen.queryByRole("table", { name: "Uczniowie z przypisanym zadaniem" })).toBeNull();
  expect(vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "DELETE")?.[0]).toBe("/teacher/tasks/7/assignments/1");
});
async function open(available = true) {
  const result = render(<TaskAssignments taskId="7" available={available} />);
  fireEvent.click(screen.getByRole("button", { name: "Pokaż przypisania" }));
  await screen.findByRole("option", { name: "Python" });
  return result;
}

it("searches only teacher group members and assigns a selected student", async () => {
  await open();
  await screen.findByRole("radio", { name: "Wybierz ucznia: uczen" });
  fireEvent.change(screen.getByLabelText("Szukaj ucznia w swoich grupach"), { target: { value: "ucz" } });
  await waitFor(() => expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path === "/teacher/assignment-students?q=ucz")).toBe(true));
  await screen.findByRole("radio", { name: "Wybierz ucznia: uczen" });
  fireEvent.click(screen.getByRole("radio", { name: "Wybierz ucznia: uczen" }));
  fireEvent.click(screen.getByRole("button", { name: "Przypisz uczniowi" }));
  expect(await screen.findByText("Zadanie zostało przypisane uczniowi.")).toBeTruthy();
  expect(await within(screen.getByRole("table", { name: "Uczniowie z przypisanym zadaniem" })).findByRole("cell", { name: "uczen" })).toBeTruthy();
  const post = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(post[0]).toBe("/teacher/tasks/7/assignments");
  expect(JSON.parse(post[1]!.body as string)).toEqual({ student_id: 3 });
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.includes("/students/search"))).toBe(false);
});

it("shows group size and reports partial group success", async () => {
  await open();
  fireEvent.change(screen.getByLabelText("Grupa"), { target: { value: "4" } });
  expect(screen.getByText(/Liczba uczniów: 2/)).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Przypisz grupie" }));
  expect(await screen.findByText("Przypisano zadanie: 1 uczniów. Już przypisane: 1.")).toBeTruthy();
  const post = vi.mocked(apiFetch).mock.calls.find(([, options]) => options?.method === "POST")!;
  expect(post[0]).toBe("/teacher/tasks/7/group-assignments");
  expect(JSON.parse(post[1]!.body as string)).toEqual({ group_id: 4 });
});

it.each([
  [409, "Student already has this task assigned", "Uczeń ma już przypisane to zadanie."],
  [403, "Student does not belong to your groups", "Uczeń nie należy do żadnej Twojej grupy."],
  [422, "Assignment recipient must be a student", "Wybrany użytkownik nie jest uczniem."],
  [404, "Task unavailable for assignment", "Nie masz dostępu do tego zadania"],
])("shows assignment error %s without losing selection", async (status, detail, message) => {
  await open(); await screen.findByRole("radio", { name: "Wybierz ucznia: uczen" });
  fireEvent.click(screen.getByRole("radio", { name: "Wybierz ucznia: uczen" }));
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({ detail }, { status }));
  fireEvent.click(screen.getByRole("button", { name: "Przypisz uczniowi" }));
  expect((await screen.findByRole("alert")).textContent).toContain(message);
  expect((screen.getByRole("radio", { name: "Wybierz ucznia: uczen" }) as HTMLInputElement).checked).toBe(true);
});

it("retains history but disables assigning a draft or archived task", async () => {
  assigned = true;
  await open(false);
  expect(await within(screen.getByRole("table", { name: "Uczniowie z przypisanym zadaniem" })).findByRole("cell", { name: "uczen" })).toBeTruthy();
  expect((screen.getByLabelText("Grupa").closest("fieldset") as HTMLFieldSetElement).disabled).toBe(true);
  expect(vi.mocked(apiFetch).mock.calls.some(([path]) => path.startsWith("/teacher/assignment-students"))).toBe(false);
});

it("aborts a pending assignment on unmount", async () => {
  const result = await open(); await screen.findByRole("radio", { name: "Wybierz ucznia: uczen" });
  fireEvent.click(screen.getByRole("radio", { name: "Wybierz ucznia: uczen" }));
  let resolve!: (response: Response) => void;
  vi.mocked(apiFetch).mockImplementationOnce(() => new Promise(done => { resolve = done; }));
  fireEvent.click(screen.getByRole("button", { name: "Przypisz uczniowi" }));
  const signal = vi.mocked(apiFetch).mock.calls.at(-1)![1]!.signal;
  result.unmount();
  expect(signal?.aborted).toBe(true);
  await act(async () => resolve(Response.json(assignment)));
  expect(retrySession).not.toHaveBeenCalled();
});
