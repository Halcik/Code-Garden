import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import TaskFormPage from "./TaskFormPage";
import { apiFetch } from "../api/client";

const auth = vi.hoisted(() => ({ retrySession: vi.fn() }));
vi.mock("../api/client", () => ({ apiFetch: vi.fn() }));
vi.mock("../auth/AuthProvider", () => ({ useAuth: () => auth }));
vi.mock("../components/PythonCodeEditor", () => ({ default: () => <div /> }));
vi.mock("../components/teacher/EditorIcon", () => ({ default: () => <span /> }));
afterEach(() => { cleanup(); vi.mocked(apiFetch).mockReset(); });
const change = (label: string, value: string) => fireEvent.change(screen.getByLabelText(label), { target: { value } });
function open() {
  render(<MemoryRouter initialEntries={["/teacher/tasks/new"]}><Routes>
    <Route path="/teacher/tasks/new" element={<TaskFormPage />} />
    <Route path="/teacher/tasks" element={<p>Lista zadań</p>} />
  </Routes></MemoryRouter>);
  change("Tytuł", "New task"); change("Temat", "Python");
  change("Poziom trudności", "EASY"); change("Typ zadania", "STANDARD");
}
function addHint(title: string) {
  fireEvent.click(screen.getByRole("button", { name: "Dodaj podpowiedź" }));
  const form = screen.getByRole("form", { name: "Nowa podpowiedź" });
  fireEvent.change(within(form).getByLabelText("Tytuł"), { target: { value: title } });
  change("Treść podpowiedzi", "Think"); fireEvent.submit(form);
}
function addTest() {
  fireEvent.click(screen.getByRole("button", { name: "Dodaj przypadek testowy" }));
  change("Nazwa testu", "Example"); change("Oczekiwany output", "5\n");
  fireEvent.submit(screen.getByRole("form", { name: "Nowy przypadek testowy" }));
}
it("prepares, edits and removes children locally then sends everything in one create request", async () => {
  vi.mocked(apiFetch).mockResolvedValue(Response.json({ id: 7 }));
  open(); addTest(); addHint("Direction"); addHint("Remove me");
  const first = screen.getByText("Podpowiedź 1 · Direction").closest(".editor-hint-row") as HTMLElement;
  fireEvent.click(within(first).getByRole("button", { name: "Edytuj" }));
  change("Treść podpowiedzi", "Changed"); fireEvent.submit(screen.getByRole("form", { name: "Edycja podpowiedzi" }));
  const second = screen.getByText("Podpowiedź 2 · Remove me").closest(".editor-hint-row") as HTMLElement;
  vi.spyOn(window, "confirm").mockReturnValue(true);
  fireEvent.click(within(second).getByRole("button", { name: "Usuń" }));
  expect(apiFetch).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  await screen.findByText("Lista zadań");
  expect(apiFetch).toHaveBeenCalledTimes(1);
  const [path, options] = vi.mocked(apiFetch).mock.calls[0];
  expect(path).toBe("/teacher/tasks"); expect(options?.method).toBe("POST");
  expect(JSON.parse(options!.body as string)).toMatchObject({
    title: "New task",
    tests: [{ name: "Example", test_type: "INPUT_OUTPUT", config: { input_data: "", expected_output: "5\n" }, is_hidden: false }],
    hints: [{ title: "Direction", content: "Changed" }],
  });
  vi.mocked(window.confirm).mockRestore();
});
it("keeps drafts after a failed create and permits retry", async () => {
  vi.mocked(apiFetch).mockResolvedValueOnce(Response.json({}, { status: 500 })).mockResolvedValueOnce(Response.json({ id: 7 }));
  open(); addHint("Direction"); addTest();
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  await screen.findByRole("alert");
  await waitFor(() => expect((screen.getByRole("button", { name: "Utwórz zadanie" }) as HTMLButtonElement).disabled).toBe(false));
  expect(screen.getByText("Podpowiedź 1 · Direction")).toBeTruthy(); expect(screen.getByText("Example")).toBeTruthy();
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  await screen.findByText("Lista zadań");
  expect(vi.mocked(apiFetch).mock.calls[1][1]?.body).toBe(vi.mocked(apiFetch).mock.calls[0][1]?.body);
});
it("prevents creation from silently discarding an unfinished child form", async () => {
  open(); fireEvent.click(screen.getByRole("button", { name: "Dodaj podpowiedź" }));
  fireEvent.click(screen.getByRole("button", { name: "Utwórz zadanie" }));
  expect(await screen.findByRole("alert")).toBeTruthy(); expect(apiFetch).not.toHaveBeenCalled();
  expect(screen.getByRole("form", { name: "Nowa podpowiedź" })).toBeTruthy();
});
