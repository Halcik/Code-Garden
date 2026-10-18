import { afterEach, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import TaskTests from "./TaskTests";
import { testRequest } from "../../api/taskTests";
import type { TaskTest } from "../../api/taskTests";
vi.mock("../../api/taskTests", () => ({ testRequest: vi.fn() }));
vi.mock("../../auth/AuthProvider", () => ({ useAuth: () => ({ retrySession: vi.fn() }) }));
vi.mock("./EditorIcon", () => ({ default: () => <span /> }));
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.mocked(testRequest).mockReset(); });

it("sorts through the real keyboard sensor only from the grip and saves one reorder", async () => {
  // jsdom supplies no layout. Give the real dnd-kit collision detector two rows.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const row = this.closest(".editor-test-row");
    const index = row ? [...row.parentElement!.children].indexOf(row) : 0;
    const top = index * 100;
    return { x: 0, y: top, top, bottom: top + 80, left: 0, right: 500, width: 500, height: 80, toJSON: () => ({}) };
  });
  const items: TaskTest[] = [1, 2].map(id => ({ id, task_id: 7, position: id, name: `Test ${id}`, test_type: "INPUT_OUTPUT", config: { input_data: "", expected_output: "5" }, is_hidden: false, created_at: "", updated_at: "" }));
  vi.mocked(testRequest).mockResolvedValue(items);
  render(<TaskTests taskId="7" readOnly={false} />);
  const grip = await screen.findByRole("button", { name: "Przenieś test Test 1" });
  fireEvent.keyDown(screen.getByText("Test 1", { selector: "strong" }), { code: "Space" });
  expect(grip.getAttribute("aria-pressed")).not.toBe("true");
  grip.focus(); fireEvent.keyDown(grip, { code: "Space" });
  await waitFor(() => expect(grip.getAttribute("aria-pressed")).toBe("true"));
  // KeyboardSensor attaches its document listeners after activation.
  await new Promise(resolve => setTimeout(resolve, 0));
  fireEvent.keyDown(document, { code: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("over droppable area 2"));
  vi.mocked(testRequest).mockResolvedValueOnce(undefined).mockResolvedValue([items[1], items[0]].map((item, index) => ({ ...item, position: index + 1 })));
  fireEvent.keyDown(document, { code: "Space" });
  await waitFor(() => expect(testRequest).toHaveBeenCalledWith("7", "/reorder", "PATCH", { test_ids: [2, 1] }));
  expect(vi.mocked(testRequest).mock.calls.filter(call => call[2] === "PATCH")).toHaveLength(1);
  await waitFor(() => expect([...document.querySelectorAll(".editor-test-row strong")].map(node => node.textContent)).toEqual(["Test 2", "Test 1"]));
});

it("sorts local drafts without any network request", async () => {
  // jsdom supplies no layout. Give the real dnd-kit collision detector two rows.
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
    const row = this.closest(".editor-test-row");
    const index = row ? [...row.parentElement!.children].indexOf(row) : 0;
    const top = index * 100;
    return { x: 0, y: top, top, bottom: top + 80, left: 0, right: 500, width: 500, height: 80, toJSON: () => ({}) };
  });
  const onDraftChange = vi.fn();
  render(<TaskTests readOnly={false} onDraftChange={onDraftChange} />);
  for (const name of ["Test 1", "Test 2"]) {
    fireEvent.click(screen.getByRole("button", { name: "Dodaj przypadek testowy" }));
    fireEvent.change(screen.getByLabelText("Nazwa testu"), { target: { value: name } });
    fireEvent.change(screen.getByLabelText("Oczekiwany output"), { target: { value: "5" } });
    fireEvent.submit(screen.getByRole("form"));
  }
  const grip = await screen.findByRole("button", { name: "Przenieś test Test 1" });
  fireEvent.keyDown(screen.getByText("Test 1", { selector: "strong" }), { code: "Space" });
  expect(grip.getAttribute("aria-pressed")).not.toBe("true");
  grip.focus(); fireEvent.keyDown(grip, { code: "Space" });
  await waitFor(() => expect(grip.getAttribute("aria-pressed")).toBe("true"));
  // KeyboardSensor attaches its document listeners after activation.
  await new Promise(resolve => setTimeout(resolve, 0));
  fireEvent.keyDown(document, { code: "ArrowDown" });
  await waitFor(() => expect(screen.getByRole("status").textContent).toContain("over droppable area -2"));
  fireEvent.keyDown(document, { code: "Space" });
  expect(testRequest).not.toHaveBeenCalled();
  expect(onDraftChange.mock.lastCall?.[0].map((item: { name: string }) => item.name)).toEqual(["Test 2", "Test 1"]);
  await waitFor(() => expect([...document.querySelectorAll(".editor-test-row strong")].map(node => node.textContent)).toEqual(["Test 2", "Test 1"]));
});
