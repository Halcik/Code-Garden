import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TaskTests from "./TaskTests";
import { testRequest } from "../../api/taskTests";
vi.mock("../../api/taskTests", () => ({ testRequest: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession: vi.fn() }) }));
vi.mock("./EditorIcon", () => ({ default: () => <span /> }));
afterEach(() => { cleanup(); vi.resetAllMocks(); });
it("validates function JSON and saves parsed arguments and hidden visibility", async () => {
  vi.mocked(testRequest).mockResolvedValue([]);
  render(<TaskTests taskId="7" readOnly={false} />);
  const add = screen.getByRole("button", { name: "Dodaj przypadek testowy" });
  await waitFor(() => expect((add as HTMLButtonElement).disabled).toBe(false));
  fireEvent.click(add);
  fireEvent.change(screen.getByLabelText("Nazwa testu"), { target: { value: "Area" } });
  fireEvent.change(screen.getByLabelText("Typ testu"), { target: { value: "FUNCTION" } });
  fireEvent.change(screen.getByLabelText("Nazwa funkcji"), { target: { value: "area" } });
  fireEvent.change(screen.getByLabelText("Argumenty (tablica JSON)"), { target: { value: "{}" } });
  fireEvent.change(screen.getByLabelText("Oczekiwany wynik (JSON)"), { target: { value: "6" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz test" }));
  expect(screen.getByRole("alert").textContent).toContain("tablicą JSON");
  expect(testRequest).toHaveBeenCalledTimes(1);
  fireEvent.change(screen.getByLabelText("Argumenty (tablica JSON)"), { target: { value: "[2,3]" } });
  fireEvent.change(screen.getByLabelText("Widoczność"), { target: { value: "true" } });
  fireEvent.click(screen.getByRole("button", { name: "Zapisz test" }));
  await waitFor(() => expect(testRequest).toHaveBeenCalledWith("7", "", "POST", {
    name: "Area", test_type: "FUNCTION", is_hidden: true,
    config: { function_name: "area", arguments: [2, 3], expected_result: 6 },
  }));
});
it("shows archived tests and disables all mutations", async () => {
  vi.mocked(testRequest).mockResolvedValue([{ id: 1, task_id: 7, position: 1, name: "Example", test_type: "STRUCTURAL", config: { rule_type: "USES_FOR" }, is_hidden: false, created_at: "", updated_at: "" }]);
  render(<TaskTests taskId="7" readOnly />);
  await screen.findByText("Example");
  for (const label of ["Dodaj przypadek testowy", "Edytuj", "Usuń", "Przenieś test Example"]) {
    expect((screen.getByRole("button", { name: label }) as HTMLButtonElement).disabled).toBe(true);
  }
});
